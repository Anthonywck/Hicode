/**
 * 模板渲染器实现
 * 
 * 负责执行槽位替换，将上下文数据填充到模板中
 */

import { ITemplateRenderer, TemplateConfig, ContextData } from './types';
import { createLogger } from '../utils/logger';

/**
 * 模板渲染器实现类
 * 
 * 功能：
 * - 使用正则表达式匹配槽位占位符 ${slot_name}
 * - 从上下文数据中获取对应的值
 * - 支持默认值和空值处理
 * - 缓存编译后的正则表达式以提高性能
 * - 支持多重名槽位替换（同一槽位名称的多个实例）
 */
export class TemplateRenderer implements ITemplateRenderer {
  private logger = createLogger('TemplateRenderer');
  
  // 缓存编译后的正则表达式，key: 槽位名称
  private slotRegexCache: Map<string, RegExp> = new Map();
  
  constructor() {
    this.logger.info('TemplateRenderer 初始化完成');
  }
  
  /**
   * 渲染模板
   * @param template 模板配置
   * @param context 上下文数据
   * @returns 渲染后的字符串
   */
  render(template: TemplateConfig, context: ContextData): string {
    const startTime = Date.now();
    
    this.logger.debug('开始渲染模板', {
      templateType: template.templateType,
      templateName: template.name,
      slotCount: template.slotConfig.length,
      contentLength: template.content.length
    });
    
    let result = template.content;
    let replacedSlots = 0;
    
    // 遍历槽位配置，执行替换
    for (const slot of template.slotConfig) {
      // 获取或创建正则表达式
      const regex = this.getSlotRegex(slot.name);
      
      // 从上下文中获取值
      const value = this.getValueFromContext(context, slot.sourcePath, slot.defaultValue);
      
      this.logger.debug('替换槽位', {
        slotName: slot.name,
        sourcePath: slot.sourcePath,
        hasValue: !!value,
        valueLength: value.length,
        usedDefault: !context[slot.sourcePath] && !!slot.defaultValue
      });
      
      // 转义替换字符串中的特殊字符（$, &, `, ', $n）
      const escapedValue = this.escapeReplacementString(value);
      
      // 计算替换次数
      const matches = result.match(regex);
      if (matches) {
        replacedSlots += matches.length;
        this.logger.debug('槽位匹配', {
          slotName: slot.name,
          matchCount: matches.length
        });
      }
      
      // 替换所有匹配的槽位实例
      result = result.replace(regex, escapedValue);
    }
    
    const duration = Date.now() - startTime;
    this.logger.info('模板渲染完成', {
      duration: `${duration}ms`,
      replacedSlots,
      outputLength: result.length,
      templateType: template.templateType
    });
    
    return result;
  }
  
  /**
   * 获取槽位的正则表达式（带缓存）
   * 
   * 正则表达式格式：\$\{槽位名称\}
   * 使用全局标志 'g' 以替换所有实例
   * 
   * @param slotName 槽位名称
   * @returns 编译后的正则表达式
   */
  private getSlotRegex(slotName: string): RegExp {
    if (!this.slotRegexCache.has(slotName)) {
      // 转义特殊字符，避免正则表达式注入
      const escapedName = slotName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 创建全局匹配的正则表达式
      const regex = new RegExp(`\\$\\{${escapedName}\\}`, 'g');
      this.slotRegexCache.set(slotName, regex);
    }
    return this.slotRegexCache.get(slotName)!;
  }
  
  /**
   * 从上下文中获取值
   * 
   * 值解析规则：
   * 1. 如果值存在于上下文中，使用实际值
   * 2. 如果值不存在但配置了默认值，使用默认值
   * 3. 如果两者都不存在，使用空字符串
   * 
   * @param context 上下文数据
   * @param path 数据来源路径（目前直接作为 key 使用）
   * @param defaultValue 默认值（可选）
   * @returns 解析后的值
   */
  private getValueFromContext(
    context: ContextData, 
    path: string, 
    defaultValue?: string
  ): string {
    // 使用 hasOwnProperty 检查，避免访问原型链上的属性
    // 这样可以防止访问 valueOf、toString 等 Object.prototype 属性
    if (Object.prototype.hasOwnProperty.call(context, path)) {
      const value = context[path];
      // 如果值存在且不为 null/undefined，返回字符串形式
      if (value !== undefined && value !== null) {
        return String(value);
      }
    }
    
    // 如果值不存在但有默认值（且默认值不为 null/undefined），返回默认值
    if (defaultValue !== undefined && defaultValue !== null) {
      return defaultValue;
    }
    
    // 两者都不存在，返回空字符串
    return '';
  }
  
  /**
   * 转义替换字符串中的特殊字符
   * 
   * String.replace() 将以下字符序列视为特殊替换模式：
   * - $$: 插入一个 "$"
   * - $&: 插入匹配的子串
   * - $`: 插入匹配子串之前的字符串
   * - $': 插入匹配子串之后的字符串
   * - $n: 插入第 n 个捕获组
   * 
   * 为了将这些字符作为字面值使用，需要将 $ 转义为 $$
   * 
   * @param str 要转义的字符串
   * @returns 转义后的字符串
   */
  private escapeReplacementString(str: string): string {
    // 安全检查：如果 str 为 null 或 undefined，返回空字符串
    if (str === null || str === undefined) {
      return '';
    }
    return str.replace(/\$/g, '$$$$');
  }
}
