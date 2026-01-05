/**
 * Prompt 管理器实现
 * 
 * 协调各组件，提供统一的接口给 Adapter 调用
 * 支持多种模式：自动模式、指定意图模式、指定模板类型模式、组合模式
 */

import { ChatMessage } from '../api/types';
import {
  IPromptManager,
  ITemplateRegistry,
  IIntentRecognizer,
  IContextCollector,
  ITemplateRenderer,
  PromptManagerOptions,
  TemplateConfig,
  IntentType
} from './types';
import { createLogger } from '../utils/logger';
import { getConfigManager } from '../extension';

/**
 * Prompt 管理器实现类
 * 
 * 功能：
 * - 协调模板注册表、意图识别器、上下文收集器、模板渲染器
 * - 支持多种使用模式（自动、指定意图、指定模板类型、组合）
 * - 提供错误处理和回退逻辑
 * - 替换 adapter 中的 enrichMessageContent 方法
 */
export class PromptManager implements IPromptManager {
  private logger = createLogger('PromptManager');
  
  constructor(
    private readonly templateRegistry: ITemplateRegistry,
    private readonly intentRecognizer: IIntentRecognizer,
    private readonly contextCollector: IContextCollector,
    private readonly templateRenderer: ITemplateRenderer
  ) {
    this.logger.info('PromptManager 初始化完成');
  }
  
  /**
   * 丰富消息内容
   * 
   * 使用模式：
   * 1. 不提供 options：自动识别意图并选择模板
   * 2. 提供 intent：跳过意图识别，使用指定意图选择模板
   * 3. 提供 templateType：直接使用指定类型的模板
   * 4. 同时提供 intent 和 templateType：使用指定意图下的指定类型模板
   * 
   * @param message 聊天消息
   * @param options 可选配置
   * @returns 丰富后的消息内容
   */
  async enrichMessageContent(message: ChatMessage, options?: PromptManagerOptions): Promise<string> {
    const startTime = Date.now();
    
    // 从配置管理器获取当前聊天模式
    let chatMode: 'chat' | 'agent' = 'chat';
    try {
      const configManager = await getConfigManager();
      chatMode = configManager.getChatMode();
    } catch (error) {
      // 如果获取配置失败，使用默认值 'chat'
      this.logger.warn('获取聊天模式配置失败，使用默认值 chat', error);
    }
    
    try {
      // 记录开始处理
      this.logger.debug('开始处理消息丰富', {
        hasOptions: !!options,
        intent: options?.intent,
        templateType: options?.templateType,
        messageLength: message.content.length,
        chatMode
      });
      
      let template: TemplateConfig | undefined;
      if (chatMode === 'chat') {
        if (!options) {
          options = {
            intent: undefined,
            templateType: 'hicode_common_chat_prompt_type'
          } as PromptManagerOptions;
        }
      }
      // 确定意图
      let intent: IntentType | undefined = options?.intent;
      if (!intent && !options?.templateType) {
        // 如果没有提供意图也没有提供模板类型，则需要识别意图
        this.logger.debug('未提供意图或模板类型，开始意图识别');
        intent = await this.intentRecognizer.recognizeIntent(message);
        this.logger.info('意图识别完成', { intent });
      } else if (options?.intent) {
        this.logger.debug('使用指定意图', { intent: options.intent });
      }
      
      // 查询模板
      if (options?.templateType || intent) {
        this.logger.debug('开始查询模板', {
          intent,
          templateType: options?.templateType
        });
        
        template = this.templateRegistry.getTemplate({
          intent,
          templateType: options?.templateType
        });
        
        if (template) {
          this.logger.info('模板查询成功', {
            templateType: template.templateType,
            templateName: template.name,
            intent
          });
        } else {
          this.logger.warn('未找到匹配的模板', {
            intent,
            templateType: options?.templateType
          });
        }
      }
      
      // 如果没有找到模板，使用默认模板
      if (!template) {
        if (options?.templateType) {
          this.logger.warn(`模板类型 ${options.templateType} 不存在，使用默认模板`);
        } else {
          this.logger.debug('使用默认模板');
        }
        template = this.templateRegistry.getDefaultTemplate();
        this.logger.info('使用默认模板', {
          templateType: template.templateType,
          templateName: template.name
        });
      }
      
      // 收集上下文数据
      this.logger.debug('开始收集上下文数据');
      const context = this.contextCollector.collectContext(message);
      this.logger.debug('上下文数据收集完成', {
        contextKeys: Object.keys(context),
        hasLanguage: !!context.language,
        hasSelection: !!context.selection,
        hasCurrentFile: !!context.current_file
      });
      
      // 渲染模板
      this.logger.debug('开始渲染模板', {
        templateType: template.templateType,
        slotCount: template.slotConfig.length
      });
      const enrichedContent = this.templateRenderer.render(template, context);
      
      const duration = Date.now() - startTime;
      this.logger.info('消息丰富完成', {
        duration: `${duration}ms`,
        outputLength: enrichedContent.length,
        templateType: template.templateType
      });
      
      // 在调试模式下输出渲染后的内容（截断）
      this.logger.debug('渲染后的内容预览', {
        preview: enrichedContent.substring(0, 200) + (enrichedContent.length > 200 ? '...' : '')
      });
      
      return enrichedContent;
    } catch (error) {
      // 错误处理：返回原始消息内容
      const duration = Date.now() - startTime;
      this.logger.error('消息丰富失败，返回原始内容', error);
      this.logger.debug('消息丰富失败详情', {
        duration: `${duration}ms`,
        messageLength: message.content.length
      });
      return message.content;
    }
  }
}
