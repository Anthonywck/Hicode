/**
 * 命令系统类型定义
 */

import * as vscode from 'vscode';

/**
 * 命令处理器函数类型
 * @param args 命令参数
 * @returns 命令执行结果（可以是同步或异步）
 */
export type CommandHandler = (...args: any[]) => any | Promise<any>;

/**
 * 命令配置接口
 */
export interface CommandConfig {
  /** 命令 ID（如：hicode.showInlineChat） */
  command: string;
  
  /** 命令标题（显示在命令面板中） */
  title: string;
  
  /** 命令分类（用于命令面板分组） */
  category?: string;
  
  /** 命令处理器函数 */
  handler: CommandHandler;
  
  /** 命令启用条件（when 子句） */
  when?: string;
  
  /** 命令分组（用于菜单排序） */
  group?: string;
  
  /** 命令描述 */
  description?: string;
}

/**
 * 命令统计信息
 */
export interface CommandStats {
  /** 已注册的命令总数 */
  total: number;
  
  /** 活跃的命令数（已注册到 VS Code） */
  active: number;
  
  /** 按分类统计 */
  byCategory: Record<string, number>;
}
