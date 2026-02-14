/**
 * Session Manager
 * Manages multiple sessions and replaces HistoryManager
 */

import * as vscode from 'vscode';
import { Session, SessionMetadata, SessionState } from './session-core';
import { ISessionStorage, VSCodeSessionStorage } from './storage';
import { createLogger } from '../utils/logger';

const log = createLogger('session.manager');

const STORAGE_KEY = 'hicode.sessions';
const CURRENT_SESSION_KEY = 'hicode.currentSession';

/**
 * Session Manager interface
 */
export interface ISessionManager {
  /**
   * Create a new session
   */
  createSession(options: {
    model: { providerID: string; modelID: string };
    agent: string;
    title?: string;
  }): Promise<Session>;

  /**
   * Get a session by ID
   */
  getSession(sessionID: string): Promise<Session | null>;

  /**
   * Get all sessions
   */
  getAllSessions(): Promise<Session[]>;

  /**
   * Get current session
   */
  getCurrentSession(): Promise<Session | null>;

  /**
   * Set current session
   */
  setCurrentSession(sessionID: string): Promise<void>;

  /**
   * Update session metadata
   */
  updateSession(sessionID: string, updates: Partial<Omit<SessionMetadata, 'id' | 'created'>>): Promise<void>;

  /**
   * Delete a session
   */
  deleteSession(sessionID: string): Promise<void>;

  /**
   * Clear all sessions
   */
  clearAllSessions(): Promise<void>;

  /**
   * Export session
   */
  exportSession(sessionID: string): Promise<string>;

  /**
   * Import session
   */
  importSession(data: string): Promise<Session>;
}

/**
 * Session Manager implementation
 */
export class SessionManager implements ISessionManager {
  private storage: ISessionStorage;
  private context: vscode.ExtensionContext;
  private sessionsCache: Map<string, SessionMetadata> = new Map();

  constructor(context: vscode.ExtensionContext, storage?: ISessionStorage) {
    this.context = context;
    this.storage = storage || new VSCodeSessionStorage(context);
    this.loadSessions();
  }

  /**
   * Create a new session
   */
  async createSession(options: {
    model: { providerID: string; modelID: string };
    agent: string;
    title?: string;
  }): Promise<Session> {
    const sessionID = this.generateSessionID();
    const now = Date.now();

    const metadata: SessionMetadata = {
      id: sessionID,
      title: options.title || `对话 ${new Date().toLocaleString()}`,
      created: now,
      updated: now,
      state: SessionState.Idle,
      model: options.model,
      agent: options.agent,
    };

    this.sessionsCache.set(sessionID, metadata);
    await this.saveSessions();
    await this.setCurrentSession(sessionID);

    log.info('Session created', { sessionID, title: metadata.title });
    return new Session(metadata, this.storage);
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionID: string): Promise<Session | null> {
    const metadata = this.sessionsCache.get(sessionID);
    if (!metadata) {
      return null;
    }

    return new Session(metadata, this.storage);
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<Session[]> {
    const sessions: Session[] = [];
    for (const metadata of this.sessionsCache.values()) {
      sessions.push(new Session(metadata, this.storage));
    }

    // Sort by updated time (descending)
    return sessions.sort((a, b) => b.metadata.updated - a.metadata.updated);
  }

  /**
   * Get current session
   */
  async getCurrentSession(): Promise<Session | null> {
    const currentSessionID = this.context.globalState.get<string>(CURRENT_SESSION_KEY);
    if (!currentSessionID) {
      return null;
    }

    return await this.getSession(currentSessionID);
  }

  /**
   * Set current session
   */
  async setCurrentSession(sessionID: string): Promise<void> {
    if (!this.sessionsCache.has(sessionID)) {
      throw new Error(`Session ${sessionID} not found`);
    }

    await this.context.globalState.update(CURRENT_SESSION_KEY, sessionID);
    log.debug('Current session set', { sessionID });
  }

  /**
   * Update session metadata
   */
  async updateSession(sessionID: string, updates: Partial<Omit<SessionMetadata, 'id' | 'created'>>): Promise<void> {
    const metadata = this.sessionsCache.get(sessionID);
    if (!metadata) {
      throw new Error(`Session ${sessionID} not found`);
    }

    const updated: SessionMetadata = {
      ...metadata,
      ...updates,
      updated: Date.now(),
    };

    this.sessionsCache.set(sessionID, updated);
    await this.saveSessions();

    log.debug('Session updated', { sessionID, updates });
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionID: string): Promise<void> {
    // Delete session messages
    await this.storage.deleteSessionMessages(sessionID);

    // Remove from cache
    this.sessionsCache.delete(sessionID);

    // Clear current session if it's the deleted one
    const currentSessionID = this.context.globalState.get<string>(CURRENT_SESSION_KEY);
    if (currentSessionID === sessionID) {
      await this.context.globalState.update(CURRENT_SESSION_KEY, undefined);
    }

    await this.saveSessions();

    log.info('Session deleted', { sessionID });
  }

  /**
   * Clear all sessions
   */
  async clearAllSessions(): Promise<void> {
    // Delete all session messages
    for (const sessionID of this.sessionsCache.keys()) {
      await this.storage.deleteSessionMessages(sessionID);
    }

    // Clear cache
    this.sessionsCache.clear();

    // Clear current session
    await this.context.globalState.update(CURRENT_SESSION_KEY, undefined);

    await this.saveSessions();

    log.info('All sessions cleared');
  }

  /**
   * Export session
   */
  async exportSession(sessionID: string): Promise<string> {
    const session = await this.getSession(sessionID);
    if (!session) {
      throw new Error(`Session ${sessionID} not found`);
    }

    const metadata = session.metadata;
    const messages: any[] = [];

    // Collect all messages
    for await (const msg of session.getMessages()) {
      messages.push({
        info: msg.info,
        parts: msg.parts,
      });
    }

    const exportData = {
      metadata,
      messages,
      exportedAt: Date.now(),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import session
   */
  async importSession(data: string): Promise<Session> {
    try {
      const importData = JSON.parse(data) as {
        metadata?: SessionMetadata;
        messages?: Array<{ info: any; parts: any[] }>;
        exportedAt?: number;
      };

      if (!importData.metadata) {
        throw new Error('Invalid session data: missing metadata');
      }

      // Generate new session ID to avoid conflicts
      const sessionID = this.generateSessionID();
      const now = Date.now();

      const metadata: SessionMetadata = {
        ...importData.metadata,
        id: sessionID,
        created: importData.metadata.created || now,
        updated: now,
        state: SessionState.Idle,
      };

      this.sessionsCache.set(sessionID, metadata);
      await this.saveSessions();

      const session = new Session(metadata, this.storage);

      // Import messages if available
      if (importData.messages) {
        for (const msgData of importData.messages) {
          const messageInfo = msgData.info;
          messageInfo.id = messageInfo.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          messageInfo.sessionID = sessionID;

          await this.storage.saveMessage(sessionID, messageInfo.id, messageInfo);

          // Import parts
          if (msgData.parts) {
            for (const part of msgData.parts) {
              part.sessionID = sessionID;
              part.messageID = messageInfo.id;
              await this.storage.savePart(messageInfo.id, part);
            }
          }
        }
      }

      log.info('Session imported', { sessionID, originalID: importData.metadata.id });
      return session;
    } catch (error) {
      throw new Error(`Failed to import session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load sessions from storage
   */
  private loadSessions(): void {
    const data = this.context.globalState.get<string>(STORAGE_KEY);
    if (!data) {
      return;
    }

    try {
      const parsedData = JSON.parse(data) as Record<string, SessionMetadata>;
      this.sessionsCache = new Map(Object.entries(parsedData));

      // Ensure dates are numbers
      for (const [id, metadata] of this.sessionsCache.entries()) {
        this.sessionsCache.set(id, {
          ...metadata,
          created: typeof metadata.created === 'string' ? new Date(metadata.created).getTime() : metadata.created,
          updated: typeof metadata.updated === 'string' ? new Date(metadata.updated).getTime() : metadata.updated,
        });
      }

      log.debug('Sessions loaded', { count: this.sessionsCache.size });
    } catch (error) {
      log.error('Failed to load sessions', error);
      this.sessionsCache = new Map();
    }
  }

  /**
   * Save sessions to storage
   */
  private async saveSessions(): Promise<void> {
    const data: Record<string, SessionMetadata> = {};
    for (const [id, metadata] of this.sessionsCache.entries()) {
      data[id] = metadata;
    }

    await this.context.globalState.update(STORAGE_KEY, JSON.stringify(data));
  }

  /**
   * Generate session ID
   */
  private generateSessionID(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
