/**
 * 模型配置验证器
 * 负责验证模型配置的有效性
 */

import { ModelConfig } from '../api/types';

/**
 * 验证结果接口
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
   * 验证并抛出错误（如果无效）
   */
  static validateAndThrow(config: ModelConfig): void {
    // 验证必需字段
    if (!config.modelId) {
      throw new Error('modelId is required');
    }

    if (!config.displayName) {
      throw new Error('displayName is required');
    }

    if (!config.providerID) {
      throw new Error('providerID is required');
    }

    if (!config.modelID) {
      throw new Error('modelID is required');
    }

    // 验证 API 配置
    if (!config.api) {
      throw new Error('api configuration is required');
    }

    if (!config.api.url) {
      throw new Error('api.url is required');
    }

    if (!config.api.npm) {
      throw new Error('api.npm is required');
    }

    // 验证 limit
    if (!config.limit) {
      throw new Error('limit configuration is required');
    }

    if (typeof config.limit.context !== 'number' || config.limit.context <= 0) {
      throw new Error('limit.context must be a positive number');
    }

    if (typeof config.limit.output !== 'number' || config.limit.output <= 0) {
      throw new Error('limit.output must be a positive number');
    }

    // 验证 URL 格式（如果提供）
    if (config.api.url) {
      try {
        new URL(config.api.url);
      } catch {
        throw new Error('api.url must be a valid URL');
      }
    }
  }

  /**
   * 验证更新并抛出错误（如果无效）
   */
  static validateUpdateAndThrow(update: Partial<ModelConfig>): void {
    // 验证 URL 格式（如果更新）
    if (update.api?.url) {
      try {
        new URL(update.api.url);
      } catch {
        throw new Error('api.url must be a valid URL');
      }
    }

    // 验证 limit（如果更新）
    if (update.limit) {
      if (update.limit.context !== undefined) {
        if (typeof update.limit.context !== 'number' || update.limit.context <= 0) {
          throw new Error('limit.context must be a positive number');
        }
      }

      if (update.limit.output !== undefined) {
        if (typeof update.limit.output !== 'number' || update.limit.output <= 0) {
          throw new Error('limit.output must be a positive number');
        }
      }
    }
  }

  /**
   * 验证配置是否有效（不抛出异常）
   */
  static validate(config: ModelConfig): boolean {
    try {
      this.validateAndThrow(config);
      return true;
    } catch {
      return false;
    }
  }
}
