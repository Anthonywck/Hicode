/**
 * 模型配置管理器
 * 负责管理 AI 模型配置、API 密钥等
 * 使用 VSCode 的 SecretStorage 安全存储 API 密钥
 */

import * as vscode from 'vscode';
import { ModelConfig } from '../api/types';
import { ModelValidator } from './modelValidator';

/**
 * 模型配置管理器接口
 */
export interface IModelManager {
  /**
   * 获取所有模型配置
   * @returns 模型配置列表
   */
  getModelConfigs(): ModelConfig[];

  /**
   * 添加模型配置
   * @param config 模型配置
   */
  addModelConfig(config: ModelConfig): Promise<void>;

  /**
   * 更新模型配置
   * @param modelId 模型ID
   * @param config 部分配置更新
   */
  updateModelConfig(modelId: string, config: Partial<ModelConfig>): Promise<void>;

  /**
   * 删除模型配置
   * @param modelId 模型ID
   */
  deleteModelConfig(modelId: string): Promise<void>;

  /**
   * 获取当前模型ID
   * @returns 当前模型ID
   */
  getCurrentModel(): string;

  /**
   * 设置当前模型
   * @param modelId 模型ID
   */
  setCurrentModel(modelId: string): Promise<void>;

  /**
   * 获取API密钥（从SecretStorage）
   * @param modelId 模型ID
   * @returns API密钥
   */
  getApiKey(modelId: string): Promise<string | undefined>;

  /**
   * 设置API密钥（存储到SecretStorage）
   * @param modelId 模型ID
   * @param apiKey API密钥
   */
  setApiKey(modelId: string, apiKey: string): Promise<void>;
}

/**
 * 模型配置管理器实现
 */
export class ModelManager implements IModelManager {
  private static readonly CONFIG_KEY = 'hicode';
  private static readonly MODEL_CONFIGS_KEY = 'modelConfigs';
  private static readonly CURRENT_MODEL_KEY = 'currentModel';
  private static readonly API_KEY_PREFIX = 'hicode.apiKey.';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly secretStorage: vscode.SecretStorage
  ) {}

  /**
   * 获取所有模型配置
   */
  getModelConfigs(): ModelConfig[] {
    const config = vscode.workspace.getConfiguration(ModelManager.CONFIG_KEY);
    const configs = config.get<ModelConfig[]>(ModelManager.MODEL_CONFIGS_KEY, []);
    
    // 返回配置的副本，避免外部修改
    return configs.map(c => ({ ...c }));
  }

  /**
   * 添加模型配置
   */
  async addModelConfig(config: ModelConfig): Promise<void> {
    // 验证配置
    ModelValidator.validateAndThrow(config);

    const configs = this.getModelConfigs();

    // 检查是否已存在
    if (configs.some(c => c.modelId === config.modelId)) {
      throw new Error(`Model ${config.modelId} already exists`);
    }

    // 存储API密钥到SecretStorage
    if (config.apiKey) {
      await this.setApiKey(config.modelId, config.apiKey);
    }

    // 从配置中移除API密钥（不存储在settings.json中）
    const { apiKey, ...configWithoutKey } = config;
    configs.push(configWithoutKey as ModelConfig);

    // 更新配置
    const workspaceConfig = vscode.workspace.getConfiguration(ModelManager.CONFIG_KEY);
    await workspaceConfig.update(
      ModelManager.MODEL_CONFIGS_KEY,
      configs,
      vscode.ConfigurationTarget.Global
    );

    // 如果这是第一个模型，设置为当前模型
    if (configs.length === 1) {
      await this.setCurrentModel(config.modelId);
    }
  }

  /**
   * 更新模型配置
   */
  async updateModelConfig(modelId: string, update: Partial<ModelConfig>): Promise<void> {
    // 验证更新
    ModelValidator.validateUpdateAndThrow(update);

    const configs = this.getModelConfigs();
    const index = configs.findIndex(c => c.modelId === modelId);

    if (index === -1) {
      throw new Error(`Model ${modelId} not found`);
    }

    // 如果更新包含API密钥，单独处理
    if (update.apiKey) {
      await this.setApiKey(modelId, update.apiKey);
      const { apiKey, ...updateWithoutKey } = update;
      update = updateWithoutKey;
    }

    // 合并更新
    configs[index] = { ...configs[index], ...update };

    // 更新配置
    const workspaceConfig = vscode.workspace.getConfiguration(ModelManager.CONFIG_KEY);
    await workspaceConfig.update(
      ModelManager.MODEL_CONFIGS_KEY,
      configs,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * 删除模型配置
   */
  async deleteModelConfig(modelId: string): Promise<void> {
    const configs = this.getModelConfigs();
    const filteredConfigs = configs.filter(c => c.modelId !== modelId);

    if (filteredConfigs.length === configs.length) {
      throw new Error(`Model ${modelId} not found`);
    }

    // 删除API密钥
    await this.secretStorage.delete(`${ModelManager.API_KEY_PREFIX}${modelId}`);

    // 更新配置
    const workspaceConfig = vscode.workspace.getConfiguration(ModelManager.CONFIG_KEY);
    await workspaceConfig.update(
      ModelManager.MODEL_CONFIGS_KEY,
      filteredConfigs,
      vscode.ConfigurationTarget.Global
    );

    // 如果删除的是当前模型，切换到第一个可用模型
    const currentModel = this.getCurrentModel();
    if (currentModel === modelId && filteredConfigs.length > 0) {
      await this.setCurrentModel(filteredConfigs[0].modelId);
    } else if (filteredConfigs.length === 0) {
      // 如果没有模型了，清空当前模型
      await this.setCurrentModel('');
    }
  }

  /**
   * 获取当前模型ID
   */
  getCurrentModel(): string {
    const config = vscode.workspace.getConfiguration(ModelManager.CONFIG_KEY);
    return config.get<string>(ModelManager.CURRENT_MODEL_KEY, '');
  }

  /**
   * 设置当前模型
   */
  async setCurrentModel(modelId: string): Promise<void> {
    // 验证模型是否存在（除非是清空操作）
    if (modelId !== '') {
      const configs = this.getModelConfigs();
      if (!configs.some(c => c.modelId === modelId)) {
        throw new Error(`Model ${modelId} not found`);
      }
    }

    const workspaceConfig = vscode.workspace.getConfiguration(ModelManager.CONFIG_KEY);
    await workspaceConfig.update(
      ModelManager.CURRENT_MODEL_KEY,
      modelId,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * 获取API密钥（从SecretStorage）
   */
  async getApiKey(modelId: string): Promise<string | undefined> {
    return await this.secretStorage.get(`${ModelManager.API_KEY_PREFIX}${modelId}`);
  }

  /**
   * 设置API密钥（存储到SecretStorage）
   */
  async setApiKey(modelId: string, apiKey: string): Promise<void> {
    await this.secretStorage.store(`${ModelManager.API_KEY_PREFIX}${modelId}`, apiKey);
  }

  /**
   * 获取完整的模型配置（包含API密钥）
   * @param modelId 模型ID
   * @returns 完整的模型配置
   */
  async getModelConfigWithKey(modelId: string): Promise<ModelConfig | undefined> {
    const configs = this.getModelConfigs();
    const config = configs.find(c => c.modelId === modelId);
    
    if (!config) {
      return undefined;
    }

    // 从SecretStorage获取API密钥
    const apiKey = await this.getApiKey(modelId);
    
    return {
      ...config,
      apiKey: apiKey || ''
    };
  }

  /**
   * 获取当前模型的完整配置（包含API密钥）
   * @returns 当前模型的完整配置
   */
  async getCurrentModelConfig(): Promise<ModelConfig | undefined> {
    const currentModelId = this.getCurrentModel();
    if (!currentModelId) {
      return undefined;
    }
    
    return await this.getModelConfigWithKey(currentModelId);
  }
}
