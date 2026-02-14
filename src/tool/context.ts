/**
 * 工具上下文创建辅助函数
 * 提供创建 ToolContext 的便捷方法
 */

import type { ToolContext, PermissionRequest } from './tool';
import type { MessageWithParts } from '../session/message';
import type { AgentConfig } from '../agent/types';
import { PermissionManager, getPermissionManager } from '../permission/permission';
import { merge } from '../permission/ruleset';

/**
 * 创建工具上下文的选项
 */
export interface CreateToolContextOptions {
  /** 会话ID */
  sessionID: string;
  /** 消息ID */
  messageID: string;
  /** Agent配置 */
  agent: AgentConfig;
  /** 消息列表 */
  messages: MessageWithParts[];
  /** 中止信号 */
  abort: AbortSignal;
  /** 工具调用ID（可选） */
  callID?: string;
  /** 额外数据（可选） */
  extra?: Record<string, any>;
  /** 权限管理器（可选，如果不提供则使用全局实例） */
  permissionManager?: PermissionManager;
  /** 会话权限规则集（可选） */
  sessionPermission?: any[];
  /** 更新工具调用元数据的回调（可选） */
  onMetadataUpdate?: (callID: string, metadata: { title?: string; metadata?: any }) => void | Promise<void>;
}

/**
 * 创建工具执行上下文
 * @param options 上下文选项
 * @returns 工具上下文
 */
export function createToolContext(options: CreateToolContextOptions): ToolContext {
  const {
    sessionID,
    messageID,
    agent,
    messages,
    abort,
    callID,
    extra,
    permissionManager,
    sessionPermission,
    onMetadataUpdate,
  } = options;

  const permMgr = permissionManager ?? getPermissionManager();
  
  // 合并Agent权限和会话权限
  const ruleset = sessionPermission
    ? merge(agent.permission, sessionPermission)
    : agent.permission;

  return {
    sessionID,
    messageID,
    agent: agent.name,
    abort,
    callID,
    extra,
    messages,
    metadata(input: { title?: string; metadata?: any }): void {
      if (callID && onMetadataUpdate) {
        // 异步调用但不等待，避免阻塞
        Promise.resolve(onMetadataUpdate(callID, input)).catch(() => {
          // Ignore errors
        });
      }
    },
    async ask(input: PermissionRequest): Promise<void> {
      await permMgr.ask(
        {
          sessionID,
          permission: input.permission,
          patterns: input.patterns,
          metadata: input.metadata,
          tool: callID
            ? {
                messageID,
                callID,
              }
            : undefined,
        },
        ruleset
      );
    },
  };
}
