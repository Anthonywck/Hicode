/**
 * History Manager Types
 * Defines types for chat session management
 */

import { CodeContext } from '../api/types';

/**
 * Chat message interface
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  context?: CodeContext;
  timestamp: Date;
}

/**
 * Chat session interface
 */
export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ChatMessage[];
  model: string;
}

/**
 * Storage interface for persisting sessions
 */
export interface IStorageManager {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}
