/**
 * Agent系统类型定义
 * 定义了Agent任务、结果和相关数据结构
 */

import { CodeContext } from '../api/types';
import { PermissionRuleset } from '../permission';

/**
 * Agent任务类型
 */
export type AgentTaskType = 'refactor' | 'test' | 'document' | 'fix' | 'optimize' | 'custom';

/**
 * Agent任务
 * 定义了可执行的Agent操作
 */
export interface AgentTask {
  /** 任务类型 */
  type: AgentTaskType;
  /** 任务名称 */
  name: string;
  /** 任务描述 */
  description: string;
  /** 提示词模板 */
  prompt: string;
  /** 是否为自定义任务 */
  isCustom?: boolean;
}

/**
 * 代码更改
 * 表示对单个文件的修改
 */
export interface CodeChange {
  /** 文件路径 */
  file: string;
  /** 原始内容 */
  originalContent: string;
  /** 新内容 */
  newContent: string;
  /** 差异文本 */
  diff: string;
}

/**
 * Agent执行结果
 * 包含任务执行的结果和更改信息
 */
export interface AgentResult {
  /** 执行是否成功 */
  success: boolean;
  /** 代码更改列表 */
  changes: CodeChange[];
  /** 结果消息 */
  message: string;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * Agent操作历史记录
 * 用于撤销功能
 */
export interface AgentHistoryEntry {
  /** 历史记录ID */
  id: string;
  /** 执行时间 */
  timestamp: Date;
  /** 任务信息 */
  task: AgentTask;
  /** 执行结果 */
  result: AgentResult;
  /** 代码上下文 */
  context: CodeContext;
}

/**
 * Agent类型（支持扩展）
 */
export type AgentType = string;

/**
 * Agent模式
 */
export type AgentMode = 'primary' | 'subagent' | 'all';

/**
 * 模型配置
 */
export interface ModelConfig {
  /** 提供者ID */
  providerID: string;
  /** 模型ID */
  modelID: string;
}

/**
 * Agent配置
 */
export interface AgentConfig {
  /** Agent类型 */
  type: AgentType;
  /** Agent名称 */
  name: string;
  /** Agent描述 */
  description?: string;
  /** 提示词模板 */
  prompt?: string;
  /** 模型配置（支持 providerID + modelID） */
  model?: ModelConfig;
  /** 模型ID（向后兼容，如果设置了 model 则优先使用 model） */
  modelId?: string;
  /** Agent模式 */
  mode: AgentMode;
  /** 权限规则集 */
  permission: PermissionRuleset;
  /** 是否启用 */
  enabled?: boolean;
  /** 是否隐藏（不显示在列表中） */
  hidden?: boolean;
  /** 温度参数 */
  temperature?: number;
  /** Top-p参数 */
  topP?: number;
  /** 最大步数 */
  steps?: number;
  /** 是否为原生Agent */
  native?: boolean;
  /** 颜色（用于UI显示） */
  color?: string;
  /** 其他选项 */
  options?: Record<string, any>;
}
