/**
 * History Manager
 * Manages chat sessions, including creation, persistence, and retrieval
 */

import { ChatSession, ChatMessage, IStorageManager } from './types';

const STORAGE_KEY = 'hicode.chatSessions';
const MAX_TITLE_LENGTH = 50;

/**
 * History Manager interface
 */
export interface IHistoryManager {
  createSession(model: string): ChatSession;
  addMessage(sessionId: string, message: ChatMessage): void;
  getSessions(): ChatSession[];
  getSession(sessionId: string): ChatSession | null;
  deleteSession(sessionId: string): void;
  clearAllSessions(): void;
  exportSession(sessionId: string): string;
  importSession(data: string): ChatSession;
  getCurrentSession(): ChatSession | null;
}

/**
 * History Manager implementation
 */
export class HistoryManager implements IHistoryManager {
  private sessions: Map<string, ChatSession> = new Map();
  private currentSessionId: string | null = null;

  constructor(private storageManager: IStorageManager) {
    this.loadSessions();
  }

  /**
   * Create a new chat session
   */
  createSession(model: string): ChatSession {
    const session: ChatSession = {
      id: this.generateId(),
      title: `对话 ${new Date().toLocaleString()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
      model
    };

    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;
    this.saveSessions();

    return session;
  }

  /**
   * Add a message to a session
   */
  addMessage(sessionId: string, message: ChatMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.messages.push(message);
    session.updatedAt = new Date();

    // Auto-generate title from first user message
    if (session.messages.length === 1 && message.role === 'user') {
      session.title = this.generateTitle(message.content);
    }

    this.saveSessions();
  }

  /**
   * Get all sessions
   */
  getSessions(): ChatSession[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * Get a specific session
   */
  getSession(sessionId: string): ChatSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
    
    this.saveSessions();
  }

  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    this.sessions.clear();
    this.currentSessionId = null;
    this.saveSessions();
  }

  /**
   * Export a session to JSON
   */
  exportSession(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return JSON.stringify(session, null, 2);
  }

  /**
   * Import a session from JSON
   */
  importSession(data: string): ChatSession {
    try {
      const session = JSON.parse(data) as ChatSession;
      
      // Validate session structure
      if (!session.id || !session.title || !session.messages || !session.model) {
        throw new Error('Invalid session data structure');
      }

      // Convert date strings back to Date objects
      session.createdAt = new Date(session.createdAt);
      session.updatedAt = new Date(session.updatedAt);
      session.messages = session.messages.map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));

      // Generate new ID to avoid conflicts
      const newId = this.generateId();
      session.id = newId;

      this.sessions.set(newId, session);
      this.saveSessions();

      return session;
    } catch (error) {
      throw new Error(`Failed to import session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the current active session
   */
  getCurrentSession(): ChatSession | null {
    if (!this.currentSessionId) {
      return null;
    }
    return this.sessions.get(this.currentSessionId) || null;
  }

  /**
   * Set the current active session
   */
  setCurrentSession(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} not found`);
    }
    this.currentSessionId = sessionId;
  }

  /**
   * Load sessions from storage
   */
  private loadSessions(): void {
    const data = this.storageManager.get(STORAGE_KEY);
    if (data) {
      try {
        const entries = JSON.parse(data) as Array<[string, ChatSession]>;
        this.sessions = new Map(
          entries.map(([id, session]) => [
            id,
            {
              ...session,
              createdAt: new Date(session.createdAt),
              updatedAt: new Date(session.updatedAt),
              messages: session.messages.map(msg => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
              }))
            }
          ])
        );
      } catch (error) {
        console.error('Failed to load sessions:', error);
        this.sessions = new Map();
      }
    }
  }

  /**
   * Save sessions to storage
   */
  private saveSessions(): void {
    const data = JSON.stringify(Array.from(this.sessions.entries()));
    this.storageManager.set(STORAGE_KEY, data);
  }

  /**
   * Generate a unique session ID
   */
  private generateId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a title from message content
   */
  private generateTitle(content: string): string {
    // Remove extra whitespace and newlines
    const cleaned = content.replace(/\s+/g, ' ').trim();
    
    // Handle empty content
    if (cleaned.length === 0) {
      return `对话 ${new Date().toLocaleString()}`;
    }
    
    // Truncate if too long
    if (cleaned.length > MAX_TITLE_LENGTH) {
      return cleaned.substring(0, MAX_TITLE_LENGTH) + '...';
    }
    
    return cleaned;
  }
}
