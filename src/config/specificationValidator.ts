/**
 * 产品级规范配置验证器
 * 负责验证产品级规范配置的完整性和有效性
 * 参考PromptValidator的实现模式，保持代码风格一致
 */

import { SpecificationConfig } from './specificationManager';

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
 * 产品级规范配置验证器
 */
export class SpecificationValidator {
  /**
   * 验证产品级规范配置
   * @param config 产品级规范配置
   * @returns 验证结果
   */
  static validateSpecificationConfig(config: Partial<SpecificationConfig>): ValidationResult {
    const errors: string[] = [];

    // 验证必填字段（ID在添加时会自动生成，所以这里不强制要求）
    if (config.id !== undefined && config.id && config.id.trim() !== '' && !this.isValidSpecificationId(config.id)) {
      errors.push('规范ID格式无效，只能包含字母、数字、连字符和下划线');
    }

    if (!config.name || config.name.trim() === '') {
      errors.push('规范名称不能为空');
    }

    // 验证名称长度
    if (config.name && config.name.length > 100) {
      errors.push('规范名称长度不能超过100个字符');
    }

    // 验证action字段（如果提供）
    if (config.action !== undefined && config.action !== '' && !['append', 'replace'].includes(config.action)) {
      errors.push('实现方式必须是"append"（追加）或"replace"（替换）');
    }

    // 验证state字段（如果提供）
    if (config.state !== undefined && typeof config.state !== 'boolean') {
      errors.push('启用状态必须是布尔值');
    }

    // 验证正则表达式格式（如果提供）
    if (config.regex !== undefined && config.regex !== '') {
      try {
        new RegExp(config.regex);
      } catch (e) {
        errors.push('正则表达式格式无效');
      }
    }

    // 验证内容长度（如果提供）
    if (config.content !== undefined && config.content.length > 10000) {
      errors.push('规则内容长度不能超过10000个字符');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证规范ID格式
   * @param specificationId 规范ID
   * @returns 是否为有效的规范ID
   */
  static isValidSpecificationId(specificationId: string): boolean {
    // 规范ID应该只包含字母、数字、连字符和下划线
    const specificationIdRegex = /^[a-zA-Z0-9_-]+$/;
    return specificationIdRegex.test(specificationId);
  }

  /**
   * 验证配置更新
   * @param update 部分配置更新
   * @returns 验证结果
   */
  static validateConfigUpdate(update: Partial<SpecificationConfig>): ValidationResult {
    const errors: string[] = [];

    // 验证提供的字段
    if (update.id !== undefined) {
      if (update.id.trim() === '') {
        errors.push('规范ID不能为空');
      } else if (!this.isValidSpecificationId(update.id)) {
        errors.push('规范ID格式无效，只能包含字母、数字、连字符和下划线');
      }
    }

    if (update.name !== undefined) {
      if (update.name.trim() === '') {
        errors.push('规范名称不能为空');
      } else if (update.name.length > 100) {
        errors.push('规范名称长度不能超过100个字符');
      }
    }

    if (update.action !== undefined && update.action !== '') {
      if (!['append', 'replace'].includes(update.action)) {
        errors.push('实现方式必须是"append"（追加）或"replace"（替换）');
      }
    }

    if (update.state !== undefined && typeof update.state !== 'boolean') {
      errors.push('启用状态必须是布尔值');
    }

    if (update.regex !== undefined && update.regex !== '') {
      try {
        new RegExp(update.regex);
      } catch (e) {
        errors.push('正则表达式格式无效');
      }
    }

    if (update.content !== undefined && update.content.length > 10000) {
      errors.push('规则内容长度不能超过10000个字符');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证并抛出错误
   * @param config 产品级规范配置
   * @throws 如果配置无效，抛出包含所有错误信息的错误
   */
  static validateAndThrow(config: Partial<SpecificationConfig>): void {
    const result = this.validateSpecificationConfig(config);
    if (!result.valid) {
      throw new Error(`无效的产品级规范配置:\n${result.errors.join('\n')}`);
    }
  }

  /**
   * 验证更新并抛出错误
   * @param update 部分配置更新
   * @throws 如果更新无效，抛出包含所有错误信息的错误
   */
  static validateUpdateAndThrow(update: Partial<SpecificationConfig>): void {
    const result = this.validateConfigUpdate(update);
    if (!result.valid) {
      throw new Error(`无效的配置更新:\n${result.errors.join('\n')}`);
    }
  }
}

