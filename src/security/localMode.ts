/**
 * 本地模式支持模块
 * 支持自托管模型服务配置和本地模式切换
 * 验证需求: 7.6
 */

import * as vscode from 'vscode';
import { ModelConfig } from '../api/types';

/**
 * 本地模式配置接口
 */
export interface LocalModeConfig {
  /** 是否启用本地模式 */
  enabled: boolean;
  /** 本地服务端点 */
  localEndpoint?: string;
  /** 是否验证SSL证书 */
  verifySSL: boolean;
  /** 自定义请求头 */
  customHeaders?: Record<string, string>;
  /** 请求超时时间（毫秒） */
  timeout: number;
  /** 是否记录详细日志 */
  verboseLogging: boolean;
}

/**
 * 本地模型配置接口
 */
export interface LocalModelConfig extends ModelConfig {
  /** 是否是本地模型 */
  isLocal: boolean;
  /** 本地模型路径（可选） */
  localPath?: string;
  /** 本地服务端口（可选） */
  localPort?: number;
}

/**
 * 本地模式管理器接口
 */
export interface ILocalModeManager {
  /**
   * 检查是否启用本地模式
   * @returns 是否启用
   */
  isLocalModeEnabled(): boolean;

  /**
   * 启用或禁用本地模式
   * @param enabled 是否启用
   */
  setLocalModeEnabled(enabled: boolean): Promise<void>;

  /**
   * 获取本地模式配置
   * @returns 本地模式配置
   */
  getConfig(): LocalModeConfig;

  /**
   * 更新本地模式配置
   * @param config 部分配置更新
   */
  updateConfig(config: Partial<LocalModeConfig>): Promise<void>;

  /**
   * 添加本地模型配置
   * @param config 本地模型配置
   */
  addLocalModel(config: LocalModelConfig): Promise<void>;

  /**
   * 获取所有本地模型
   * @returns 本地模型列表
   */
  getLocalModels(): LocalModelConfig[];

  /**
   * 检查模型是否是本地模型
   * @param modelId 模型ID
   * @returns 是否是本地模型
   */
  isLocalModel(modelId: string): boolean;

  /**
   * 验证本地服务连接
   * @param endpoint 服务端点
   * @returns 是否连接成功
   */
  validateLocalService(endpoint: string): Promise<boolean>;

  /**
   * 获取本地服务信息
   * @param endpoint 服务端点
   * @returns 服务信息
   */
  getLocalServiceInfo(endpoint: string): Promise<any>;
}

/**
 * 本地模式管理器实现
 */
export class LocalModeManager implements ILocalModeManager {
  private static readonly CONFIG_KEY = 'hicode.localMode';
  private static readonly ENABLED_KEY = 'enabled';
  private static readonly ENDPOINT_KEY = 'localEndpoint';
  private static readonly VERIFY_SSL_KEY = 'verifySSL';
  private static readonly TIMEOUT_KEY = 'timeout';
  private static readonly VERBOSE_LOGGING_KEY = 'verboseLogging';
  private static readonly LOCAL_MODELS_KEY = 'localModels';

  constructor(private context: vscode.ExtensionContext) {
    this.initializeDefaultConfig();
  }

  /**
   * 初始化默认配置
   */
  private initializeDefaultConfig(): void {
    const config = this.getConfig();
    
    // 如果配置为空，设置默认值
    if (config.localEndpoint === undefined) {
      const defaultConfig: LocalModeConfig = {
        enabled: false,
        localEndpoint: 'http://localhost:8080',
        verifySSL: true,
        timeout: 30000,
        verboseLogging: false
      };
      
      this.updateConfig(defaultConfig);
    }
  }

  /**
   * 检查是否启用本地模式
   */
  isLocalModeEnabled(): boolean {
    const config = this.getConfig();
    return config.enabled;
  }

  /**
   * 启用或禁用本地模式
   */
  async setLocalModeEnabled(enabled: boolean): Promise<void> {
    await this.updateConfig({ enabled });

    const status = enabled ? 'enabled' : 'disabled';
    vscode.window.showInformationMessage(
      `Local mode has been ${status}`
    );

    // 如果启用本地模式，验证本地服务
    if (enabled) {
      const config = this.getConfig();
      if (config.localEndpoint) {
        const isValid = await this.validateLocalService(config.localEndpoint);
        if (!isValid) {
          vscode.window.showWarningMessage(
            'Local service validation failed. Please check your local endpoint configuration.'
          );
        }
      }
    }
  }

  /**
   * 获取本地模式配置
   */
  getConfig(): LocalModeConfig {
    const workspaceConfig = vscode.workspace.getConfiguration();
    
    return {
      enabled: workspaceConfig.get<boolean>(
        `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.ENABLED_KEY}`,
        false
      ),
      localEndpoint: workspaceConfig.get<string>(
        `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.ENDPOINT_KEY}`,
        'http://localhost:8080'
      ),
      verifySSL: workspaceConfig.get<boolean>(
        `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.VERIFY_SSL_KEY}`,
        true
      ),
      customHeaders: workspaceConfig.get<Record<string, string>>(
        `${LocalModeManager.CONFIG_KEY}.customHeaders`,
        {}
      ),
      timeout: workspaceConfig.get<number>(
        `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.TIMEOUT_KEY}`,
        30000
      ),
      verboseLogging: workspaceConfig.get<boolean>(
        `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.VERBOSE_LOGGING_KEY}`,
        false
      )
    };
  }

  /**
   * 更新本地模式配置
   */
  async updateConfig(config: Partial<LocalModeConfig>): Promise<void> {
    const workspaceConfig = vscode.workspace.getConfiguration();

    if (config.enabled !== undefined) {
      await workspaceConfig.update(
        `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.ENABLED_KEY}`,
        config.enabled,
        vscode.ConfigurationTarget.Global
      );
    }

    if (config.localEndpoint !== undefined) {
      await workspaceConfig.update(
        `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.ENDPOINT_KEY}`,
        config.localEndpoint,
        vscode.ConfigurationTarget.Global
      );
    }

    if (config.verifySSL !== undefined) {
      await workspaceConfig.update(
        `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.VERIFY_SSL_KEY}`,
        config.verifySSL,
        vscode.ConfigurationTarget.Global
      );
    }

    if (config.customHeaders !== undefined) {
      await workspaceConfig.update(
        `${LocalModeManager.CONFIG_KEY}.customHeaders`,
        config.customHeaders,
        vscode.ConfigurationTarget.Global
      );
    }

    if (config.timeout !== undefined) {
      await workspaceConfig.update(
        `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.TIMEOUT_KEY}`,
        config.timeout,
        vscode.ConfigurationTarget.Global
      );
    }

    if (config.verboseLogging !== undefined) {
      await workspaceConfig.update(
        `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.VERBOSE_LOGGING_KEY}`,
        config.verboseLogging,
        vscode.ConfigurationTarget.Global
      );
    }
  }

  /**
   * 添加本地模型配置
   */
  async addLocalModel(config: LocalModelConfig): Promise<void> {
    const models = this.getLocalModels();

    // 检查是否已存在
    if (models.some(m => m.modelId === config.modelId)) {
      throw new Error(`Local model ${config.modelId} already exists`);
    }

    // 标记为本地模型
    config.isLocal = true;
    config.vendor = 'custom';

    // 如果没有指定API基础URL，使用本地端点
    if (!config.apiBaseUrl) {
      const localConfig = this.getConfig();
      config.apiBaseUrl = localConfig.localEndpoint || 'http://localhost:8080';
    }

    models.push(config);

    const workspaceConfig = vscode.workspace.getConfiguration();
    await workspaceConfig.update(
      `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.LOCAL_MODELS_KEY}`,
      models,
      vscode.ConfigurationTarget.Global
    );

    vscode.window.showInformationMessage(
      `Local model ${config.displayName} has been added`
    );
  }

  /**
   * 获取所有本地模型
   */
  getLocalModels(): LocalModelConfig[] {
    const workspaceConfig = vscode.workspace.getConfiguration();
    return workspaceConfig.get<LocalModelConfig[]>(
      `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.LOCAL_MODELS_KEY}`,
      []
    );
  }

  /**
   * 检查模型是否是本地模型
   */
  isLocalModel(modelId: string): boolean {
    const models = this.getLocalModels();
    return models.some(m => m.modelId === modelId && m.isLocal);
  }

  /**
   * 验证本地服务连接
   */
  async validateLocalService(endpoint: string): Promise<boolean> {
    try {
      // 尝试连接到本地服务的健康检查端点
      const healthEndpoints = [
        `${endpoint}/health`,
        `${endpoint}/v1/health`,
        `${endpoint}/api/health`,
        `${endpoint}/`
      ];

      for (const healthEndpoint of healthEndpoints) {
        try {
          const response = await fetch(healthEndpoint, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(5000) // 5秒超时
          });

          if (response.ok) {
            return true;
          }
        } catch {
          // 继续尝试下一个端点
          continue;
        }
      }

      return false;
    } catch (error) {
      console.error('Failed to validate local service:', error);
      return false;
    }
  }

  /**
   * 获取本地服务信息
   */
  async getLocalServiceInfo(endpoint: string): Promise<any> {
    try {
      const infoEndpoints = [
        `${endpoint}/info`,
        `${endpoint}/v1/models`,
        `${endpoint}/api/models`,
        `${endpoint}/models`
      ];

      for (const infoEndpoint of infoEndpoints) {
        try {
          const response = await fetch(infoEndpoint, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(5000)
          });

          if (response.ok) {
            return await response.json();
          }
        } catch {
          continue;
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to get local service info:', error);
      return null;
    }
  }

  /**
   * 移除本地模型
   */
  async removeLocalModel(modelId: string): Promise<void> {
    const models = this.getLocalModels();
    const filteredModels = models.filter(m => m.modelId !== modelId);

    if (filteredModels.length === models.length) {
      throw new Error(`Local model ${modelId} not found`);
    }

    const workspaceConfig = vscode.workspace.getConfiguration();
    await workspaceConfig.update(
      `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.LOCAL_MODELS_KEY}`,
      filteredModels,
      vscode.ConfigurationTarget.Global
    );

    vscode.window.showInformationMessage(
      `Local model ${modelId} has been removed`
    );
  }

  /**
   * 获取本地模型配置
   */
  getLocalModelConfig(modelId: string): LocalModelConfig | undefined {
    const models = this.getLocalModels();
    return models.find(m => m.modelId === modelId);
  }

  /**
   * 更新本地模型配置
   */
  async updateLocalModel(
    modelId: string,
    update: Partial<LocalModelConfig>
  ): Promise<void> {
    const models = this.getLocalModels();
    const index = models.findIndex(m => m.modelId === modelId);

    if (index === -1) {
      throw new Error(`Local model ${modelId} not found`);
    }

    models[index] = { ...models[index], ...update };

    const workspaceConfig = vscode.workspace.getConfiguration();
    await workspaceConfig.update(
      `${LocalModeManager.CONFIG_KEY}.${LocalModeManager.LOCAL_MODELS_KEY}`,
      models,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * 测试本地模型连接
   */
  async testLocalModel(modelId: string): Promise<boolean> {
    const model = this.getLocalModelConfig(modelId);
    if (!model) {
      throw new Error(`Local model ${modelId} not found`);
    }

    try {
      // 尝试发送一个简单的测试请求
      const response = await fetch(`${model.apiBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(model.apiKey ? { 'Authorization': `Bearer ${model.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: model.modelName,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(10000)
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to test local model:', error);
      return false;
    }
  }

  /**
   * 显示本地模式设置向导
   */
  async showSetupWizard(): Promise<void> {
    // 步骤1: 询问是否启用本地模式
    const enableChoice = await vscode.window.showQuickPick(
      ['Yes', 'No'],
      {
        placeHolder: 'Do you want to enable local mode?',
        title: 'Local Mode Setup'
      }
    );

    if (enableChoice !== 'Yes') {
      return;
    }

    // 步骤2: 输入本地服务端点
    const endpoint = await vscode.window.showInputBox({
      prompt: 'Enter your local service endpoint',
      value: 'http://localhost:8080',
      placeHolder: 'http://localhost:8080',
      validateInput: (value) => {
        try {
          new URL(value);
          return null;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    });

    if (!endpoint) {
      return;
    }

    // 步骤3: 验证连接
    vscode.window.showInformationMessage('Validating local service...');
    const isValid = await this.validateLocalService(endpoint);

    if (!isValid) {
      const retry = await vscode.window.showWarningMessage(
        'Failed to connect to local service. Do you want to continue anyway?',
        'Yes',
        'No'
      );

      if (retry !== 'Yes') {
        return;
      }
    }

    // 步骤4: 保存配置
    await this.updateConfig({
      enabled: true,
      localEndpoint: endpoint
    });

    vscode.window.showInformationMessage(
      'Local mode has been configured successfully!'
    );

    // 步骤5: 询问是否添加本地模型
    const addModel = await vscode.window.showQuickPick(
      ['Yes', 'No'],
      {
        placeHolder: 'Do you want to add a local model now?',
        title: 'Add Local Model'
      }
    );

    if (addModel === 'Yes') {
      await this.showAddModelWizard(endpoint);
    }
  }

  /**
   * 显示添加本地模型向导
   */
  private async showAddModelWizard(defaultEndpoint?: string): Promise<void> {
    // 输入模型ID
    const modelId = await vscode.window.showInputBox({
      prompt: 'Enter model ID',
      placeHolder: 'local-model-1',
      validateInput: (value) => {
        return value.trim() ? null : 'Model ID cannot be empty';
      }
    });

    if (!modelId) {
      return;
    }

    // 输入显示名称
    const displayName = await vscode.window.showInputBox({
      prompt: 'Enter display name',
      value: modelId,
      placeHolder: 'My Local Model'
    });

    if (!displayName) {
      return;
    }

    // 输入模型名称
    const modelName = await vscode.window.showInputBox({
      prompt: 'Enter model name (used in API requests)',
      value: modelId,
      placeHolder: 'gpt-3.5-turbo'
    });

    if (!modelName) {
      return;
    }

    // 创建本地模型配置
    const config: LocalModelConfig = {
      modelId,
      modelName,
      displayName,
      vendor: 'custom',
      apiKey: '',
      apiBaseUrl: defaultEndpoint || this.getConfig().localEndpoint || 'http://localhost:8080',
      maxContextTokens: 4096,
      supportMultimodal: false,
      isLocal: true
    };

    await this.addLocalModel(config);
  }
}
