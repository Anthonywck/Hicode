
/**
 * 命令管理器
 * 负责命令的注册、注销和执行
 * 
 * 优化点：
 * 1. 使用 Map 存储 disposables，便于精确管理
 * 2. 添加命令执行日志和错误处理
 * 3. 支持命令的启用/禁用
 * 4. 提供更详细的统计信息
 */

import * as vscode from 'vscode';
import { CommandConfig, CommandStats } from './types';
import { commandConfigs, getCommandConfig, getAllCommands } from './registry';

/**
 * 命令管理器类
 * 单例模式，确保全局只有一个实例
 */
export class CommandManager {
  private static instance: CommandManager;
  
  /** 存储命令 ID 到 Disposable 的映射 */
  private disposables: Map<string, vscode.Disposable> = new Map();
  
  /** 扩展上下文 */
  private context: vscode.ExtensionContext | null = null;
  
  /** 禁用的命令集合 */
  private disabledCommands: Set<string> = new Set();

  private constructor() {}

  /**
   * 获取命令管理器单例实例
   */
  public static getInstance(): CommandManager {
    if (!CommandManager.instance) {
      CommandManager.instance = new CommandManager();
    }
    return CommandManager.instance;
  }

  /**
   * 初始化命令管理器
   * @param context VS Code 扩展上下文
   */
  public initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    console.log('CommandManager initialized');
  }

  /**
   * 注册单个命令
   * @param commandConfig 命令配置
   * @returns Disposable 对象，如果注册失败则返回 null
   */
  public registerCommand(commandConfig: CommandConfig): vscode.Disposable | null {
    if (!this.context) {
      console.error('CommandManager not initialized. Call initialize() first.');
      return null;
    }

    // 检查命令是否已被禁用
    if (this.disabledCommands.has(commandConfig.command)) {
      console.warn(`Command ${commandConfig.command} is disabled, skipping registration`);
      return null;
    }

    // 如果命令已注册，先注销
    if (this.disposables.has(commandConfig.command)) {
      console.warn(`Command ${commandConfig.command} already registered, re-registering...`);
      this.unregisterCommand(commandConfig.command);
    }

    try {
      // 包装处理器，添加错误处理和日志
      const wrappedHandler = async (...args: any[]) => {
        try {
          console.log(`Executing command: ${commandConfig.command}`);
          const result = await commandConfig.handler(...args);
          console.log(`Command ${commandConfig.command} executed successfully`);
          return result;
        } catch (error) {
          console.error(`Error executing command ${commandConfig.command}:`, error);
          vscode.window.showErrorMessage(
            `执行命令失败: ${commandConfig.title} - ${error}`
          );
          throw error;
        }
      };

      // 注册到 VS Code
      const disposable = vscode.commands.registerCommand(
        commandConfig.command,
        wrappedHandler
      );

      // 存储 disposable
      this.disposables.set(commandConfig.command, disposable);
      
      // 添加到上下文订阅
      this.context.subscriptions.push(disposable);

      console.log(`Command registered: ${commandConfig.command}`);
      return disposable;
    } catch (error) {
      console.error(`Failed to register command ${commandConfig.command}:`, error);
      return null;
    }
  }

  /**
   * 批量注册命令
   * @param commandConfigs 命令配置数组
   * @returns 成功注册的 Disposable 数组
   */
  public registerCommands(commandConfigs: CommandConfig[]): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    for (const config of commandConfigs) {
      const disposable = this.registerCommand(config);
      if (disposable) {
        disposables.push(disposable);
      }
    }

    console.log(`Batch registered ${disposables.length}/${commandConfigs.length} commands`);
    return disposables;
  }

  /**
   * 注册所有预定义的命令
   * @returns 成功注册的 Disposable 数组
   */
  public registerAllCommands(): vscode.Disposable[] {
    return this.registerCommands(commandConfigs);
  }

  /**
   * 注销单个命令
   * @param commandId 命令 ID
   * @returns 是否成功注销
   */
  public unregisterCommand(commandId: string): boolean {
    const disposable = this.disposables.get(commandId);
    
    if (!disposable) {
      console.warn(`Command ${commandId} not found in registered commands`);
      return false;
    }

    try {
      disposable.dispose();
      this.disposables.delete(commandId);
      console.log(`Command unregistered: ${commandId}`);
      return true;
    } catch (error) {
      console.error(`Failed to unregister command ${commandId}:`, error);
      return false;
    }
  }

  /**
   * 禁用命令（不注销，只是标记为禁用）
   * @param commandId 命令 ID
   */
  public disableCommand(commandId: string): void {
    this.disabledCommands.add(commandId);
    console.log(`Command disabled: ${commandId}`);
  }

  /**
   * 启用命令
   * @param commandId 命令 ID
   */
  public enableCommand(commandId: string): void {
    this.disabledCommands.delete(commandId);
    console.log(`Command enabled: ${commandId}`);
  }

  /**
   * 检查命令是否已注册
   * @param commandId 命令 ID
   * @returns 是否已注册
   */
  public isCommandRegistered(commandId: string): boolean {
    return this.disposables.has(commandId);
  }

  /**
   * 检查命令是否被禁用
   * @param commandId 命令 ID
   * @returns 是否被禁用
   */
  public isCommandDisabled(commandId: string): boolean {
    return this.disabledCommands.has(commandId);
  }

  /**
   * 执行命令
   * @param commandId 命令 ID
   * @param args 命令参数
   * @returns 命令执行结果
   */
  public async executeCommand(commandId: string, ...args: any[]): Promise<any> {
    // 检查命令是否被禁用
    if (this.disabledCommands.has(commandId)) {
      throw new Error(`Command ${commandId} is disabled`);
    }

    // 检查命令是否已注册
    if (!this.disposables.has(commandId)) {
      throw new Error(`Command ${commandId} is not registered`);
    }

    // 使用 VS Code API 执行命令
    return await vscode.commands.executeCommand(commandId, ...args);
  }

  /**
   * 获取命令配置
   * @param commandId 命令 ID
   * @returns 命令配置，如果不存在则返回 undefined
   */
  public getCommand(commandId: string): CommandConfig | undefined {
    return getCommandConfig(commandId);
  }

  /**
   * 获取所有命令配置
   * @returns 所有命令配置
   */
  public getAllCommands(): CommandConfig[] {
    return getAllCommands();
  }

  /**
   * 获取已注册的命令 ID 列表
   * @returns 已注册的命令 ID 数组
   */
  public getRegisteredCommandIds(): string[] {
    return Array.from(this.disposables.keys());
  }

  /**
   * 获取命令统计信息
   * @returns 命令统计信息
   */
  public getStats(): CommandStats {
    const allCommands = getAllCommands();
    const byCategory: Record<string, number> = {};

    // 统计各分类的命令数量
    for (const cmd of allCommands) {
      const category = cmd.category || 'Other';
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    return {
      total: allCommands.length,
      active: this.disposables.size,
      byCategory
    };
  }

  /**
   * 清理所有命令
   */
  public dispose(): void {
    // 注销所有命令
    for (const [commandId, disposable] of this.disposables) {
      try {
        disposable.dispose();
        console.log(`Disposed command: ${commandId}`);
      } catch (error) {
        console.error(`Error disposing command ${commandId}:`, error);
      }
    }

    this.disposables.clear();
    this.disabledCommands.clear();
    this.context = null;
    
    console.log('CommandManager disposed');
  }
}

/**
 * 导出命令管理器单例实例
 */
export const commandManager = CommandManager.getInstance();
