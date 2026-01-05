/**
 * Prompt配置管理器
 * 负责管理用户提示词配置
 * 参考ModelManager的实现模式，保持代码风格一致
 */

import * as vscode from 'vscode';
import { PromptValidator } from './promptValidator';

/**
 * Prompt配置接口
 */
export interface PromptConfig {
  /** 提示词唯一标识 */
  id: string;
  /** 提示词标题/名称 */
  title: string;
  /** 提示词内容 */
  prompt: string;
  /** 提示词类型（可选，用于分类） */
  promptType?: string;
  /** 创建时间（可选） */
  createdAt?: string;
  /** 更新时间（可选） */
  updatedAt?: string;
}

/**
 * Prompt配置管理器接口
 */
export interface IPromptManager {
  /**
   * 获取所有Prompt配置
   * @returns Prompt配置列表
   */
  getPromptConfigs(): PromptConfig[];

  /**
   * 添加Prompt配置
   * @param config Prompt配置
   */
  addPromptConfig(config: PromptConfig): Promise<void>;

  /**
   * 更新Prompt配置
   * @param promptId Prompt ID
   * @param config 部分配置更新
   */
  updatePromptConfig(promptId: string, config: Partial<PromptConfig>): Promise<void>;

  /**
   * 删除Prompt配置
   * @param promptId Prompt ID
   */
  deletePromptConfig(promptId: string): Promise<void>;

  /**
   * 根据ID获取Prompt配置
   * @param promptId Prompt ID
   * @returns Prompt配置或undefined
   */
  getPromptConfigById(promptId: string): PromptConfig | undefined;
}

/**
 * Prompt配置管理器实现
 */
export class PromptManager implements IPromptManager {
  private static readonly CONFIG_KEY = 'hicode';
  private static readonly PROMPT_CONFIGS_KEY = 'userPrompt';

  constructor(
    private readonly context: vscode.ExtensionContext
  ) {}

  /**
   * 获取所有Prompt配置
   */
  getPromptConfigs(): PromptConfig[] {
    const config = vscode.workspace.getConfiguration(PromptManager.CONFIG_KEY);
    const configs = config.get<PromptConfig[]>(PromptManager.PROMPT_CONFIGS_KEY, []);
    
    // 返回配置的副本，避免外部修改
    return configs.map(c => ({ ...c }));
  }

  /**
   * 添加Prompt配置
   */
  async addPromptConfig(config: PromptConfig): Promise<void> {
    const configs = this.getPromptConfigs();

    // 如果没有ID，生成一个唯一ID（在验证之前处理）
    if (!config.id || config.id.trim() === '') {
      config.id = this.generatePromptId();
    }

    // 检查是否已存在相同ID的Prompt
    if (configs.some(c => c.id === config.id)) {
      throw new Error(`Prompt ${config.id} already exists`);
    }

    // 验证配置（此时ID已经存在）
    PromptValidator.validateAndThrow(config);

    // 设置时间戳
    const now = new Date().toISOString();
    const newConfig: PromptConfig = {
      ...config,
      createdAt: config.createdAt || now,
      updatedAt: now
    };

    configs.push(newConfig);

    // 更新配置
    const workspaceConfig = vscode.workspace.getConfiguration(PromptManager.CONFIG_KEY);
    await workspaceConfig.update(
      PromptManager.PROMPT_CONFIGS_KEY,
      configs,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * 更新Prompt配置
   */
  async updatePromptConfig(promptId: string, update: Partial<PromptConfig>): Promise<void> {
    // 验证更新
    PromptValidator.validateUpdateAndThrow(update);

    const configs = this.getPromptConfigs();
    const index = configs.findIndex(c => c.id === promptId);

    if (index === -1) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    // 合并更新，保留原有字段
    const updatedConfig: PromptConfig = {
      ...configs[index],
      ...update,
      // 更新updatedAt时间戳
      updatedAt: new Date().toISOString(),
      // 不允许修改ID
      id: configs[index].id
    };

    configs[index] = updatedConfig;

    // 更新配置
    const workspaceConfig = vscode.workspace.getConfiguration(PromptManager.CONFIG_KEY);
    await workspaceConfig.update(
      PromptManager.PROMPT_CONFIGS_KEY,
      configs,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * 删除Prompt配置
   */
  async deletePromptConfig(promptId: string): Promise<void> {
    const configs = this.getPromptConfigs();
    const filteredConfigs = configs.filter(c => c.id !== promptId);

    if (filteredConfigs.length === configs.length) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    // 更新配置
    const workspaceConfig = vscode.workspace.getConfiguration(PromptManager.CONFIG_KEY);
    await workspaceConfig.update(
      PromptManager.PROMPT_CONFIGS_KEY,
      filteredConfigs,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * 根据ID获取Prompt配置
   */
  getPromptConfigById(promptId: string): PromptConfig | undefined {
    const configs = this.getPromptConfigs();
    return configs.find(c => c.id === promptId);
  }

  /**
   * 生成唯一的Prompt ID
   * @returns 唯一ID字符串
   */
  private generatePromptId(): string {
    return `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

