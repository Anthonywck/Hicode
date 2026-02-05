/**
 * 配置管理器
 * 统一管理扩展的所有配置，包括：
 * - 模型配置（通过 ModelManager）
 * - UI 配置
 * - 通用设置
 * 等
 */

import * as vscode from 'vscode';
import { ModelManager, IModelManager } from './modelManager';
import { PromptManager, IPromptManager } from './promptManager';
import { SpecificationManager, ISpecificationManager } from './specificationManager';

/**
 * 配置管理器接口
 */
export interface IConfigManager {
  /**
   * 获取模型配置管理器
   */
  readonly models: IModelManager;

  /**
   * 获取Prompt配置管理器
   */
  readonly prompts: IPromptManager;

  /**
   * 获取产品级规范配置管理器
   */
  readonly specifications: ISpecificationManager;

  /**
   * 获取通用配置项
   * @param key 配置键
   * @param defaultValue 默认值
   */
  get<T>(key: string, defaultValue?: T): T | undefined;

  /**
   * 设置通用配置项
   * @param key 配置键
   * @param value 配置值
   * @param target 配置目标（全局/工作区）
   */
  set<T>(key: string, value: T, target?: vscode.ConfigurationTarget): Promise<void>;
}

/**
 * 配置管理器实现
 */
export class ConfigManager implements IConfigManager {
  private static readonly CONFIG_KEY = 'hicode';
  
  private readonly _modelManager: ModelManager;
  private readonly _promptManager: PromptManager;
  private readonly _specificationManager: SpecificationManager;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly secretStorage: vscode.SecretStorage
  ) {
    // 初始化模型配置管理器
    this._modelManager = new ModelManager(context, secretStorage);
    // 初始化Prompt配置管理器
    this._promptManager = new PromptManager(context);
    // 初始化产品级规范配置管理器
    this._specificationManager = new SpecificationManager(context);
    
    // 异步初始化 ModelManager（加载 models.dev 配置）
    // 注意：这是非阻塞的，初始化会在后台进行
    if (this._modelManager && typeof (this._modelManager as any).initialize === 'function') {
      (this._modelManager as any).initialize().catch((error: any) => {
        console.error('[ConfigManager] Failed to initialize ModelManager:', error);
      });
    }
  }

  /**
   * 获取模型配置管理器
   */
  get models(): IModelManager {
    return this._modelManager;
  }

  /**
   * 获取Prompt配置管理器
   */
  get prompts(): IPromptManager {
    return this._promptManager;
  }

  /**
   * 获取产品级规范配置管理器
   */
  get specifications(): ISpecificationManager {
    return this._specificationManager;
  }

  /**
   * 获取通用配置项
   */
  get<T>(key: string, defaultValue?: T): T | undefined {
    const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_KEY);
    if (defaultValue !== undefined) {
      return config.get<T>(key, defaultValue as T);
    }
    return config.get<T>(key);
  }

  /**
   * 设置通用配置项
   */
  async set<T>(key: string, value: T, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<void> {
    const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_KEY);
    await config.update(key, value, target);
  }

  /**
   * 获取日志级别
   */
  getLogLevel(): 'debug' | 'info' | 'warn' | 'error' {
    return this.get<'debug' | 'info' | 'warn' | 'error'>('logLevel', 'info')!;
  }

  /**
   * 设置日志级别
   */
  async setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): Promise<void> {
    await this.set('logLevel', level);
  }

  /**
   * 获取是否启用调试模式
   */
  isDebugMode(): boolean {
    return this.get<boolean>('enableDebugMode', false)!;
  }

  /**
   * 设置调试模式
   */
  async setDebugMode(enabled: boolean): Promise<void> {
    await this.set('enableDebugMode', enabled);
  }

  /**
   * 获取是否启用遥测
   */
  isTelemetryEnabled(): boolean {
    return this.get<boolean>('enableTelemetry', true)!;
  }

  /**
   * 设置遥测开关
   */
  async setTelemetryEnabled(enabled: boolean): Promise<void> {
    await this.set('enableTelemetry', enabled);
  }

  /**
   * 获取自动保存间隔（毫秒）
   */
  getAutoSaveInterval(): number {
    return this.get<number>('autoSaveInterval', 30000)!;
  }

  /**
   * 设置自动保存间隔
   */
  async setAutoSaveInterval(interval: number): Promise<void> {
    if (interval < 1000) {
      throw new Error('Auto save interval must be at least 1000ms');
    }
    await this.set('autoSaveInterval', interval);
  }

  /**
   * 获取最大历史记录数
   */
  getMaxHistorySize(): number {
    return this.get<number>('maxHistorySize', 100)!;
  }

  /**
   * 设置最大历史记录数
   */
  async setMaxHistorySize(size: number): Promise<void> {
    if (size < 1) {
      throw new Error('Max history size must be at least 1');
    }
    await this.set('maxHistorySize', size);
  }

  /**
   * 获取聊天模式
   * @returns 'chat' | 'agent'，默认为 'chat'
   */
  getChatMode(): 'chat' | 'agent' {
    return this.get<'chat' | 'agent'>('chatMode', 'chat')!;
  }

  /**
   * 设置聊天模式
   * @param mode 聊天模式：'chat' 或 'agent'
   */
  async setChatMode(mode: 'chat' | 'agent'): Promise<void> {
    if (mode !== 'chat' && mode !== 'agent') {
      throw new Error('Chat mode must be either "chat" or "agent"');
    }
    await this.set('chatMode', mode);
  }

  /**
   * 获取 Agent 模式
   * @returns 'chat' | 'agent'，默认为 'chat'
   */
  getAgentMode(): 'chat' | 'agent' {
    return this.get<'chat' | 'agent'>('agentMode', 'chat')!;
  }

  /**
   * 设置 Agent 模式
   * @param mode Agent 模式：'chat' 或 'agent'
   */
  async setAgentMode(mode: 'chat' | 'agent'): Promise<void> {
    if (mode !== 'chat' && mode !== 'agent') {
      throw new Error('Agent mode must be either "chat" or "agent"');
    }
    await this.set('agentMode', mode);
  }

  /**
   * 获取所有配置（用于导出）
   */
  getAllConfigs(): Record<string, any> {
    const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_KEY);
    return {
      logLevel: this.getLogLevel(),
      enableDebugMode: this.isDebugMode(),
      enableTelemetry: this.isTelemetryEnabled(),
      autoSaveInterval: this.getAutoSaveInterval(),
      maxHistorySize: this.getMaxHistorySize(),
      chatMode: this.getChatMode(),
      agentMode: this.getAgentMode(),
      // 模型配置不包含在这里，需要单独导出
    };
  }

  /**
   * 重置所有配置为默认值
   */
  async resetAllConfigs(): Promise<void> {
    await this.setLogLevel('info');
    await this.setDebugMode(false);
    await this.setTelemetryEnabled(true);
    await this.setAutoSaveInterval(30000);
    await this.setMaxHistorySize(100);
    await this.setChatMode('chat');
    await this.setAgentMode('chat');
  }
}
