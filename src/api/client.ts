/**
 * API Client Manager
 * 管理所有模型的API调用，提供统一的接口
 */

import {
  IAPIClient,
  ModelAdapter,
  ModelConfig,
  ChatRequest,
  ChatResponse,
  CodeContext,
  CompletionSuggestion
} from './types';

/**
 * API客户端管理器
 * 负责管理多个模型适配器，提供统一的API调用接口
 */
export class APIClientManager implements IAPIClient {
  /** 已注册的适配器映射 */
  private adapters: Map<string, ModelAdapter> = new Map();
  
  /** 当前使用的模型ID */
  private currentModel: string | null = null;

  /** 模型管理器实例（用于同步当前模型配置） */
  private modelManager: any = null;

  /** Prompt 管理器实例（用于模板系统） */
  private promptManager: any = null;

  /**
   * 注册模型适配器
   * @param vendor 模型提供商标识
   * @param adapter 适配器实例
   */
  registerAdapter(vendor: string, adapter: ModelAdapter): void {
    if (this.adapters.has(vendor)) {
      throw new Error(`Adapter for vendor "${vendor}" is already registered`);
    }
    this.adapters.set(vendor, adapter);
  }

  /**
   * 设置 Prompt 管理器
   * @param promptManager Prompt 管理器实例
   */
  setPromptManager(promptManager: any): void {
    this.promptManager = promptManager;
  }

  /**
   * 构造函数
   * @param modelManager 模型管理器实例（可选），用于同步当前模型配置
   * @param promptManager Prompt 管理器实例（可选），用于模板系统
   */
  constructor(modelManager?: any, promptManager?: any) {
    this.modelManager = modelManager;
    this.promptManager = promptManager;
    // 如果提供了模型管理器，从配置中加载当前模型
    if (this.modelManager) {
      const currentModelId = this.modelManager.getCurrentModel();
      if (currentModelId) {
        this.currentModel = currentModelId;
      }
    }
  }

  /**
   * 切换当前模型（内部方法，不更新配置）
   * @param modelId 模型ID
   * @throws 如果模型不存在则抛出错误
   */
  switchModel(modelId: string): void {
    if (!this.adapters.has(modelId)) {
      throw new Error(`Model "${modelId}" is not registered`);
    }
    this.currentModel = modelId;
  }

  /**
   * 设置当前模型（公开方法，同步更新配置管理器）
   * 这是推荐使用的方法，它会同时更新API客户端和配置管理器中的当前模型
   * 
   * @param modelId 模型ID
   * @throws 如果模型不存在则抛出错误
   */
  async setCurrentModel(modelId: string): Promise<void> {
    // 验证模型是否存在（通过模型管理器验证）
    if (this.modelManager) {
      const models = this.modelManager.getModelConfigs();
      const modelExists = models.some((m: ModelConfig) => m.modelId === modelId);
      if (!modelExists) {
        throw new Error(`Model "${modelId}" not found in configuration`);
      }
      
      // 同步更新配置管理器中的当前模型
      await this.modelManager.setCurrentModel(modelId);
    }
    
    // 更新API客户端中的当前模型
    this.currentModel = modelId;
  }

  /**
   * 获取当前模型ID
   * 优先从配置管理器中读取，确保与配置保持一致
   * @returns 当前模型ID
   */
  getCurrentModel(): string | null {
    // 如果提供了模型管理器，优先从配置中读取当前模型
    // 这样可以确保API客户端中的当前模型与配置管理器保持一致
    if (this.modelManager) {
      const configModelId = this.modelManager.getCurrentModel();
      if (configModelId) {
        // 同步更新内部状态
        this.currentModel = configModelId;
        return configModelId;
      }
    }
    
    // 如果没有配置管理器或配置中没有当前模型，返回内部状态
    return this.currentModel;
  }

  /**
   * 获取当前适配器
   * @returns 当前适配器实例
   * @throws 如果没有设置当前模型则抛出错误
   */
  private async getCurrentAdapter(): Promise<ModelAdapter> {
    if (!this.currentModel) {
      throw new Error('No model is currently selected');
    }
    
    // 首先尝试直接通过modelId获取adapter（向后兼容）
    let adapter = this.adapters.get(this.currentModel);
    
    // 如果没找到，尝试通过vendor获取或创建
    if (!adapter && this.modelManager) {
      const models = this.modelManager.getModelConfigs();
      const modelConfig = models.find((m: ModelConfig) => m.modelId === this.currentModel);
      
      if (modelConfig && modelConfig.vendor) {
        // 尝试获取已注册的vendor adapter
        adapter = this.adapters.get(modelConfig.vendor);
        
        // 如果vendor adapter不存在，动态创建一个
        if (!adapter) {
          adapter = await this.createAdapter(modelConfig);
          if (adapter) {
            this.adapters.set(modelConfig.vendor, adapter);
          }
        }
      }
    }
    
    if (!adapter) {
      throw new Error(`Adapter for model "${this.currentModel}" not found`);
    }
    
    return adapter;
  }
  
  /**
   * 动态创建adapter
   * @param modelConfig 模型配置
   * @returns adapter实例
   */
  private async createAdapter(modelConfig: ModelConfig): Promise<ModelAdapter | undefined> {
    console.log(`[createAdapter] Starting for model:`, {
      modelId: modelConfig.modelId,
      modelName: modelConfig.modelName,
      vendor: modelConfig.vendor
    });
    
    // 获取API密钥
    const apiKey = await this.modelManager.getApiKey(modelConfig.modelId);
    
    console.log(`[createAdapter] API key retrieved:`, {
      modelId: modelConfig.modelId,
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'none'
    });
    
    if (!apiKey) {
      console.error(`[createAdapter] No API key found for model ${modelConfig.modelId} (${modelConfig.modelName})`);
      // 仍然创建adapter，但会导致401错误
    }
    
    const configWithKey = { ...modelConfig, apiKey: apiKey || '' };
    
    console.log(`[createAdapter] Creating adapter for vendor: ${modelConfig.vendor}`, {
      hasPromptManager: !!this.promptManager
    });
    
    try {
      switch (modelConfig.vendor) {
        case 'deepseek': {
          const { DeepSeekAdapter } = await import('./adapters/deepseek');
          return new DeepSeekAdapter(configWithKey, this.promptManager);
        }
        case 'openai': {
          const { OpenAIAdapter } = await import('./adapters/openai');
          return new OpenAIAdapter(configWithKey, this.promptManager);
        }
        case 'zhipuai': {
          const { ZhipuAIAdapter } = await import('./adapters/zhipuai');
          return new ZhipuAIAdapter(configWithKey, this.promptManager);
        }
        default: {
          // 对于未知的vendor，使用OpenAI兼容的adapter
          const { OpenAIAdapter } = await import('./adapters/openai');
          return new OpenAIAdapter(configWithKey, this.promptManager);
        }
      }
    } catch (error) {
      console.error(`[createAdapter] Failed to create adapter for vendor ${modelConfig.vendor}:`, error);
      return undefined;
    }
  }

  /**
   * 获取指定模型的适配器
   * @param modelId 模型ID
   * @returns 适配器实例
   * @throws 如果适配器不存在则抛出错误
   */
  private async getAdapter(modelId: string): Promise<ModelAdapter> {
    // 首先尝试直接通过modelId获取adapter（向后兼容）
    let adapter = this.adapters.get(modelId);
    
    // 如果没找到，尝试通过vendor获取或创建
    if (!adapter && this.modelManager) {
      const models = this.modelManager.getModelConfigs();
      const modelConfig = models.find((m: ModelConfig) => m.modelId === modelId);
      
      if (modelConfig && modelConfig.vendor) {
        // 每次都重新创建adapter，确保使用最新的API密钥
        // 不使用缓存，因为API密钥可能已更新
        adapter = await this.createAdapter(modelConfig);
        
        if (adapter) {
          // 更新缓存
          this.adapters.set(modelConfig.vendor, adapter);
          this.adapters.set(modelId, adapter); // 同时按modelId缓存
        }
      }
    }
    
    if (!adapter) {
      throw new Error(`Adapter for model "${modelId}" not found`);
    }
    
    return adapter;
  }

  /**
   * 根据modelId获取modelName
   * @param modelId 模型ID
   * @returns 模型名称，如果找不到则返回modelId
   */
  private getModelName(modelId: string): string {
    if (this.modelManager) {
      const models = this.modelManager.getModelConfigs();
      const modelConfig = models.find((m: ModelConfig) => m.modelId === modelId);
      if (modelConfig) {
        return modelConfig.modelName;
      }
    }
    // 如果找不到配置，返回原始modelId（向后兼容）
    return modelId;
  }

  /**
   * 准备ChatRequest，将modelId转换为modelName
   * @param request 原始请求
   * @returns 处理后的请求
   */
  private prepareChatRequest(request: ChatRequest): ChatRequest {
    // 将modelId转换为modelName
    const modelName = this.getModelName(request.model);
    return {
      ...request,
      model: modelName
    };
  }

  /**
   * 发送聊天请求
   * @param request 聊天请求参数（model字段可以是modelId）
   * @returns 聊天响应
   */
  async sendChatRequest(request: ChatRequest): Promise<ChatResponse> {
    try {
      // 保存原始modelId用于查找适配器
      const modelId = request.model;
      const adapter = await this.getAdapter(modelId);
      // 将request中的model转换为modelName
      const preparedRequest = this.prepareChatRequest(request);
      return await adapter.chat(preparedRequest);
    } catch (error) {
      throw new Error(
        `Failed to send chat request: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 发送流式聊天请求
   * @param request 聊天请求参数（model字段可以是modelId）
   * @param onChunk 接收到数据块时的回调
   * @param onEnd 流结束时的回调
   * @param onError 发生错误时的回调
   */
  async sendStreamChatRequest(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onEnd: () => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      // 保存原始modelId用于查找适配器
      const modelId = request.model;
      console.log(`[APIClient] sendStreamChatRequest called with modelId: ${modelId}`);
      const adapter = await this.getAdapter(modelId);
      console.log(`[APIClient] Adapter obtained:`, {
        adapterType: adapter.constructor.name,
        hasChatStream: typeof adapter.chatStream === 'function'
      });
      // 将request中的model转换为modelName
      const preparedRequest = this.prepareChatRequest(request);
      console.log(`[APIClient] Calling adapter.chatStream...`);
      await adapter.chatStream(preparedRequest, onChunk, onEnd, onError);
    } catch (error) {
      const errorObj = error instanceof Error 
        ? error 
        : new Error(String(error));
      onError(errorObj);
    }
  }

  /**
   * 发送补全请求
   * @param context 代码上下文
   * @param prefix 光标前的代码
   * @param suffix 光标后的代码
   * @returns 补全建议列表
   */
  async sendCompletionRequest(
    context: CodeContext,
    prefix: string,
    suffix: string
  ): Promise<CompletionSuggestion[]> {
    try {
      const adapter = await this.getCurrentAdapter();
      return await adapter.complete(context, prefix, suffix);
    } catch (error) {
      throw new Error(
        `Failed to send completion request: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 验证API配置
   * @param config 模型配置
   * @returns 配置是否有效
   */
  async validateConfig(config: ModelConfig): Promise<boolean> {
    try {
      // 检查必需字段
      if (!config.modelId || !config.apiKey || !config.apiBaseUrl) {
        return false;
      }

      // 检查URL格式
      try {
        new URL(config.apiBaseUrl);
      } catch {
        return false;
      }

      // 如果适配器已注册，使用适配器验证
      const adapter = this.adapters.get(config.vendor);
      if (adapter) {
        return await adapter.validateConfig(config);
      }

      // 基本验证通过
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取所有已注册的适配器
   * @returns 适配器ID列表
   */
  getRegisteredAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 检查适配器是否已注册
   * @param vendor 模型提供商标识
   * @returns 是否已注册
   */
  hasAdapter(vendor: string): boolean {
    return this.adapters.has(vendor);
  }

  /**
   * 移除适配器
   * @param vendor 模型提供商标识
   * @returns 是否成功移除
   */
  removeAdapter(vendor: string): boolean {
    if (this.currentModel === vendor) {
      this.currentModel = null;
    }
    return this.adapters.delete(vendor);
  }

  /**
   * 清空所有适配器
   */
  clearAdapters(): void {
    this.adapters.clear();
    this.currentModel = null;
  }
}
