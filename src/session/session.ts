/**
 * Session Manager
 * 管理所有会话的创建、获取和删除
 */

import * as vscode from 'vscode';
import { Session, SessionInfo } from './sessionClass';
import { SessionFactory, getSessionFactory } from './factory';
import { createLogger } from '../utils/logger';

const log = createLogger('session.manager');

/**
 * Session Manager 接口
 */
export interface SessionManager {
  /**
   * 获取所有会话
   */
  getAllSessions(): Promise<Session[]>;

  /**
   * 获取当前会话
   */
  getCurrentSession(): Promise<Session | null>;

  /**
   * 设置当前会话
   */
  setCurrentSession(sessionID: string): Promise<void>;

  /**
   * 删除会话
   */
  deleteSession(sessionID: string): Promise<void>;
}

/**
 * VSCode Session Manager 实现
 */
class VSCodeSessionManager implements SessionManager {
  private factory: SessionFactory;
  private currentSessionID: string | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.factory = getSessionFactory(context);
  }

  async getAllSessions(): Promise<Session[]> {
    // 简化实现：暂时返回空数组
    // 实际应该从存储加载所有会话
    return [];
  }

  async getCurrentSession(): Promise<Session | null> {
    if (!this.currentSessionID) {
      return null;
    }
    return await this.factory.getSession(this.currentSessionID);
  }

  async setCurrentSession(sessionID: string): Promise<void> {
    this.currentSessionID = sessionID;
  }

  async deleteSession(sessionID: string): Promise<void> {
    if (this.currentSessionID === sessionID) {
      this.currentSessionID = null;
    }
    // 实际应该从存储删除会话
  }
}

/**
 * 获取 Session Manager 实例
 */
let managerInstance: SessionManager | null = null;

export function getSessionManager(context: vscode.ExtensionContext): SessionManager {
  if (!managerInstance) {
    managerInstance = new VSCodeSessionManager(context);
  }
  return managerInstance;
}

// SessionManager 已在上面导出
