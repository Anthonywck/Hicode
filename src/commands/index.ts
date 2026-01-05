/**
 * 命令系统入口
 * 导出所有命令相关的类型、函数和实例
 */

// 导出类型定义
export * from './types';

// 导出命令注册表
export * from './registry';

// 导出命令管理器
export { CommandManager, commandManager } from './commandManager';

// 导出命令处理器（可选，用于测试或直接调用）
export * as handlers from './handlers';
