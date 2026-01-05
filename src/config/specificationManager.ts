/**
 * 产品级规范配置管理器
 * 负责管理产品级规范配置
 * 参考PromptManager的实现模式，保持代码风格一致
 */

import * as vscode from 'vscode';
import { SpecificationValidator } from './specificationValidator';

/**
 * 产品级规范配置接口
 */
export interface SpecificationConfig {
  /** 规范唯一标识 */
  id: string;
  /** 规范名称 */
  name: string;
  /** 正则表达式（用于匹配） */
  regex?: string;
  /** 实现方式（追加/替换） */
  action?: string;
  /** 规则内容 */
  content?: string;
  /** 是否启用 */
  state?: boolean;
  /** 创建时间（可选） */
  createdAt?: string;
  /** 更新时间（可选） */
  updatedAt?: string;
}

/**
 * 产品级规范配置管理器接口
 */
export interface ISpecificationManager {
  /**
   * 获取所有产品级规范配置
   * @returns 产品级规范配置列表
   */
  getSpecificationConfigs(): SpecificationConfig[];

  /**
   * 添加产品级规范配置
   * @param config 产品级规范配置
   */
  addSpecificationConfig(config: SpecificationConfig): Promise<void>;

  /**
   * 更新产品级规范配置
   * @param specificationId 规范ID
   * @param config 部分配置更新
   */
  updateSpecificationConfig(specificationId: string, config: Partial<SpecificationConfig>): Promise<void>;

  /**
   * 删除产品级规范配置
   * @param specificationId 规范ID
   */
  deleteSpecificationConfig(specificationId: string): Promise<void>;

  /**
   * 根据ID获取产品级规范配置
   * @param specificationId 规范ID
   * @returns 产品级规范配置或undefined
   */
  getSpecificationConfigById(specificationId: string): SpecificationConfig | undefined;
}

/**
 * 产品级规范配置管理器实现
 */
export class SpecificationManager implements ISpecificationManager {
  private static readonly CONFIG_KEY = 'hicode';
  private static readonly SPECIFICATION_CONFIGS_KEY = 'specifications';

  constructor(
    private readonly context: vscode.ExtensionContext
  ) {}

  /**
   * 获取所有产品级规范配置
   */
  getSpecificationConfigs(): SpecificationConfig[] {
    const config = vscode.workspace.getConfiguration(SpecificationManager.CONFIG_KEY);
    const configs = config.get<SpecificationConfig[]>(SpecificationManager.SPECIFICATION_CONFIGS_KEY, []);
    
    // 返回配置的副本，避免外部修改
    return configs.map(c => ({ ...c }));
  }

  /**
   * 添加产品级规范配置
   */
  async addSpecificationConfig(config: SpecificationConfig): Promise<void> {
    const configs = this.getSpecificationConfigs();

    // 如果没有ID，生成一个唯一ID（在验证之前处理）
    if (!config.id || config.id.trim() === '') {
      config.id = this.generateSpecificationId();
    }

    // 检查是否已存在相同ID的规范
    if (configs.some(c => c.id === config.id)) {
      throw new Error(`Specification ${config.id} already exists`);
    }

    // 验证配置（此时ID已经存在）
    SpecificationValidator.validateAndThrow(config);

    // 设置时间戳
    const now = new Date().toISOString();
    const newConfig: SpecificationConfig = {
      ...config,
      // 设置默认值
      state: config.state !== undefined ? config.state : true,
      action: config.action || 'append',
      createdAt: config.createdAt || now,
      updatedAt: now
    };

    configs.push(newConfig);

    // 更新配置
    const workspaceConfig = vscode.workspace.getConfiguration(SpecificationManager.CONFIG_KEY);
    await workspaceConfig.update(
      SpecificationManager.SPECIFICATION_CONFIGS_KEY,
      configs,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * 更新产品级规范配置
   */
  async updateSpecificationConfig(specificationId: string, update: Partial<SpecificationConfig>): Promise<void> {
    // 验证更新
    SpecificationValidator.validateUpdateAndThrow(update);

    const configs = this.getSpecificationConfigs();
    const index = configs.findIndex(c => c.id === specificationId);

    if (index === -1) {
      throw new Error(`Specification ${specificationId} not found`);
    }

    // 合并更新，保留原有字段
    const updatedConfig: SpecificationConfig = {
      ...configs[index],
      ...update,
      // 更新updatedAt时间戳
      updatedAt: new Date().toISOString(),
      // 不允许修改ID
      id: configs[index].id
    };

    configs[index] = updatedConfig;

    // 更新配置
    const workspaceConfig = vscode.workspace.getConfiguration(SpecificationManager.CONFIG_KEY);
    await workspaceConfig.update(
      SpecificationManager.SPECIFICATION_CONFIGS_KEY,
      configs,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * 删除产品级规范配置
   */
  async deleteSpecificationConfig(specificationId: string): Promise<void> {
    const configs = this.getSpecificationConfigs();
    // 兼容不同的数据结构：支持 id 或 name
    const filteredConfigs = configs.filter(c => c.id !== specificationId && c.name !== specificationId);

    if (filteredConfigs.length === configs.length) {
      throw new Error(`Specification ${specificationId} not found`);
    }

    // 更新配置
    const workspaceConfig = vscode.workspace.getConfiguration(SpecificationManager.CONFIG_KEY);
    await workspaceConfig.update(
      SpecificationManager.SPECIFICATION_CONFIGS_KEY,
      filteredConfigs,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * 根据ID获取产品级规范配置
   */
  getSpecificationConfigById(specificationId: string): SpecificationConfig | undefined {
    const configs = this.getSpecificationConfigs();
    // 兼容通过id或name查找
    return configs.find(c => c.id === specificationId || c.name === specificationId);
  }

  /**
   * 生成唯一的产品级规范ID
   * @returns 唯一ID字符串
   */
  private generateSpecificationId(): string {
    return `spec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

