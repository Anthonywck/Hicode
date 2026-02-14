/**
 * Session Core
 * Core session management with state tracking
 */

import * as vscode from 'vscode';
import { ISessionStorage } from './storage';
import {
  MessageWithParts,
  MessageInfo,
  UserMessage,
  AssistantMessage,
  Part,
  generateMessageID,
  generatePartID,
} from './message-v2';
import { createLogger } from '../utils/logger';

const log = createLogger('session.core');

/**
 * Session state enum
 */
export enum SessionState {
  /** Idle - no active operations */
  Idle = 'idle',
  /** Busy - processing request */
  Busy = 'busy',
  /** Completed - session completed */
  Completed = 'completed',
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  /** Session ID */
  id: string;
  /** Session title */
  title: string;
  /** Created timestamp */
  created: number;
  /** Updated timestamp */
  updated: number;
  /** Session state */
  state: SessionState;
  /** Model configuration */
  model: {
    providerID: string;
    modelID: string;
  };
  /** Agent name */
  agent: string;
}

/**
 * Session class
 * Manages a single session with state tracking
 */
export class Session {
  private _metadata: SessionMetadata;
  private storage: ISessionStorage;

  constructor(metadata: SessionMetadata, storage: ISessionStorage) {
    this._metadata = metadata;
    this.storage = storage;
  }

  /**
   * Get session metadata
   */
  get metadata(): SessionMetadata {
    return { ...this._metadata };
  }

  /**
   * Get session ID
   */
  get id(): string {
    return this._metadata.id;
  }

  /**
   * Get session state
   */
  get state(): SessionState {
    return this._metadata.state;
  }

  /**
   * Update session state
   */
  async setState(state: SessionState): Promise<void> {
    this._metadata.state = state;
    this._metadata.updated = Date.now();
    await this.saveMetadata();
    log.debug('Session state updated', { sessionID: this.id, state });
  }

  /**
   * Update session title
   */
  async setTitle(title: string): Promise<void> {
    this._metadata.title = title;
    this._metadata.updated = Date.now();
    await this.saveMetadata();
    log.debug('Session title updated', { sessionID: this.id, title });
  }

  /**
   * Update session metadata
   */
  async updateMetadata(updates: Partial<Omit<SessionMetadata, 'id' | 'created'>>): Promise<void> {
    this._metadata = {
      ...this._metadata,
      ...updates,
      updated: Date.now(),
    };
    await this.saveMetadata();
    log.debug('Session metadata updated', { sessionID: this.id, updates });
  }

  /**
   * Get all messages (stream)
   */
  async *getMessages(): AsyncIterable<MessageWithParts> {
    for await (const msg of this.storage.streamMessages(this.id)) {
      yield msg;
    }
  }

  /**
   * Get a specific message
   */
  async getMessage(messageID: string): Promise<MessageWithParts | null> {
    return await this.storage.getMessageWithParts(this.id, messageID);
  }

  /**
   * Get last message
   */
  async getLastMessage(): Promise<MessageWithParts | null> {
    return await this.storage.getLastMessage(this.id);
  }

  /**
   * Create user message
   */
  async createUserMessage(options: {
    agent: string;
    model: { providerID: string; modelID: string };
    system?: string;
    parts: Array<{ type: 'text'; text: string } | { type: 'file'; url: string; filename?: string; mime?: string }>;
  }): Promise<UserMessage> {
    const messageID = generateMessageID();
    const now = Date.now();

    const userMessage: UserMessage = {
      id: messageID,
      sessionID: this.id,
      role: 'user',
      time: { created: now },
      agent: options.agent,
      model: options.model,
      system: options.system,
    };

    await this.storage.saveMessage(this.id, messageID, userMessage);

    // Save parts
    for (const partInput of options.parts) {
      const partID = generatePartID();
      const part: Part =
        partInput.type === 'file'
          ? {
              id: partID,
              sessionID: this.id,
              messageID,
              type: 'file',
              mime: partInput.mime || 'text/plain',
              url: partInput.url,
              filename: partInput.filename,
            }
          : {
              id: partID,
              sessionID: this.id,
              messageID,
              type: 'text',
              text: partInput.text,
            };

      await this.storage.savePart(messageID, part);
    }

    // Update session metadata
    await this.updateMetadata({
      model: options.model,
      agent: options.agent,
    });

    // Auto-generate title from first user message
    const messages = await this.getAllMessages();
    if (messages.length === 1) {
      const firstTextPart = options.parts.find((p) => p.type === 'text');
      if (firstTextPart && firstTextPart.type === 'text') {
        const title = this.generateTitle(firstTextPart.text);
        await this.setTitle(title);
      }
    }

    log.debug('User message created', { sessionID: this.id, messageID });
    return userMessage;
  }

  /**
   * Create assistant message
   */
  async createAssistantMessage(options: {
    parentID: string;
    modelID: string;
    providerID: string;
    mode: string;
    agent: string;
    path: {
      cwd: string;
      root: string;
    };
  }): Promise<AssistantMessage> {
    const messageID = generateMessageID();
    const now = Date.now();

    const assistantMessage: AssistantMessage = {
      id: messageID,
      sessionID: this.id,
      role: 'assistant',
      time: { created: now },
      parentID: options.parentID,
      modelID: options.modelID,
      providerID: options.providerID,
      mode: options.mode,
      agent: options.agent,
      path: options.path,
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      },
    };

    await this.storage.saveMessage(this.id, messageID, assistantMessage);
    await this.setState(SessionState.Busy);

    log.debug('Assistant message created', { sessionID: this.id, messageID });
    return assistantMessage;
  }

  /**
   * Add part to message
   */
  async addPart(messageID: string, part: Omit<Part, 'id' | 'sessionID' | 'messageID'>): Promise<Part> {
    const partID = generatePartID();
    const fullPart: Part = {
      ...part,
      id: partID,
      sessionID: this.id,
      messageID,
    } as Part;

    await this.storage.savePart(messageID, fullPart);
    this._metadata.updated = Date.now();
    await this.saveMetadata();

    return fullPart;
  }

  /**
   * Update part
   */
  async updatePart(messageID: string, part: Part): Promise<void> {
    await this.storage.savePart(messageID, part);
    this._metadata.updated = Date.now();
    await this.saveMetadata();
  }

  /**
   * Get parts for a message
   */
  async getParts(messageID: string): Promise<Part[]> {
    return await this.storage.getParts(messageID);
  }

  /**
   * Complete assistant message
   */
  async completeAssistantMessage(
    messageID: string,
    options: {
      cost?: number;
      tokens?: {
        input: number;
        output: number;
        reasoning: number;
        cache: {
          read: number;
          write: number;
        };
      };
      finish?: string;
      summary?: boolean;
    }
  ): Promise<void> {
    await this.storage.completeAssistantMessage(messageID, options);
    await this.setState(SessionState.Idle);
    this._metadata.updated = Date.now();
    await this.saveMetadata();
  }

  /**
   * Set assistant message error
   */
  async setAssistantMessageError(messageID: string, error: {
    name: string;
    message: string;
    statusCode?: number;
    isRetryable?: boolean;
    providerID?: string;
  }): Promise<void> {
    await this.storage.setAssistantMessageError(messageID, error);
    await this.setState(SessionState.Idle);
    this._metadata.updated = Date.now();
    await this.saveMetadata();
  }

  /**
   * Delete message
   */
  async deleteMessage(messageID: string): Promise<void> {
    await this.storage.deleteMessage(this.id, messageID);
    this._metadata.updated = Date.now();
    await this.saveMetadata();
  }

  /**
   * Get all messages as array
   */
  private async getAllMessages(): Promise<MessageWithParts[]> {
    const messages: MessageWithParts[] = [];
    for await (const msg of this.getMessages()) {
      messages.push(msg);
    }
    return messages.reverse(); // Reverse to get chronological order
  }

  /**
   * Generate title from content
   */
  private generateTitle(content: string): string {
    const cleaned = content.replace(/\s+/g, ' ').trim();
    const maxLength = 50;

    if (cleaned.length === 0) {
      return `对话 ${new Date().toLocaleString()}`;
    }

    if (cleaned.length > maxLength) {
      return cleaned.substring(0, maxLength) + '...';
    }

    return cleaned;
  }

  /**
   * Save metadata to storage
   * This should be implemented by the storage layer
   */
  private async saveMetadata(): Promise<void> {
    // Metadata is saved through the session manager
    // This is a placeholder for future implementation
  }
}
