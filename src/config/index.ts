/**
 * 配置管理模块
 * 统一管理扩展的所有配置
 * 
 * 包含：
 * - ConfigManager: 统一配置管理器
 * - ModelManager: 模型配置管理器
 * - ModelValidator: 模型配置验证器
 * - PromptManager: Prompt配置管理器
 * - PromptValidator: Prompt配置验证器
 * - SpecificationManager: 产品级规范配置管理器
 * - SpecificationValidator: 产品级规范配置验证器
 */

export { ConfigManager, IConfigManager } from './manager';
export { ModelManager, IModelManager } from './modelManager';
export { ModelValidator, ValidationResult } from './modelValidator';
export { PromptManager, IPromptManager, PromptConfig } from './promptManager';
export { PromptValidator as PromptConfigValidator } from './promptValidator';
export { SpecificationManager, ISpecificationManager, SpecificationConfig } from './specificationManager';
export { SpecificationValidator as SpecificationConfigValidator } from './specificationValidator';

// 向后兼容：导出 ConfigValidator 作为 ModelValidator 的别名
export { ModelValidator as ConfigValidator } from './modelValidator';
