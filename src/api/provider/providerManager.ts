/**
 * ProviderManager - Provider 系统管理器
 * 负责管理 AI SDK 的创建和缓存
 */

import type { ModelConfig, ProviderInfo } from '../types';

/**
 * SDK 创建函数类型
 */
type SDKCreator = (options: any) => any;

/**
 * LanguageModelV2 类型（当 ai 包不可用时使用）
 */
type LanguageModelV2 = any;

/**
 * ProviderManager 类
 * 使用单例模式，确保缓存可以复用，提升性能
 */
export class ProviderManager {
  private static instance: ProviderManager | null = null;
  private sdkCache: Map<string, any> = new Map();
  private modelCache: Map<string, LanguageModelV2> = new Map();

  /**
   * 获取单例实例
   */
  static getInstance(): ProviderManager {
    if (!ProviderManager.instance) {
      ProviderManager.instance = new ProviderManager();
    }
    return ProviderManager.instance;
  }

  /**
   * 私有构造函数，确保只能通过 getInstance 创建实例
   */
  private constructor() {}

  /**
   * 动态加载 SDK 创建函数
   */
  private async loadSDKCreator(npm: string): Promise<SDKCreator | null> {
    try {
      switch (npm) {
        case '@ai-sdk/openai': {
          // @ts-ignore - AI SDK 是可选依赖
          const sdk = await import('@ai-sdk/openai');
          return sdk.createOpenAI;
        }
        case '@ai-sdk/anthropic': {
          // @ts-ignore - AI SDK 是可选依赖
          const sdk = await import('@ai-sdk/anthropic');
          return sdk.createAnthropic;
        }
        case '@ai-sdk/openai-compatible': {
          // @ts-ignore - AI SDK 是可选依赖
          const sdk = await import('@ai-sdk/openai-compatible');
          return sdk.createOpenAICompatible;
        }
        case '@ai-sdk/google': {
          // @ts-ignore - AI SDK 是可选依赖
          const sdk = await import('@ai-sdk/google');
          return sdk.createGoogleGenerativeAI;
        }
        default:
          return null;
      }
    } catch (error) {
      console.error(`[ProviderManager] Failed to load SDK ${npm}:`, error);
      return null;
    }
  }

  /**
   * 获取 SDK 实例
   */
  async getSDK(model: ModelConfig, provider: ProviderInfo): Promise<any> {
    // 优先使用模型的 API key，如果没有则使用 provider 的 key
    const apiKey = model.apiKey || provider.key;
    if (!apiKey) {
      throw new Error(`API key is required for provider ${model.providerID}. Please configure the API key in model settings.`);
    }

    // 使用 API key 的前8位作为缓存键的一部分，确保不同 API key 使用不同的 SDK 实例
    const apiKeyHash = apiKey.substring(0, 8);
    const cacheKey = `${model.providerID}/${model.api.npm}/${apiKeyHash}`;

    // 检查缓存
    if (this.sdkCache.has(cacheKey)) {
      return this.sdkCache.get(cacheKey);
    }

    // 构建选项
    const options: any = {
      apiKey: apiKey,
      baseURL: model.api.url || provider.options?.baseURL,
      ...provider.options,
    };

    // 添加模型特定的 headers
    if (model.headers) {
      options.headers = {
        ...(options.headers || {}),
        ...model.headers,
      };
    }

    // 优化HTTP客户端配置（提升流式响应速度）
    // 注意：某些SDK可能不支持这些选项，但设置它们不会导致错误
    if (!options.fetch) {
      // 使用自定义fetch以支持更好的流式处理
      // 注意：这里不设置fetch，让SDK使用默认实现
      // 但可以添加其他优化选项
    }

    // 动态加载 SDK 创建函数
    const createFn = await this.loadSDKCreator(model.api.npm);
    
    if (!createFn) {
      throw new Error(`Unsupported SDK: ${model.api.npm}. Please install the required package.`);
    }

    // 创建 SDK 实例
    const sdk = createFn(options);
    
    this.sdkCache.set(cacheKey, sdk);

    return sdk;
  }

  /**
   * 获取语言模型实例
   */
  async getLanguageModel(
    model: ModelConfig,
    provider: ProviderInfo
  ): Promise<LanguageModelV2> {
    const cacheKey = `${model.providerID}/${model.modelID}`;

    // 检查缓存
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!;
    }

    // 获取 SDK
    const sdk = await this.getSDK(model, provider);

    // 获取语言模型
    const languageModel = sdk.languageModel(model.api.id);

    // 缓存
    this.modelCache.set(cacheKey, languageModel);

    return languageModel;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.sdkCache.clear();
    this.modelCache.clear();
  }

  /**
   * 清除指定模型的缓存
   */
  clearModelCache(providerID: string, modelID: string): void {
    const cacheKey = `${providerID}/${modelID}`;
    this.modelCache.delete(cacheKey);
    
    // 清除相关的 SDK 缓存
    const sdkKey = `${providerID}/`;
    for (const key of this.sdkCache.keys()) {
      if (key.startsWith(sdkKey)) {
        this.sdkCache.delete(key);
      }
    }
  }
}
