/**
 * 模型配置验证器
 * 负责验证模型配置的完整性和有效性
 */

import { ModelConfig } from '../api/types';

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
 * 模型配置验证器
 */
export class ModelValidator {
  /**
   * 验证模型配置
   * @param config 模型配置
   * @returns 验证结果
   */
  static validateModelConfig(config: Partial<ModelConfig>): ValidationResult {
    const errors: string[] = [];

    // 验证必填字段
    if (!config.modelId || config.modelId.trim() === '') {
      errors.push('Model ID is required');
    }

    if (!config.modelName || config.modelName.trim() === '') {
      errors.push('Model name is required');
    }

    if (!config.displayName || config.displayName.trim() === '') {
      errors.push('Display name is required');
    }

    if (!config.vendor) {
      errors.push('Vendor is required');
    } else if (!['deepseek', 'openai', 'zhipuai', 'custom'].includes(config.vendor)) {
      errors.push('Vendor must be one of: deepseek, openai, zhipuai, custom');
    }

    if (!config.apiKey || config.apiKey.trim() === '') {
      errors.push('API key is required');
    }

    // if (!config.apiBaseUrl || config.apiBaseUrl.trim() === '') {
    //   errors.push('API base URL is required');
    // } else if (!this.isValidUrl(config.apiBaseUrl)) {
    //   errors.push('API base URL must be a valid URL');
    // }

    // if (config.maxContextTokens === undefined || config.maxContextTokens === null) {
    //   errors.push('Max context tokens is required');
    // } else if (typeof config.maxContextTokens !== 'number' || config.maxContextTokens <= 0) {
    //   errors.push('Max context tokens must be a positive number');
    // }

    if (config.supportMultimodal === undefined || config.supportMultimodal === null) {
      errors.push('Support multimodal flag is required');
    } else if (typeof config.supportMultimodal !== 'boolean') {
      errors.push('Support multimodal must be a boolean');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证URL格式
   * @param url URL字符串
   * @returns 是否为有效URL
   */
  private static isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      // 只允许http和https协议
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * 验证模型ID格式
   * @param modelId 模型ID
   * @returns 是否为有效的模型ID
   */
  static isValidModelId(modelId: string): boolean {
    // 模型ID应该只包含字母、数字、连字符和下划线
    const modelIdRegex = /^[a-zA-Z0-9_-]+$/;
    return modelIdRegex.test(modelId);
  }

  /**
   * 验证API密钥格式
   * @param apiKey API密钥
   * @returns 是否为有效的API密钥
   */
  static isValidApiKey(apiKey: string): boolean {
    // API密钥不应该为空，且长度应该合理
    return apiKey.trim().length >= 10;
  }

  /**
   * 验证配置更新
   * @param update 部分配置更新
   * @returns 验证结果
   */
  static validateConfigUpdate(update: Partial<ModelConfig>): ValidationResult {
    const errors: string[] = [];

    // 验证提供的字段
    if (update.modelId !== undefined) {
      if (update.modelId.trim() === '') {
        errors.push('Model ID cannot be empty');
      } else if (!this.isValidModelId(update.modelId)) {
        errors.push('Model ID can only contain letters, numbers, hyphens, and underscores');
      }
    }

    if (update.modelName !== undefined && update.modelName.trim() === '') {
      errors.push('Model name cannot be empty');
    }

    if (update.displayName !== undefined && update.displayName.trim() === '') {
      errors.push('Display name cannot be empty');
    }

    if (update.vendor !== undefined) {
      if (!['deepseek', 'openai', 'zhipuai', 'custom'].includes(update.vendor)) {
        errors.push('Vendor must be one of: deepseek, openai, zhipuai, custom');
      }
    }

    if (update.apiKey !== undefined) {
      if (update.apiKey.trim() === '') {
        errors.push('API key cannot be empty');
      } else if (!this.isValidApiKey(update.apiKey)) {
        errors.push('API key must be at least 10 characters long');
      }
    }

    if (update.apiBaseUrl !== undefined) {
      if (update.apiBaseUrl.trim() === '') {
        errors.push('API base URL cannot be empty');
      } else if (!this.isValidUrl(update.apiBaseUrl)) {
        errors.push('API base URL must be a valid URL');
      }
    }

    if (update.maxContextTokens !== undefined) {
      if (typeof update.maxContextTokens !== 'number' || update.maxContextTokens <= 0) {
        errors.push('Max context tokens must be a positive number');
      }
    }

    if (update.temperature !== undefined) {
      if (typeof update.temperature !== 'number' || update.temperature < 0 || update.temperature > 2) {
        errors.push('Temperature must be a number between 0 and 2');
      }
    }

    if (update.supportMultimodal !== undefined) {
      if (typeof update.supportMultimodal !== 'boolean') {
        errors.push('Support multimodal must be a boolean');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证并抛出错误
   * @param config 模型配置
   * @throws 如果配置无效，抛出包含所有错误信息的错误
   */
  static validateAndThrow(config: Partial<ModelConfig>): void {
    const result = this.validateModelConfig(config);
    if (!result.valid) {
      throw new Error(`Invalid model configuration:\n${result.errors.join('\n')}`);
    }
  }

  /**
   * 验证更新并抛出错误
   * @param update 部分配置更新
   * @throws 如果更新无效，抛出包含所有错误信息的错误
   */
  static validateUpdateAndThrow(update: Partial<ModelConfig>): void {
    const result = this.validateConfigUpdate(update);
    if (!result.valid) {
      throw new Error(`Invalid configuration update:\n${result.errors.join('\n')}`);
    }
  }
}
