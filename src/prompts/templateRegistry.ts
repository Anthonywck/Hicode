/**
 * 模板注册表实现
 * 
 * 负责加载、存储和查询 Prompt 模板配置
 */

import { 
  ITemplateRegistry, 
  TemplateConfig, 
  TemplateQueryOptions, 
  IntentType 
} from './types';
import { createLogger } from '../utils/logger';

/**
 * 模板注册表实现类
 * 
 * 使用 Map 存储模板，以 templateType 作为 key
 * 维护意图索引以支持快速查询
 */
export class TemplateRegistry implements ITemplateRegistry {
  private logger = createLogger('TemplateRegistry');
  
  /** 模板存储 Map，key 为 templateType */
  private templates: Map<string, TemplateConfig> = new Map();
  
  /** 意图索引，key 为 IntentType，value 为按优先级排序的模板列表 */
  private intentIndex: Map<IntentType, TemplateConfig[]> = new Map();
  
  /** 默认模板 */
  private defaultTemplate: TemplateConfig | null = null;
  
  /**
   * 构造函数
   * @param templatePath 模板配置文件路径（可选，用于从文件加载）
   */
  constructor(private readonly templatePath?: string) {
    this.logger.info('TemplateRegistry 初始化', { templatePath });
  }
  
  /**
   * 加载所有模板配置
   * 
   * 从配置文件或直接传入的模板数组加载模板
   * 构建模板存储 Map 和意图索引
   */
  async loadTemplates(): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('开始加载模板', { templatePath: this.templatePath });
      
      let templates: TemplateConfig[] = [];
      
      // 如果提供了模板路径，从文件加载
      if (this.templatePath) {
        this.logger.debug('从文件加载模板', { path: this.templatePath });
        const module = await import(this.templatePath);
        templates = module.defaultTemplates || module.default || [];
        this.logger.debug('模板文件加载完成', { templateCount: templates.length });
      }
      
      // 清空现有数据
      this.templates.clear();
      this.intentIndex.clear();
      
      // 加载模板到 Map 中
      for (const template of templates) {
        // 使用 templateType 作为 key 存储
        this.templates.set(template.templateType, template);
        this.logger.debug('加载模板', {
          templateType: template.templateType,
          name: template.name,
          intents: template.intents,
          priority: template.priority
        });
        
        // 构建意图索引
        for (const intent of template.intents) {
          if (!this.intentIndex.has(intent)) {
            this.intentIndex.set(intent, []);
          }
          this.intentIndex.get(intent)!.push(template);
        }
      }
      
      // 对每个意图的模板列表按优先级排序（降序）
      for (const [intent, templateList] of this.intentIndex.entries()) {
        templateList.sort((a, b) => b.priority - a.priority);
        this.logger.debug('意图索引构建完成', {
          intent,
          templateCount: templateList.length,
          topPriority: templateList[0]?.priority
        });
      }
      
      // 设置默认模板（查找 chat 意图的模板或第一个可用模板）
      this.setDefaultTemplate();
      
      const duration = Date.now() - startTime;
      this.logger.info('模板加载完成', {
        duration: `${duration}ms`,
        totalTemplates: this.templates.size,
        intentTypes: Array.from(this.intentIndex.keys()),
        defaultTemplate: this.defaultTemplate?.templateType
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('模板加载失败，使用回退模板', error);
      this.logger.debug('模板加载失败详情', { duration: `${duration}ms` });
      // 加载失败时使用硬编码的默认模板
      this.loadFallbackTemplate();
    }
  }
  
  /**
   * 查询模板
   * 
   * 支持多种查询模式：
   * 1. 只提供 templateType：直接返回该类型的模板
   * 2. 只提供 intent：返回该意图下优先级最高的模板
   * 3. 同时提供 intent 和 templateType：返回该意图下指定类型的模板
   * 4. 都不提供：返回 undefined
   * 
   * @param options 查询选项
   * @returns 匹配的模板或 undefined
   */
  getTemplate(options: TemplateQueryOptions): TemplateConfig | undefined {
    const { intent, templateType } = options;
    
    this.logger.debug('查询模板', { intent, templateType });
    
    // 情况1：只提供模板类型
    if (templateType && !intent) {
      const template = this.getTemplateByType(templateType);
      this.logger.debug('按模板类型查询', {
        templateType,
        found: !!template
      });
      return template;
    }
    
    // 情况2：只提供意图
    if (intent && !templateType) {
      const templates = this.getTemplatesByIntent(intent);
      const template = templates.length > 0 ? templates[0] : undefined;
      this.logger.debug('按意图查询', {
        intent,
        found: !!template,
        templateType: template?.templateType
      });
      return template;
    }
    
    // 情况3：同时提供意图和模板类型
    if (intent && templateType) {
      const template = this.getTemplateByType(templateType);
      // 验证模板是否支持该意图
      if (template && template.intents.includes(intent)) {
        this.logger.debug('按意图和模板类型查询成功', {
          intent,
          templateType
        });
        return template;
      }
      this.logger.warn('模板不支持指定意图', {
        intent,
        templateType,
        supportedIntents: template?.intents
      });
      return undefined;
    }
    
    // 情况4：都不提供
    this.logger.debug('未提供查询条件');
    return undefined;
  }
  
  /**
   * 根据意图获取所有匹配的模板列表
   * 
   * @param intent 意图类型
   * @returns 按优先级排序的模板列表（降序）
   */
  getTemplatesByIntent(intent: IntentType): TemplateConfig[] {
    return this.intentIndex.get(intent) || [];
  }
  
  /**
   * 根据模板类型获取模板
   * 
   * @param templateType 模板类型
   * @returns 模板配置或 undefined
   */
  getTemplateByType(templateType: string): TemplateConfig | undefined {
    return this.templates.get(templateType);
  }
  
  /**
   * 获取默认模板
   * 
   * @returns 默认通用模板
   */
  getDefaultTemplate(): TemplateConfig {
    if (!this.defaultTemplate) {
      // 如果没有设置默认模板，返回硬编码的最小可用模板
      return this.createMinimalTemplate();
    }
    return this.defaultTemplate;
  }
  
  /**
   * 设置默认模板
   * 
   * 优先选择 chat 意图的模板，如果没有则选择第一个可用模板
   */
  private setDefaultTemplate(): void {
    // 优先使用 chat 意图的模板
    const chatTemplates = this.getTemplatesByIntent('chat');
    if (chatTemplates.length > 0) {
      this.defaultTemplate = chatTemplates[0];
      this.logger.info('设置默认模板（chat 意图）', {
        templateType: this.defaultTemplate.templateType,
        name: this.defaultTemplate.name
      });
      return;
    }
    
    // 如果没有 chat 模板，使用第一个可用模板
    const firstTemplate = this.templates.values().next().value;
    if (firstTemplate) {
      this.defaultTemplate = firstTemplate;
      this.logger.info('设置默认模板（第一个可用）', {
        templateType: this.defaultTemplate.templateType,
        name: this.defaultTemplate.name
      });
      return;
    }
    
    // 如果没有任何模板，使用硬编码的最小模板
    this.defaultTemplate = this.createMinimalTemplate();
    this.logger.warn('使用硬编码的最小模板作为默认模板');
  }
  
  /**
   * 加载回退模板
   * 
   * 当模板加载失败时使用硬编码的最小可用模板
   */
  private loadFallbackTemplate(): void {
    this.logger.warn('加载回退模板');
    const fallbackTemplate = this.createMinimalTemplate();
    this.templates.set(fallbackTemplate.templateType, fallbackTemplate);
    this.intentIndex.set('chat', [fallbackTemplate]);
    this.defaultTemplate = fallbackTemplate;
    this.logger.info('回退模板加载完成', {
      templateType: fallbackTemplate.templateType
    });
  }
  
  /**
   * 创建最小可用模板
   * 
   * 提供一个硬编码的通用对话模板作为最后的回退选项
   * 
   * @returns 最小可用模板配置
   */
  private createMinimalTemplate(): TemplateConfig {
    return {
      templateType: 'hicode_fallback_prompt_type',
      name: '回退模板',
      description: '系统回退模板，用于模板加载失败时',
      intents: ['chat'],
      priority: 0,
      content: 'You are an AI assistant named HiCode.\nUser: ${user_query}\nAssistant:',
      slotConfig: [
        {
          name: 'user_query',
          sourcePath: 'user_query',
          defaultValue: '',
          required: true
        }
      ]
    };
  }
  
  /**
   * 直接加载模板数组（用于测试或直接注入模板）
   * 
   * @param templates 模板配置数组
   */
  loadTemplatesFromArray(templates: TemplateConfig[]): void {
    // 清空现有数据
    this.templates.clear();
    this.intentIndex.clear();
    
    // 加载模板到 Map 中
    for (const template of templates) {
      // 使用 templateType 作为 key 存储
      this.templates.set(template.templateType, template);
      
      // 构建意图索引
      for (const intent of template.intents) {
        if (!this.intentIndex.has(intent)) {
          this.intentIndex.set(intent, []);
        }
        this.intentIndex.get(intent)!.push(template);
      }
    }
    
    // 对每个意图的模板列表按优先级排序（降序）
    for (const [intent, templateList] of this.intentIndex.entries()) {
      templateList.sort((a, b) => b.priority - a.priority);
    }
    
    // 设置默认模板
    this.setDefaultTemplate();
  }
}
