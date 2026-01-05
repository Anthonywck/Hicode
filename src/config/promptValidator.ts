/**
 * Prompt配置验证器
 * 负责验证Prompt配置的完整性和有效性
 * 参考ModelValidator的实现模式，保持代码风格一致
 */

import { PromptConfig } from './promptManager';

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
}

/**
 * Prompt配置验证器
 */
export class PromptValidator {
  /**
   * 验证Prompt配置
   * @param config Prompt配置
   * @returns 验证结果
   */
  static validatePromptConfig(config: Partial<PromptConfig>): ValidationResult {
    const errors: string[] = [];

    // 验证必填字段（ID在添加时会自动生成，所以这里不强制要求）
    if (config.id !== undefined && config.id && config.id.trim() !== '' && !this.isValidPromptId(config.id)) {
      errors.push('Prompt ID格式无效，只能包含字母、数字、连字符和下划线');
    }

    if (!config.title || config.title.trim() === '') {
      errors.push('Prompt标题不能为空');
    }

    if (!config.prompt || config.prompt.trim() === '') {
      errors.push('Prompt内容不能为空');
    }

    // 验证标题长度
    if (config.title && config.title.length > 100) {
      errors.push('Prompt标题长度不能超过100个字符');
    }

    // 验证内容长度
    if (config.prompt && config.prompt.length > 10000) {
      errors.push('Prompt内容长度不能超过10000个字符');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证Prompt ID格式
   * @param promptId Prompt ID
   * @returns 是否为有效的Prompt ID
   */
  static isValidPromptId(promptId: string): boolean {
    // Prompt ID应该只包含字母、数字、连字符和下划线
    const promptIdRegex = /^[a-zA-Z0-9_-]+$/;
    return promptIdRegex.test(promptId);
  }

  /**
   * 验证配置更新
   * @param update 部分配置更新
   * @returns 验证结果
   */
  static validateConfigUpdate(update: Partial<PromptConfig>): ValidationResult {
    const errors: string[] = [];

    // 验证提供的字段
    if (update.id !== undefined) {
      if (update.id.trim() === '') {
        errors.push('Prompt ID不能为空');
      } else if (!this.isValidPromptId(update.id)) {
        errors.push('Prompt ID格式无效，只能包含字母、数字、连字符和下划线');
      }
    }

    if (update.title !== undefined) {
      if (update.title.trim() === '') {
        errors.push('Prompt标题不能为空');
      } else if (update.title.length > 100) {
        errors.push('Prompt标题长度不能超过100个字符');
      }
    }

    if (update.prompt !== undefined) {
      if (update.prompt.trim() === '') {
        errors.push('Prompt内容不能为空');
      } else if (update.prompt.length > 10000) {
        errors.push('Prompt内容长度不能超过10000个字符');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证并抛出错误
   * @param config Prompt配置
   * @throws 如果配置无效，抛出包含所有错误信息的错误
   */
  static validateAndThrow(config: Partial<PromptConfig>): void {
    const result = this.validatePromptConfig(config);
    if (!result.valid) {
      throw new Error(`无效的Prompt配置:\n${result.errors.join('\n')}`);
    }
  }

  /**
   * 验证更新并抛出错误
   * @param update 部分配置更新
   * @throws 如果更新无效，抛出包含所有错误信息的错误
   */
  static validateUpdateAndThrow(update: Partial<PromptConfig>): void {
    const result = this.validateConfigUpdate(update);
    if (!result.valid) {
      throw new Error(`无效的配置更新:\n${result.errors.join('\n')}`);
    }
  }
}

