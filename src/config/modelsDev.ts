/**
 * ModelsDev - 动态模型配置加载模块
 * 从 models.dev 或本地缓存加载模型配置
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 尝试导入 zod（可选依赖）
 */
let z: any = null;
try {
  z = require('zod').z;
} catch {
  // zod 未安装，将使用简单的类型检查
}

/**
 * 模型配置类型定义
 */
export interface Model {
  id: string;
  name: string;
  family?: string;
  release_date: string;
  attachment: boolean;
  reasoning: boolean;
  temperature: boolean;
  tool_call: boolean;
  interleaved?: boolean | { field: 'reasoning_content' | 'reasoning_details' };
  cost?: {
    input: number;
    output: number;
    cache_read?: number;
    cache_write?: number;
    context_over_200k?: {
      input: number;
      output: number;
      cache_read?: number;
      cache_write?: number;
    };
  };
  limit: {
    context: number;
    input?: number;
    output: number;
  };
  modalities?: {
    input: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
    output: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
  };
  experimental?: boolean;
  status?: 'alpha' | 'beta' | 'deprecated';
  options: Record<string, any>;
  headers?: Record<string, string>;
  provider?: { npm: string };
  variants?: Record<string, Record<string, any>>;
}

/**
 * Provider 配置类型定义
 */
export interface Provider {
  api?: string;
  name: string;
  env: string[];
  id: string;
  npm?: string;
  models: Record<string, Model>;
}

/**
 * 简单的类型验证函数（当 zod 不可用时使用）
 */
function validateModel(data: any): data is Model {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.id === 'string' &&
    typeof data.name === 'string' &&
    typeof data.release_date === 'string' &&
    typeof data.attachment === 'boolean' &&
    typeof data.reasoning === 'boolean' &&
    typeof data.temperature === 'boolean' &&
    typeof data.tool_call === 'boolean' &&
    data.limit &&
    typeof data.limit.context === 'number' &&
    typeof data.limit.output === 'number' &&
    typeof data.options === 'object'
  );
}

function validateProvider(data: any): data is Provider {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.id === 'string' &&
    typeof data.name === 'string' &&
    Array.isArray(data.env) &&
    typeof data.models === 'object' &&
    data.models !== null
  );
}

export namespace ModelsDev {
  const log = (message: string, ...args: any[]) => {
    console.log(`[ModelsDev] ${message}`, ...args);
  };

  /**
   * 获取缓存文件路径
   */
  function getCacheFilePath(context: vscode.ExtensionContext): string {
    const cacheDir = context.globalStorageUri.fsPath;
    return path.join(cacheDir, 'models.json');
  }

  /**
   * 从本地缓存读取
   */
  async function readFromCache(filepath: string): Promise<Record<string, Provider> | null> {
    try {
      if (!fs.existsSync(filepath)) {
        return null;
      }
      const content = fs.readFileSync(filepath, 'utf-8');
      const data = JSON.parse(content);
      // 验证数据格式
      const providers: Record<string, Provider> = {};
      for (const [key, value] of Object.entries(data)) {
        try {
          if (z && z.object) {
            // 使用 zod 验证（如果可用）
            const ProviderSchema = z.object({
              api: z.string().optional(),
              name: z.string(),
              env: z.array(z.string()),
              id: z.string(),
              npm: z.string().optional(),
              models: z.record(z.any()),
            });
            providers[key] = ProviderSchema.parse(value) as Provider;
          } else if (validateProvider(value)) {
            // 使用简单验证
            providers[key] = value;
          } else {
            log(`Invalid provider format for ${key}`);
          }
        } catch (e) {
          log(`Failed to parse provider ${key}:`, e);
        }
      }
      return providers;
    } catch (error) {
      log('Failed to read cache:', error);
      return null;
    }
  }

  /**
   * 写入本地缓存
   */
  async function writeToCache(filepath: string, data: Record<string, Provider>): Promise<void> {
    try {
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      log('Failed to write cache:', error);
    }
  }

  /**
   * 从远程 API 获取
   */
  async function fetchFromRemote(url: string): Promise<Record<string, Provider> | null> {
    try {
      // 确保 URL 格式正确（opencode 使用 /api.json）
      const apiUrl = url.endsWith('/api.json') ? url : `${url}/api.json`;
      log(`Fetching models from ${apiUrl}`);
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'hicode-vscode-extension',
        },
        signal: AbortSignal.timeout(30 * 1000), // 30秒超时（增加超时时间）
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.text();
      const data = JSON.parse(json);

      // 验证数据格式
      const providers: Record<string, Provider> = {};
      for (const [key, value] of Object.entries(data)) {
        try {
          if (z && z.object) {
            // 使用 zod 验证（如果可用）
            const ProviderSchema = z.object({
              api: z.string().optional(),
              name: z.string(),
              env: z.array(z.string()),
              id: z.string(),
              npm: z.string().optional(),
              models: z.record(z.any()),
            });
            providers[key] = ProviderSchema.parse(value) as Provider;
          } else if (validateProvider(value)) {
            // 使用简单验证
            providers[key] = value;
          } else {
            log(`Invalid provider format for ${key}`);
          }
        } catch (e) {
          log(`Failed to parse provider ${key}:`, e);
        }
      }

      return providers;
    } catch (error) {
      log('Failed to fetch from remote:', error);
      return null;
    }
  }

  /**
   * 获取模型配置数据
   */
  export async function get(context: vscode.ExtensionContext): Promise<Record<string, Provider>> {
    const cachePath = getCacheFilePath(context);
    // 使用与 opencode 相同的 URL 格式
    const baseUrl = process.env.OPENCODE_MODELS_URL || 'https://models.dev';
    const url = baseUrl.endsWith('/api.json') ? baseUrl : `${baseUrl}/api.json`;

    // 1. 尝试从本地缓存读取
    const cached = await readFromCache(cachePath);
    if (cached) {
      log('Loaded models from cache');
      return cached;
    }

    // 2. 从远程获取
    const remote = await fetchFromRemote(url);
    if (remote) {
      // 保存到缓存
      await writeToCache(cachePath, remote);
      log('Loaded models from remote and cached');
      return remote;
    }

    // 3. 如果都失败，返回空对象
    log('Failed to load models, returning empty object');
    return {};
  }

  /**
   * 刷新模型配置
   */
  export async function refresh(context: vscode.ExtensionContext): Promise<void> {
    const cachePath = getCacheFilePath(context);
    const baseUrl = process.env.OPENCODE_MODELS_URL || 'https://models.dev';
    const url = baseUrl.endsWith('/api.json') ? baseUrl : `${baseUrl}/api.json`;

    const data = await fetchFromRemote(url);
    if (data) {
      await writeToCache(cachePath, data);
      log('Models refreshed successfully');
    } else {
      throw new Error('Failed to refresh models from remote');
    }
  }

  /**
   * 获取指定 Provider 的模型列表
   */
  export async function getProviderModels(
    context: vscode.ExtensionContext,
    providerID: string
  ): Promise<Model[] | null> {
    const providers = await get(context);
    log(`Looking for provider: ${providerID}, available providers: ${Object.keys(providers).join(', ')}`);
    
    const provider = providers[providerID];
    if (!provider) {
      log(`Provider ${providerID} not found in models.dev`);
      return null;
    }
    
    const models = Object.values(provider.models);
    log(`Found ${models.length} models for provider ${providerID}`);
    return models;
  }

  /**
   * 获取指定模型配置
   */
  export async function getModel(
    context: vscode.ExtensionContext,
    providerID: string,
    modelID: string
  ): Promise<Model | null> {
    const providers = await get(context);
    const provider = providers[providerID];
    if (!provider) {
      return null;
    }
    return provider.models[modelID] || null;
  }
}
