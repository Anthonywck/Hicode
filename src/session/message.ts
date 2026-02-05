/**
 * 消息模块
 * 定义会话中的消息结构和相关类型
 */

import { z } from 'zod';

/**
 * 消息角色枚举
 */
export enum MessageRole {
  /** 用户消息 */
  User = 'user',
  /** 助手消息 */
  Assistant = 'assistant',
  /** 系统消息 */
  System = 'system',
  /** 工具调用消息 */
  Tool = 'tool',
}

/**
 * 消息时间信息
 */
export interface MessageTime {
  /** 创建时间戳（毫秒） */
  created: number;
  /** 完成时间戳（可选，毫秒） */
  completed?: number;
}

/**
 * 消息成本信息
 */
export interface MessageCost {
  /** 输入Token数量 */
  input: number;
  /** 输出Token数量 */
  output: number;
  /** 推理Token数量 */
  reasoning?: number;
  /** 缓存Token信息 */
  cache?: {
    /** 读取的Token数 */
    read: number;
    /** 写入的Token数 */
    write: number;
  };
}

/**
 * 消息错误信息
 */
export interface MessageError {
  /** 错误名称 */
  name: string;
  /** 错误消息 */
  message: string;
  /** 状态码（可选） */
  statusCode?: number;
  /** 是否可重试（可选） */
  isRetryable?: boolean;
  /** 提供商ID（可选） */
  providerID?: string;
}

/**
 * 文件部分
 */
export interface FilePart {
  /** 部分ID */
  id: string;
  /** 会话ID */
  sessionID: string;
  /** 消息ID */
  messageID: string;
  /** 类型 */
  type: 'file';
  /** MIME类型 */
  mime: string;
  /** URL或内容 */
  url: string;
  /** 文件名（可选） */
  filename?: string;
}

/**
 * 文本部分
 */
export interface TextPart {
  /** 部分ID */
  id: string;
  /** 会话ID */
  sessionID: string;
  /** 消息ID */
  messageID: string;
  /** 类型 */
  type: 'text';
  /** 文本内容 */
  text: string;
  /** 是否为生成内容（可选） */
  synthetic?: boolean;
  /** 是否被忽略（可选） */
  ignored?: boolean;
  /** 时间信息（可选） */
  time?: {
    start: number;
    end?: number;
  };
  /** 元数据（可选） */
  metadata?: Record<string, any>;
}

/**
 * 工具调用状态
 */
export interface ToolCallState {
  /** 状态 */
  status: 'pending' | 'running' | 'completed' | 'error';
  /** 输入参数 */
  input?: Record<string, any>;
  /** 执行结果（可选） */
  output?: any;
  /** 错误信息（可选） */
  error?: string;
  /** 时间信息 */
  time?: {
    start: number;
    end?: number;
  };
  /** 元数据（可选） */
  metadata?: Record<string, any>;
  /** 标题（可选） */
  title?: string;
  /** 附件（可选） */
  attachments?: any[];
}

/**
 * 工具调用部分
 */
export interface ToolCallPart {
  /** 部分ID */
  id: string;
  /** 会话ID */
  sessionID: string;
  /** 消息ID */
  messageID: string;
  /** 类型 */
  type: 'tool-call';
  /** 工具调用ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  args: Record<string, any>;
  /** 执行状态（新实现使用） */
  state?: ToolCallState;
  /** 执行结果（可选，保留向后兼容） */
  result?: any;
  /** 错误信息（可选，保留向后兼容） */
  error?: string;
}

/**
 * 消息部分联合类型
 */
export type Part = TextPart | FilePart | ToolCallPart;

/**
 * 基础消息接口
 */
export interface BaseMessage {
  /** 消息ID */
  id: string;
  /** 会话ID */
  sessionID: string;
  /** 消息角色 */
  role: MessageRole;
  /** 时间信息 */
  time: MessageTime;
}

/**
 * 用户消息
 */
export interface UserMessage extends BaseMessage {
  role: MessageRole.User;
  /** Agent名称 */
  agent: string;
  /** 模型信息 */
  model: {
    /** 提供商ID */
    providerID: string;
    /** 模型ID */
    modelID: string;
  };
  /** 系统提示词（可选） */
  system?: string;
  /** 工具配置（可选） */
  tools?: Record<string, boolean>;
  /** 变体（可选） */
  variant?: string;
}

/**
 * 助手消息
 */
export interface AssistantMessage extends BaseMessage {
  role: MessageRole.Assistant;
  /** 父消息ID */
  parentID: string;
  /** 模型ID */
  modelID: string;
  /** 提供商ID */
  providerID: string;
  /** 模式 */
  mode: string;
  /** Agent名称 */
  agent: string;
  /** 路径信息 */
  path: {
    /** 当前工作目录 */
    cwd: string;
    /** 根目录 */
    root: string;
  };
  /** 成本信息 */
  cost: number;
  /** Token信息 */
  tokens: MessageCost;
  /** 完成状态（可选） */
  finish?: string;
  /** 是否为摘要（可选） */
  summary?: boolean;
  /** 错误信息（可选） */
  error?: MessageError;
}

/**
 * 带部分的消息
 */
export interface MessageWithParts extends BaseMessage {
  /** 消息部分列表 */
  parts: Part[];
}

/**
 * 生成消息ID
 */
export function generateMessageID(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * 生成部分ID
 */
export function generatePartID(): string {
  return `part_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}