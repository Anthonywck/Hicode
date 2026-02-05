/**
 * 模型配置管理器
 * 负责管理 AI 模型配置、API 密钥等
 * 使用 VSCode 的 SecretStorage 安全存储 API 密钥
 * 支持从 models.dev 动态加载模型配置
 */

import * as vscode from 'vscode';
import { ModelConfig, ProviderInfo } from '../api/types';
import { ModelValidator } from './modelValidator';
import { ModelsDev, type Provider, type Model as ModelsDevModel } from './modelsDev';

/**
 * 模型配置管理器接口
 */
export interface IModelManager {
  /**
   * 获取所有模型配置（只返回用户配置的模型，即有API key的）
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

  /**
   * 获取模型配置（新方法）
   * @param providerID 提供商标识
   * @param modelID 模型ID
   * @returns 模型配置
   */
  getModel(providerID: string, modelID: string): Promise<ModelConfig>;

  /**
   * 获取 Provider 信息
   * @param providerID 提供商标识
   * @returns Provider 信息
   */
  getProvider(providerID: string): Promise<ProviderInfo>;

  /**
   * 初始化（加载 models.dev 配置）
   */
  initialize(): Promise<void>;
}

/**
 * 模型配置管理器实现
 */
export class ModelManager implements IModelManager {
  private static readonly CONFIG_KEY = 'hicode';
  private static readonly MODEL_CONFIGS_KEY = 'modelConfigs';
  private static readonly CURRENT_MODEL_KEY = 'currentModel';
  private static readonly API_KEY_PREFIX = 'hicode.apiKey.';

  private providers: Map<string, ProviderInfo> = new Map();
  private modelsDev: Record<string, Provider> = {};

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly secretStorage: vscode.SecretStorage
  ) {}

  /**
   * 初始化（加载 models.dev 配置）
   */
  async initialize(): Promise<void> {
    try {
      // 加载 models.dev 配置
      this.modelsDev = await ModelsDev.get(this.context);

      // 从环境变量加载 API 密钥
      const env = process.env;
      for (const [providerID, provider] of Object.entries(this.modelsDev)) {
        const apiKey = provider.env.map((key) => env[key]).find(Boolean);

        if (apiKey) {
          this.providers.set(providerID, {
            id: provider.id,
            name: provider.name,
            source: 'env',
            env: provider.env,
            key: apiKey,
            options: {},
            models: this.convertModelsDevModels(provider),
          });
        } else {
          // 即使没有 API 密钥，也注册 Provider（用于显示模型列表）
          this.providers.set(providerID, {
            id: provider.id,
            name: provider.name,
            source: 'custom',
            env: provider.env,
            options: {},
            models: this.convertModelsDevModels(provider),
          });
        }
      }

      // 从 VSCode 配置加载自定义配置
      await this.loadFromConfig();
    } catch (error) {
      console.error('[ModelManager] Failed to initialize:', error);
    }
  }

  /**
   * 从 VSCode 配置加载
   */
  private async loadFromConfig(): Promise<void> {
    const config = vscode.workspace.getConfiguration(ModelManager.CONFIG_KEY);
    const customProviders = config.get<Record<string, any>>('providers', {});

    for (const [providerID, providerConfig] of Object.entries(customProviders)) {
      const existing = this.providers.get(providerID);
      const provider: ProviderInfo = {
        id: providerID,
        name: providerConfig.name || existing?.name || providerID,
        source: 'config',
        env: providerConfig.env || existing?.env || [],
        key: providerConfig.apiKey || existing?.key,
        options: { ...existing?.options, ...(providerConfig.options || {}) },
        models: { ...existing?.models },
      };

      // 合并自定义模型配置
      if (providerConfig.models) {
        for (const [modelID, modelConfig] of Object.entries(providerConfig.models)) {
          const model = this.convertCustomModelConfig(providerID, modelID, modelConfig as any);
          provider.models[modelID] = model;
        }
      }

      this.providers.set(providerID, provider);
    }
  }

  /**
   * 转换 ModelsDev 模型为 ModelConfig
   */
  private convertModelsDevModels(provider: Provider): Record<string, ModelConfig> {
    const models: Record<string, ModelConfig> = {};

    for (const [modelID, model] of Object.entries(provider.models)) {
      models[modelID] = {
        modelId: `${provider.id}/${modelID}`,
        displayName: model.name,
        providerID: provider.id,
        modelID: modelID,
        api: {
          id: model.id,
          url: provider.api || '',
          npm: model.provider?.npm || provider.npm || '@ai-sdk/openai-compatible',
        },
        capabilities: {
          temperature: model.temperature,
          reasoning: model.reasoning,
          attachment: model.attachment,
          toolcall: model.tool_call,
          input: {
            text: model.modalities?.input?.includes('text') ?? false,
            audio: model.modalities?.input?.includes('audio') ?? false,
            image: model.modalities?.input?.includes('image') ?? false,
            video: model.modalities?.input?.includes('video') ?? false,
            pdf: model.modalities?.input?.includes('pdf') ?? false,
          },
          output: {
            text: model.modalities?.output?.includes('text') ?? false,
            audio: model.modalities?.output?.includes('audio') ?? false,
            image: model.modalities?.output?.includes('image') ?? false,
            video: model.modalities?.output?.includes('video') ?? false,
            pdf: model.modalities?.output?.includes('pdf') ?? false,
          },
        },
        limit: {
          context: model.limit.context,
          input: model.limit.input,
          output: model.limit.output,
        },
        cost: {
          input: model.cost?.input ?? 0,
          output: model.cost?.output ?? 0,
          cache: {
            read: model.cost?.cache_read ?? 0,
            write: model.cost?.cache_write ?? 0,
          },
        },
        status: model.status ?? 'active',
        release_date: model.release_date,
        options: model.options || {},
        headers: model.headers || {},
        // 向后兼容字段
        maxContextTokens: model.limit.context,
        maxOutputTokens: model.limit.output,
        supportMultimodal:
          (model.modalities?.input?.some((m) => ['image', 'video', 'audio', 'pdf'].includes(m)) ||
            model.modalities?.output?.some((m) => ['image', 'video', 'audio', 'pdf'].includes(m))) ??
          false,
      };
    }

    return models;
  }

  /**
   * 转换自定义模型配置
   */
  private convertCustomModelConfig(
    providerID: string,
    modelID: string,
    config: any
  ): ModelConfig {
    return {
      modelId: config.modelId || `${providerID}/${modelID}`,
      displayName: config.displayName || config.modelName || modelID,
      providerID: providerID,
      modelID: modelID,
      api: {
        id: config.api?.id || config.modelName || modelID,
        url: config.api?.url || config.apiBaseUrl || '',
        npm: config.api?.npm || '@ai-sdk/openai-compatible',
      },
      capabilities: {
        temperature: config.capabilities?.temperature ?? true,
        reasoning: config.capabilities?.reasoning ?? false,
        attachment: config.capabilities?.attachment ?? false,
        toolcall: config.capabilities?.toolcall ?? true,
        input: config.capabilities?.input || {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
        output: config.capabilities?.output || {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
      },
      limit: {
        context: config.limit?.context || config.maxContextTokens || 4096,
        input: config.limit?.input,
        output: config.limit?.output || config.maxOutputTokens || 2048,
      },
      cost: {
        input: config.cost?.input ?? 0,
        output: config.cost?.output ?? 0,
        cache: {
          read: config.cost?.cache?.read ?? 0,
          write: config.cost?.cache?.write ?? 0,
        },
      },
      status: config.status || 'active',
      release_date: config.release_date || new Date().toISOString().split('T')[0],
      options: config.options || {},
      headers: config.headers || {},
      modelDescription: config.modelDescription,
      // 向后兼容字段
      maxContextTokens: config.limit?.context || config.maxContextTokens || 4096,
      maxOutputTokens: config.limit?.output || config.maxOutputTokens || 2048,
      supportMultimodal: config.capabilities?.input?.image || config.supportMultimodal || false,
      vendor: config.vendor || providerID as any,
      modelName: config.modelName || modelID,
      apiBaseUrl: config.api?.url || config.apiBaseUrl,
    };
  }

  /**
   * 获取所有模型配置（只返回用户配置的模型）
   * 注意：只返回从 VSCode 配置中保存的模型，不返回从 models.dev 自动获取的模型
   * API key 的检查在调用方进行（异步检查）
   */
  getModelConfigs(): ModelConfig[] {
    const configs: ModelConfig[] = [];

    // 从 VSCode 配置获取用户配置的模型（这些是用户手动添加的）
    const workspaceConfig = vscode.workspace.getConfiguration(ModelManager.CONFIG_KEY);
    const userConfigs = workspaceConfig.get<ModelConfig[]>(ModelManager.MODEL_CONFIGS_KEY, []);

    // 处理用户配置的模型（迁移旧格式）
    for (const userConfig of userConfigs) {
      // 迁移旧配置格式
      const migrated = this.migrateOldConfig(userConfig);
      configs.push(migrated);
    }

    // 不返回从 models.dev 自动获取的模型（这些没有API key，不能使用）
    // 用户需要手动添加模型配置并设置API key才能使用
    // API key 的检查在调用方进行（异步检查），例如在 handleGetModels 中

    return configs;
  }

  /**
   * 获取所有模型配置（同步版本，用于向后兼容）
   * @deprecated 使用异步版本 getModelConfigsAsync
   */
  getModelConfigsSync(): ModelConfig[] {
    const configs: ModelConfig[] = [];

    // 从 VSCode 配置获取旧格式配置（向后兼容）
    const config = vscode.workspace.getConfiguration(ModelManager.CONFIG_KEY);
    const oldConfigs = config.get<ModelConfig[]>(ModelManager.MODEL_CONFIGS_KEY, []);

    // 处理旧配置（如果存在）
    for (const oldConfig of oldConfigs) {
      // 迁移旧配置
      const migrated = this.migrateOldConfig(oldConfig);
      configs.push(migrated);
    }

    // 从 Provider 中收集模型（同步版本，不检查API key）
    for (const provider of this.providers.values()) {
      for (const model of Object.values(provider.models)) {
        // 检查是否已存在
        if (!configs.some((c) => c.modelId === model.modelId)) {
          configs.push(model);
        }
      }
    }

    return configs;
  }

  /**
   * 迁移旧配置格式
   */
  private migrateOldConfig(old: any): ModelConfig {
    const providerID = this.mapVendorToProvider(old.vendor || 'custom');
    // modelID 应该是实际的模型标识（如 "glm-4"），而不是 UUID
    // 优先使用新格式的 modelID，如果没有则使用 modelName，最后才使用 modelId（可能是 UUID）
    const modelID = old.modelID || old.modelName || (old.modelId && !old.modelId.includes('-') ? old.modelId : 'unknown');

    return {
      modelId: old.modelId || `${providerID}/${modelID}`,
      displayName: old.displayName || old.modelName || modelID,
      providerID: providerID,
      modelID: modelID,
      api: {
        id: old.modelName || modelID,
        url: old.apiBaseUrl || this.getDefaultApiUrl(providerID),
        npm: this.getSDKForProvider(providerID),
      },
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: false,
        toolcall: true,
        input: {
          text: true,
          audio: false,
          image: old.supportMultimodal || false,
          video: false,
          pdf: false,
        },
        output: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
      },
      limit: {
        context: old.maxContextTokens || 4096,
        output: old.maxOutputTokens || 2048,
      },
      cost: {
        input: 0,
        output: 0,
        cache: { read: 0, write: 0 },
      },
      status: 'active',
      release_date: new Date().toISOString().split('T')[0],
      modelDescription: old.modelDescription,
      // 向后兼容字段
      maxContextTokens: old.maxContextTokens || 4096,
      maxOutputTokens: old.maxOutputTokens || 2048,
      supportMultimodal: old.supportMultimodal || false,
      vendor: old.vendor,
      modelName: old.modelName,
      apiBaseUrl: old.apiBaseUrl,
    };
  }

  /**
   * 映射 vendor 到 providerID
   */
  private mapVendorToProvider(vendor: string): string {
    const mapping: Record<string, string> = {
      openai: 'openai',
      zhipuai: 'zhipuai',
      deepseek: 'deepseek',
      custom: 'custom',
    };
    return mapping[vendor] || 'custom';
  }

  /**
   * 获取默认 API URL
   */
  private getDefaultApiUrl(providerID: string): string {
    const urls: Record<string, string> = {
      openai: 'https://api.openai.com/v1',
      zhipuai: 'https://open.bigmodel.cn/api/paas/v4',
      deepseek: 'https://api.deepseek.com/v1',
    };
    return urls[providerID] || '';
  }

  /**
   * 获取 SDK 包名
   */
  private getSDKForProvider(providerID: string): string {
    const sdkMap: Record<string, string> = {
      openai: '@ai-sdk/openai',
      zhipuai: '@ai-sdk/openai-compatible',
      deepseek: '@ai-sdk/openai-compatible',
      anthropic: '@ai-sdk/anthropic',
      google: '@ai-sdk/google',
    };
    return sdkMap[providerID] || '@ai-sdk/openai-compatible';
  }

  /**
   * 添加模型配置
   */
  async addModelConfig(config: ModelConfig): Promise<void> {
    // 验证配置
    ModelValidator.validateAndThrow(config);

    // 存储API密钥到SecretStorage
    if (config.apiKey) {
      await this.setApiKey(config.modelId, config.apiKey);
    }

    // 从 VSCode 配置获取现有模型列表
    const workspaceConfig = vscode.workspace.getConfiguration(ModelManager.CONFIG_KEY);
    const existingConfigs = workspaceConfig.get<ModelConfig[]>(ModelManager.MODEL_CONFIGS_KEY, []);

    // 检查是否已存在
    if (existingConfigs.some((c) => c.modelId === config.modelId)) {
      throw new Error(`Model ${config.modelId} already exists`);
    }

    // 从配置中移除API密钥（不存储在settings.json中）
    const { apiKey, ...configWithoutKey } = config;
    
    // 转换为旧格式以便存储（向后兼容）
    const configToSave: any = {
      modelId: config.modelId,
      modelName: config.modelID || config.modelName || config.modelId,
      displayName: config.displayName,
      vendor: config.providerID || config.vendor || 'custom',
      maxContextTokens: config.limit?.context || config.maxContextTokens || 4096,
      maxOutputTokens: config.limit?.output || config.maxOutputTokens || 2048,
      temperature: 0.6,
      supportMultimodal: config.capabilities?.input?.image || config.supportMultimodal || false,
      modelDescription: config.modelDescription,
      apiBaseUrl: config.api?.url || config.apiBaseUrl || '',
      // 保留新格式字段（用于将来迁移）
      providerID: config.providerID,
      modelID: config.modelID,
    };

    // 添加到配置列表
    existingConfigs.push(configToSave);

    // 保存到 VSCode 配置
    await workspaceConfig.update(
      ModelManager.MODEL_CONFIGS_KEY,
      existingConfigs,
      vscode.ConfigurationTarget.Global
    );

    // 如果这是第一个模型，设置为当前模型
    if (existingConfigs.length === 1) {
      await this.setCurrentModel(config.modelId);
    }
  }

  /**
   * 更新模型配置
   */
  async updateModelConfig(modelId: string, update: Partial<ModelConfig>): Promise<void> {
    // 验证更新
    ModelValidator.validateUpdateAndThrow(update);

    // 从 VSCode 配置获取现有模型列表
    const workspaceConfig = vscode.workspace.getConfiguration(ModelManager.CONFIG_KEY);
    const configs = workspaceConfig.get<ModelConfig[]>(ModelManager.MODEL_CONFIGS_KEY, []);
    const index = configs.findIndex((c) => c.modelId === modelId);

    if (index === -1) {
      throw new Error(`Model ${modelId} not found`);
    }

    const existing = configs[index];

    // 如果更新包含API密钥，单独处理
    if (update.apiKey) {
      await this.setApiKey(modelId, update.apiKey);
    }

    // 合并更新
    const updated = { ...existing, ...update };

    // 转换为旧格式以便存储（向后兼容）
    const configToSave: any = {
      modelId: updated.modelId,
      modelName: updated.modelID || updated.modelName || updated.modelId,
      displayName: updated.displayName,
      vendor: updated.providerID || updated.vendor || 'custom',
      maxContextTokens: updated.limit?.context || updated.maxContextTokens || 4096,
      maxOutputTokens: updated.limit?.output || updated.maxOutputTokens || 2048,
      temperature: 0.6,
      supportMultimodal: updated.capabilities?.input?.image || updated.supportMultimodal || false,
      modelDescription: updated.modelDescription,
      apiBaseUrl: updated.api?.url || updated.apiBaseUrl || '',
      // 保留新格式字段
      providerID: updated.providerID,
      modelID: updated.modelID,
    };

    // 从配置中移除API密钥（不存储在settings.json中）
    delete configToSave.apiKey;

    // 更新配置列表
    configs[index] = configToSave;

    // 保存到 VSCode 配置
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
    // 从 VSCode 配置获取现有模型列表
    const workspaceConfig = vscode.workspace.getConfiguration(ModelManager.CONFIG_KEY);
    const configs = workspaceConfig.get<ModelConfig[]>(ModelManager.MODEL_CONFIGS_KEY, []);
    const filteredConfigs = configs.filter((c) => c.modelId !== modelId);

    if (filteredConfigs.length === configs.length) {
      throw new Error(`Model ${modelId} not found`);
    }

    // 删除API密钥
    await this.secretStorage.delete(`${ModelManager.API_KEY_PREFIX}${modelId}`);

    // 保存到 VSCode 配置
    await workspaceConfig.update(
      ModelManager.MODEL_CONFIGS_KEY,
      filteredConfigs,
      vscode.ConfigurationTarget.Global
    );

    // 如果删除的是当前模型，切换到第一个可用模型
    const currentModel = this.getCurrentModel();
    if (currentModel === modelId) {
      if (filteredConfigs.length > 0) {
        await this.setCurrentModel(filteredConfigs[0].modelId);
      } else {
        await this.setCurrentModel('');
      }
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
      if (!configs.some((c) => c.modelId === modelId)) {
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
   */
  async getModelConfigWithKey(modelId: string): Promise<ModelConfig | undefined> {
    const configs = this.getModelConfigs();
    const config = configs.find((c) => c.modelId === modelId);

    if (!config) {
      return undefined;
    }

    // 从SecretStorage获取API密钥
    const apiKey = await this.getApiKey(modelId);

    return {
      ...config,
      apiKey: apiKey || '',
    };
  }

  /**
   * 获取当前模型的完整配置（包含API密钥）
   */
  async getCurrentModelConfig(): Promise<ModelConfig | undefined> {
    const currentModelId = this.getCurrentModel();
    if (!currentModelId) {
      return undefined;
    }

    return await this.getModelConfigWithKey(currentModelId);
  }

  /**
   * 获取模型配置（新方法）
   * 优先从用户配置中查找，如果找不到再从 provider.models 中查找
   */
  async getModel(providerID: string, modelID: string): Promise<ModelConfig> {
    // 首先从用户配置中查找（用户手动配置的模型）
    const userConfigs = this.getModelConfigs();
    const userModel = userConfigs.find(
      (m) => 
        (m.providerID === providerID && m.modelID === modelID) ||
        (m.providerID === providerID && m.modelId === modelID) ||
        (m.modelId === modelID)
    );
    
    if (userModel) {
      // 获取 API 密钥
      const apiKey = await this.getApiKey(userModel.modelId);
      return {
        ...userModel,
        apiKey: apiKey || '',
      };
    }

    // 如果用户配置中找不到，从 provider.models 中查找（从 models.dev 获取的模型）
    const provider = this.providers.get(providerID);
    if (!provider) {
      throw new Error(`Provider ${providerID} not found`);
    }

    const model = provider.models[modelID];
    if (!model) {
      throw new Error(`Model ${modelID} not found in provider ${providerID}. Please check if the model is configured correctly.`);
    }

    // 获取 API 密钥（从用户配置的模型中获取，如果存在）
    const apiKey = await this.getApiKey(model.modelId);
    return {
      ...model,
      apiKey: apiKey || '',
    };
  }

  /**
   * 获取 Provider 信息
   */
  async getProvider(providerID: string): Promise<ProviderInfo> {
    const provider = this.providers.get(providerID);
    if (!provider) {
      throw new Error(`Provider ${providerID} not found`);
    }

    // 如果没有 key，尝试从 SecretStorage 获取
    if (!provider.key) {
      // 尝试从环境变量获取
      const env = process.env;
      const apiKey = provider.env.map((key) => env[key]).find(Boolean);
      if (apiKey) {
        provider.key = apiKey;
        provider.source = 'env';
      } else {
        // 尝试从第一个模型的 SecretStorage 获取
        const firstModel = Object.values(provider.models)[0];
        if (firstModel) {
          const key = await this.getApiKey(firstModel.modelId);
          if (key) {
            provider.key = key;
            provider.source = 'api';
          }
        }
      }
    }

    return provider;
  }

  /**
   * 获取所有 Provider 列表
   */
  getProviders(): ProviderInfo[] {
    return Array.from(this.providers.values());
  }

  /**
   * 刷新模型配置（从 models.dev）
   */
  async refresh(): Promise<void> {
    await ModelsDev.refresh(this.context);
    await this.initialize();
  }
}
