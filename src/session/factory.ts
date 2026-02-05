/**
 * Session Factory
 * 创建和管理 Session 实例
 */

import * as vscode from 'vscode';
import { Session, SessionInfo } from './sessionClass';
import { VSCodeSessionStorage } from './storage';
import { createLogger } from '../utils/logger';

const log = createLogger('session.factory');

/**
 * Session Factory 接口
 */
export interface SessionFactory {
  /**
   * 创建新会话
   */
  createSession(title?: string): Promise<Session>;

  /**
   * 获取会话
   */
  getSession(sessionID: string): Promise<Session | null>;

  /**
   * 获取或创建会话
   */
  getOrCreateSession(sessionID?: string, title?: string): Promise<Session>;
}

/**
 * VSCode Session Factory 实现
 */
class VSCodeSessionFactory implements SessionFactory {
  private storage: VSCodeSessionStorage;
  private sessions: Map<string, Session> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.storage = new VSCodeSessionStorage(context);
  }

  async createSession(title?: string): Promise<Session> {
    const sessionID = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const now = Date.now();

    const info: SessionInfo = {
      id: sessionID,
      title: title || `对话 ${new Date().toLocaleString()}`,
      created: now,
      updated: now,
    };

    const session = new Session(info, this.storage);
    this.sessions.set(sessionID, session);

    log.info('会话已创建', { sessionID, title: info.title });
    return session;
  }

  async getSession(sessionID: string): Promise<Session | null> {
    // 检查缓存
    if (this.sessions.has(sessionID)) {
      return this.sessions.get(sessionID)!;
    }

    // 尝试从存储加载（这里简化处理，实际应该从存储加载会话信息）
    // 暂时返回 null，表示会话不存在
    return null;
  }

  async getOrCreateSession(sessionID?: string, title?: string): Promise<Session> {
    if (sessionID) {
      const session = await this.getSession(sessionID);
      if (session) {
        return session;
      }
    }

    return await this.createSession(title);
  }
}

/**
 * 获取 Session Factory 实例
 */
let factoryInstance: SessionFactory | null = null;

export function getSessionFactory(context: vscode.ExtensionContext): SessionFactory {
  if (!factoryInstance) {
    factoryInstance = new VSCodeSessionFactory(context);
  }
  return factoryInstance;
}

// SessionFactory 已在上面导出
