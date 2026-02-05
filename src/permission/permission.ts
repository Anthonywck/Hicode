/**
 * 权限核心模块
 * 实现权限请求和响应机制
 */

import * as vscode from 'vscode';
import { PermissionRuleset, PermissionRule } from './ruleset';
import { evaluate, isAllowed, isDenied } from './evaluator';
import { createLogger } from '../utils/logger';

const logger = createLogger('Permission');

/**
 * 权限响应类型
 */
export type PermissionResponse = 'once' | 'always' | 'reject';

/**
 * 权限请求信息
 */
export interface PermissionRequest {
  /** 请求 ID */
  id: string;
  /** 会话 ID */
  sessionID: string;
  /** 权限类型 */
  permission: string;
  /** 匹配模式列表 */
  patterns: string[];
  /** 元数据 */
  metadata: Record<string, any>;
  /** 总是允许的模式列表（用于 always 响应） */
  always: string[];
  /** 工具调用信息（可选） */
  tool?: {
    messageID: string;
    callID: string;
  };
  /** 请求消息 */
  message?: string;
}

/**
 * 权限请求回调
 */
interface PendingRequest {
  request: PermissionRequest;
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * 权限管理器
 */
export class PermissionManager {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private approvedRules: Map<string, PermissionRuleset> = new Map();
  
  /**
   * 请求权限
   * @param input 权限请求输入
   * @param ruleset 规则集
   * @returns Promise，如果权限被允许则 resolve，否则 reject
   */
  async ask(
    input: {
      sessionID: string;
      permission: string;
      patterns: string[];
      metadata?: Record<string, any>;
      tool?: { messageID: string; callID: string };
      message?: string;
    },
    ruleset: PermissionRuleset
  ): Promise<void> {
    const { sessionID, permission, patterns, metadata = {}, tool, message } = input;
    
    const sessionApproved = this.approvedRules.get(sessionID) || [];
    
    for (const pattern of patterns) {
      const rule = evaluate(permission, pattern, ruleset, sessionApproved);
      
      logger.info('Evaluated permission', { permission, pattern, action: rule.action });
      
      if (rule.action === 'deny') {
        const matchingRules = ruleset.filter(r => 
          wildcardMatch(permission, r.permission) && wildcardMatch(pattern, r.pattern)
        );
        throw new DeniedError(matchingRules);
      }
      
      if (rule.action === 'allow') {
        continue;
      }
      
      if (rule.action === 'ask') {
        const id = this.generateRequestID();
        const request: PermissionRequest = {
          id,
          sessionID,
          permission,
          patterns,
          metadata,
          always: patterns,
          tool,
          message,
        };
        
        return new Promise<void>((resolve, reject) => {
          this.pendingRequests.set(id, {
            request,
            resolve,
            reject,
          });
          
          this.notifyPermissionRequest(request);
        });
      }
    }
  }
  
  /**
   * 响应权限请求
   * @param requestID 请求 ID
   * @param response 响应类型
   * @param message 可选的消息（用于 reject 时提供反馈）
   */
  async respond(requestID: string, response: PermissionResponse, message?: string): Promise<void> {
    const pending = this.pendingRequests.get(requestID);
    if (!pending) {
      logger.warn('Permission request not found', { requestID });
      return;
    }
    
    const { request } = pending;
    this.pendingRequests.delete(requestID);
    
    logger.info('Permission response', { requestID, response, sessionID: request.sessionID });
    
    if (response === 'reject') {
      pending.reject(
        message ? new CorrectedError(message) : new RejectedError()
      );
      
      const sessionID = request.sessionID;
      for (const [id, req] of this.pendingRequests.entries()) {
        if (req.request.sessionID === sessionID) {
          this.pendingRequests.delete(id);
          req.reject(new RejectedError());
        }
      }
      return;
    }
    
    if (response === 'once') {
      pending.resolve();
      return;
    }
    
    if (response === 'always') {
      const sessionApproved = this.approvedRules.get(request.sessionID) || [];
      for (const pattern of request.always) {
        sessionApproved.push({
          permission: request.permission,
          pattern,
          action: 'allow',
        });
      }
      this.approvedRules.set(request.sessionID, sessionApproved);
      
      pending.resolve();
      
      const sessionID = request.sessionID;
      for (const [id, req] of this.pendingRequests.entries()) {
        if (req.request.sessionID !== sessionID) continue;
        
        const allAllowed = req.request.patterns.every(pattern => {
          const rule = evaluate(req.request.permission, pattern, sessionApproved);
          return rule.action === 'allow';
        });
        
        if (allAllowed) {
          this.pendingRequests.delete(id);
          req.resolve();
        }
      }
    }
  }
  
  /**
   * 获取所有待处理的权限请求
   */
  listPending(): PermissionRequest[] {
    return Array.from(this.pendingRequests.values()).map(p => p.request);
  }
  
  /**
   * 获取指定会话的待处理请求
   */
  listPendingBySession(sessionID: string): PermissionRequest[] {
    return Array.from(this.pendingRequests.values())
      .filter(p => p.request.sessionID === sessionID)
      .map(p => p.request);
  }
  
  /**
   * 清除会话的已批准规则
   */
  clearSessionApprovals(sessionID: string): void {
    this.approvedRules.delete(sessionID);
  }
  
  /**
   * 通知权限请求（可以被子类重写以集成 UI）
   */
  protected notifyPermissionRequest(request: PermissionRequest): void {
    logger.info('Permission request created', {
      id: request.id,
      sessionID: request.sessionID,
      permission: request.permission,
      patterns: request.patterns,
    });
  }
  
  /**
   * 生成请求 ID
   */
  private generateRequestID(): string {
    return `perm-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

/**
 * 通配符匹配辅助函数
 */
function wildcardMatch(text: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === text) return true;
  
  const regex = new RegExp(
    '^' +
    pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*') +
    '$'
  );
  
  return regex.test(text);
}

/**
 * 权限被拒绝错误（由配置规则自动拒绝）
 */
export class DeniedError extends Error {
  constructor(public readonly ruleset: PermissionRuleset) {
    super(
      `Permission denied by configuration rule. Relevant rules: ${JSON.stringify(ruleset)}`
    );
    this.name = 'DeniedError';
  }
}

/**
 * 权限被拒绝错误（用户拒绝，停止执行）
 */
export class RejectedError extends Error {
  constructor() {
    super('The user rejected permission to use this specific tool call.');
    this.name = 'RejectedError';
  }
}

/**
 * 权限被拒绝错误（用户拒绝但提供反馈，继续执行）
 */
export class CorrectedError extends Error {
  constructor(message: string) {
    super(
      `The user rejected permission to use this specific tool call with the following feedback: ${message}`
    );
    this.name = 'CorrectedError';
  }
}
