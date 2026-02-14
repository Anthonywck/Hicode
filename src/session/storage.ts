/**
 * 会话存储接口
 * 定义消息和会话数据的存储抽象层
 */

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import {
  MessageWithParts,
  Part,
  UserMessage,
  AssistantMessage,
  MessageInfo,
  MessageError,
} from './message-v2';

const logger = createLogger('session.storage');

/**
 * 会话存储接口
 */
export interface ISessionStorage {
  /**
   * 保存消息
   * @param sessionID 会话ID
   * @param messageID 消息ID
   * @param message 消息内容
   */
  saveMessage(sessionID: string, messageID: string, message: MessageInfo): Promise<void>;

  /**
   * 获取消息
   * @param sessionID 会话ID
   * @param messageID 消息ID
   * @returns 消息内容，如果不存在则返回null
   */
  getMessage(sessionID: string, messageID: string): Promise<MessageInfo | null>;

  /**
   * 获取带部分的消息
   * @param sessionID 会话ID
   * @param messageID 消息ID
   * @returns 带部分的消息，如果不存在则返回null
   */
  getMessageWithParts(sessionID: string, messageID: string): Promise<MessageWithParts | null>;

  /**
   * 获取会话的所有消息（按时间倒序）
   * @param sessionID 会话ID
   * @returns 消息生成器
   */
  streamMessages(sessionID: string): AsyncIterable<MessageWithParts>;

  /**
   * 保存消息部分
   * @param messageID 消息ID
   * @param part 消息部分
   */
  savePart(messageID: string, part: Part): Promise<void>;

  /**
   * 获取消息的所有部分
   * @param messageID 消息ID
   * @returns 消息部分列表
   */
  getParts(messageID: string): Promise<Part[]>;

  /**
   * 删除消息
   * @param sessionID 会话ID
   * @param messageID 消息ID
   */
  deleteMessage(sessionID: string, messageID: string): Promise<void>;

  /**
   * 删除会话的所有消息
   * @param sessionID 会话ID
   */
  deleteSessionMessages(sessionID: string): Promise<void>;

  /**
   * 获取会话的最后一条消息
   * @param sessionID 会话ID
   * @returns 最后一条消息，如果没有则返回null
   */
  getLastMessage(sessionID: string): Promise<MessageWithParts | null>;

  /**
   * 创建助手消息
   * @param options 创建选项
   * @returns 助手消息
   */
  createAssistantMessage(options: {
    sessionID: string;
    parentID: string;
    modelID: string;
    providerID: string;
    mode: string;
    agent: string;
    path: {
      cwd: string;
      root: string;
    };
  }): Promise<AssistantMessage>;

  /**
   * 添加消息部分
   * @param messageID 消息ID
   * @param part 消息部分（不包含id、sessionID、messageID）
   * @returns 添加的消息部分
   */
  addPart(messageID: string, part: Omit<Part, 'id' | 'sessionID' | 'messageID'>): Promise<Part>;

  /**
   * 更新消息部分
   * @param messageID 消息ID
   * @param part 消息部分
   */
  updatePart(messageID: string, part: Part): Promise<void>;

  /**
   * 设置助手消息错误
   * @param messageID 消息ID
   * @param error 错误信息
   */
  setAssistantMessageError(messageID: string, error: {
    name: string;
    message: string;
    statusCode?: number;
    isRetryable?: boolean;
    providerID?: string;
  }): Promise<void>;

  /**
   * 完成助手消息
   * @param messageID 消息ID
   * @param options 完成选项
   */
  completeAssistantMessage(messageID: string, options: {
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
  }): Promise<void>;

  /**
   * 创建用户消息
   * @param options 创建选项
   * @returns 用户消息
   */
  createUserMessage(options: {
    sessionID: string;
    messageID: string;
    agent: string;
    model: { providerID: string; modelID: string };
    system?: string;
    parts: Array<{ type: 'text'; text: string } | { type: 'file'; url: string; filename?: string }>;
    time: { created: number };
  }): Promise<UserMessage>;
}

/**
 * VSCode扩展会话存储实现
 * 使用全局状态存储消息数据
 */
export class VSCodeSessionStorage implements ISessionStorage {
  private readonly messagesStorageKey = 'hicode.messages';
  private readonly partsStorageKey = 'hicode.message_parts';

  constructor(private context: vscode.ExtensionContext) {
    logger.info('VSCodeSessionStorage 初始化');
  }

  /**
   * 保存消息
   */
  async saveMessage(sessionID: string, messageID: string, message: MessageInfo): Promise<void> {
    const messages = await this.loadMessages();
    
    if (!messages.has(sessionID)) {
      messages.set(sessionID, new Map());
    }
    
    const sessionMessages = messages.get(sessionID)!;
    sessionMessages.set(messageID, message);
    
    await this.saveMessages(messages);
    logger.debug('消息已保存', { sessionID, messageID });
  }

  /**
   * 获取消息
   */
  async getMessage(sessionID: string, messageID: string): Promise<MessageInfo | null> {
    const messages = await this.loadMessages();
    const sessionMessages = messages.get(sessionID);
    
    if (!sessionMessages) {
      return null;
    }
    
    return sessionMessages.get(messageID) || null;
  }

  /**
   * 获取带部分的消息
   */
  async getMessageWithParts(sessionID: string, messageID: string): Promise<MessageWithParts | null> {
    const message = await this.getMessage(sessionID, messageID);
    
    if (!message) {
      return null;
    }
    
    const parts = await this.getParts(messageID);
    
    return {
      info: message,
      parts,
    };
  }

  /**
   * 获取会话的所有消息（按时间倒序）
   */
  async* streamMessages(sessionID: string): AsyncIterable<MessageWithParts> {
    const messages = await this.loadMessages();
    const sessionMessages = messages.get(sessionID);
    
    if (!sessionMessages) {
      return;
    }
    
    // 获取所有消息并按时间排序（倒序）
    const sortedMessages = Array.from(sessionMessages.values())
      .sort((a, b) => b.time.created - a.time.created);
    
    for (const message of sortedMessages) {
      const parts = await this.getParts(message.id);
      yield {
        info: message,
        parts,
      };
    }
  }

  /**
   * 保存消息部分
   */
  async savePart(messageID: string, part: Part): Promise<void> {
    const parts = await this.loadParts();
    
    if (!parts.has(messageID)) {
      parts.set(messageID, []);
    }
    
    const messageParts = parts.get(messageID)!;
    
    // 查找是否已存在该部分
    const existingIndex = messageParts.findIndex(p => p.id === part.id);
    if (existingIndex >= 0) {
      // 更新现有部分
      messageParts[existingIndex] = part;
    } else {
      // 添加新部分
      messageParts.push(part);
    }
    
    await this.saveParts(parts);
    logger.debug('消息部分已保存', { messageID, partID: part.id, type: part.type });
  }

  /**
   * 获取消息的所有部分
   */
  async getParts(messageID: string): Promise<Part[]> {
    const parts = await this.loadParts();
    const messageParts = parts.get(messageID);
    
    if (!messageParts) {
      return [];
    }
    
    // 按时间排序
    return messageParts.sort((a, b) => {
      const aTime = (a as any).time?.start || 0;
      const bTime = (b as any).time?.start || 0;
      return aTime - bTime;
    });
  }

  /**
   * 删除消息
   */
  async deleteMessage(sessionID: string, messageID: string): Promise<void> {
    // 删除消息
    const messages = await this.loadMessages();
    const sessionMessages = messages.get(sessionID);
    
    if (sessionMessages) {
      sessionMessages.delete(messageID);
      
      if (sessionMessages.size === 0) {
        messages.delete(sessionID);
      }
      
      await this.saveMessages(messages);
    }
    
    // 删除消息的所有部分
    const parts = await this.loadParts();
    parts.delete(messageID);
    await this.saveParts(parts);
    
    logger.debug('消息已删除', { sessionID, messageID });
  }

  /**
   * 删除会话的所有消息
   */
  async deleteSessionMessages(sessionID: string): Promise<void> {
    // 获取会话的所有消息ID
    const messages = await this.loadMessages();
    const sessionMessages = messages.get(sessionID);
    const messageIDs = sessionMessages ? Array.from(sessionMessages.keys()) : [];
    
    // 删除会话消息
    messages.delete(sessionID);
    await this.saveMessages(messages);
    
    // 删除所有消息的部分
    const parts = await this.loadParts();
    for (const messageID of messageIDs) {
      parts.delete(messageID);
    }
    await this.saveParts(parts);
    
    logger.debug('会话的所有消息已删除', { sessionID, messageCount: messageIDs.length });
  }

  /**
   * 获取会话的最后一条消息
   */
  async getLastMessage(sessionID: string): Promise<MessageWithParts | null> {
    const messages = await this.loadMessages();
    const sessionMessages = messages.get(sessionID);
    
    if (!sessionMessages || sessionMessages.size === 0) {
      return null;
    }
    
    // 找到最新的一条消息
    let latestMessage: MessageInfo | null = null;
    let latestTime = 0;
    
    for (const message of sessionMessages.values()) {
      if (message.time.created > latestTime) {
        latestTime = message.time.created;
        latestMessage = message;
      }
    }
    
    if (!latestMessage) {
      return null;
    }
    
    const parts = await this.getParts(latestMessage.id);
    
    return {
      info: latestMessage,
      parts,
    };
  }

  /**
   * 创建助手消息
   */
  async createAssistantMessage(options: {
    sessionID: string;
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
    const messageID = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const now = Date.now();
    
    const message: AssistantMessage = {
      id: messageID,
      sessionID: options.sessionID,
      role: 'assistant',
      time: {
        created: now,
      },
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
    
    await this.saveMessage(options.sessionID, messageID, message);
    return message;
  }

  /**
   * 创建用户消息
   */
  async createUserMessage(options: {
    sessionID: string;
    messageID: string;
    agent: string;
    model: { providerID: string; modelID: string };
    system?: string;
    parts: Array<{ type: 'text'; text: string } | { type: 'file'; url: string; filename?: string }>;
    time: { created: number };
  }): Promise<UserMessage> {
    const message: UserMessage = {
      id: options.messageID,
      sessionID: options.sessionID,
      role: 'user',
      time: options.time,
      agent: options.agent,
      model: options.model,
      system: options.system,
    };

    await this.saveMessage(options.sessionID, options.messageID, message);

    // 保存消息部分
    for (const part of options.parts) {
      await this.addPart(options.messageID, part as any);
    }

    return message;
  }

  /**
   * 添加消息部分
   */
  async addPart(messageID: string, part: Omit<Part, 'id' | 'sessionID' | 'messageID'>): Promise<Part> {
    const partID = `part_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    // 获取消息以确定 sessionID
    const messages = await this.loadMessages();
    let sessionID = 'default_session';
    for (const [sid, sessionMessages] of messages.entries()) {
      if (sessionMessages.has(messageID)) {
        sessionID = sid;
        break;
      }
    }
    
    const fullPart: Part = {
      ...part,
      id: partID,
      sessionID,
      messageID,
    } as Part;
    
    await this.savePart(messageID, fullPart);
    return fullPart;
  }

  /**
   * 更新消息部分
   */
  async updatePart(messageID: string, part: Part): Promise<void> {
    await this.savePart(messageID, part);
  }

  /**
   * 设置助手消息错误
   */
  async setAssistantMessageError(messageID: string, error: {
    name: string;
    message: string;
    statusCode?: number;
    isRetryable?: boolean;
    providerID?: string;
  }): Promise<void> {
    // 从所有会话中查找消息（因为不知道 sessionID）
    const messages = await this.loadMessages();
    let message: MessageInfo | null = null;
    let sessionID: string | null = null;
    
    for (const [sid, sessionMessages] of messages.entries()) {
      const msg = sessionMessages.get(messageID);
      if (msg) {
        message = msg;
        sessionID = sid;
        break;
      }
    }
    
    if (!message || !sessionID || message.role !== 'assistant') {
      throw new Error(`消息 ${messageID} 不存在或不是助手消息`);
    }
    
    // Convert error to MessageError format
    const messageError: MessageError = error.name === 'APIError'
      ? {
          name: 'APIError',
          message: error.message,
          statusCode: error.statusCode,
          isRetryable: error.isRetryable ?? false,
        }
      : error.name === 'ProviderAuthError'
      ? {
          name: 'ProviderAuthError',
          providerID: error.providerID || '',
          message: error.message,
        }
      : error.name === 'MessageAbortedError'
      ? {
          name: 'MessageAbortedError',
          message: error.message,
        }
      : {
          name: 'Unknown',
          message: error.message,
        };
    
    const updated: AssistantMessage = {
      ...message,
      error: messageError,
    };
    
    await this.saveMessage(sessionID, messageID, updated);
  }

  /**
   * 完成助手消息
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
    // 从所有会话中查找消息（因为不知道 sessionID）
    const messages = await this.loadMessages();
    let message: MessageInfo | null = null;
    let sessionID: string | null = null;
    
    for (const [sid, sessionMessages] of messages.entries()) {
      const msg = sessionMessages.get(messageID);
      if (msg) {
        message = msg;
        sessionID = sid;
        break;
      }
    }
    
    if (!message || !sessionID) {
      // 记录详细信息以便调试
      const allMessageIDs: string[] = [];
      for (const [sid, sessionMessages] of messages.entries()) {
        for (const msgID of sessionMessages.keys()) {
          allMessageIDs.push(`${sid}:${msgID}`);
        }
      }
      logger.error('消息不存在，无法完成', {
        messageID,
        totalSessions: messages.size,
        totalMessages: allMessageIDs.length,
        sampleMessageIDs: allMessageIDs.slice(0, 10),
      });
      throw new Error(`消息 ${messageID} 不存在`);
    }
    
    // 检查 role 字段（可能是字符串 'assistant' 或 MessageRole.Assistant）
    const msgRole = (message as any).role;
    if (msgRole !== 'assistant' && msgRole !== 'assistant') {
      // 记录详细信息以便调试
      logger.warn('消息 role 不匹配', { 
        messageID, 
        expectedRole: 'assistant', 
        actualRole: msgRole,
        messageKeys: Object.keys(message)
      });
      throw new Error(`消息 ${messageID} 不是助手消息（role: ${msgRole}）`);
    }
    
    // 确保消息是 AssistantMessage 类型
    if (msgRole !== 'assistant') {
      throw new Error(`消息 ${messageID} 不是助手消息（role: ${msgRole}）`);
    }
    
    const assistantMsg = message as AssistantMessage;
    const updated: AssistantMessage = {
      ...assistantMsg,
      time: {
        ...assistantMsg.time,
        completed: Date.now(),
      },
      cost: options.cost ?? assistantMsg.cost,
      tokens: options.tokens ?? assistantMsg.tokens,
      finish: options.finish ?? assistantMsg.finish,
      summary: options.summary ?? assistantMsg.summary,
    };
    
    await this.saveMessage(sessionID, messageID, updated);
  }

  /**
   * 加载所有消息
   */
  private async loadMessages(): Promise<Map<string, Map<string, MessageInfo>>> {
    const data = this.context.globalState.get<string>(this.messagesStorageKey);
    
    if (!data) {
      return new Map();
    }
    
    try {
      const parsedData = JSON.parse(data) as Record<string, Record<string, MessageInfo>>;
      const result = new Map<string, Map<string, MessageInfo>>();
      
      for (const [sessionID, sessionMessages] of Object.entries(parsedData)) {
        const messagesMap = new Map<string, MessageInfo>();
        for (const [messageID, message] of Object.entries(sessionMessages)) {
          messagesMap.set(messageID, message);
        }
        result.set(sessionID, messagesMap);
      }
      
      return result;
    } catch (error) {
      logger.error('加载消息失败', error);
      return new Map();
    }
  }

  /**
   * 保存所有消息
   */
  private async saveMessages(messages: Map<string, Map<string, MessageInfo>>): Promise<void> {
    const data: Record<string, Record<string, MessageInfo>> = {};
    
    for (const [sessionID, sessionMessages] of messages.entries()) {
      data[sessionID] = {};
      for (const [messageID, message] of sessionMessages.entries()) {
        data[sessionID][messageID] = message;
      }
    }
    
    await this.context.globalState.update(this.messagesStorageKey, JSON.stringify(data));
  }

  /**
   * 加载所有消息部分
   */
  private async loadParts(): Promise<Map<string, Part[]>> {
    const data = this.context.globalState.get<string>(this.partsStorageKey);
    
    if (!data) {
      return new Map();
    }
    
    try {
      const parsedData = JSON.parse(data) as Record<string, Part[]>;
      const result = new Map<string, Part[]>();
      
      for (const [messageID, parts] of Object.entries(parsedData)) {
        result.set(messageID, parts);
      }
      
      return result;
    } catch (error) {
      logger.error('加载消息部分失败', error);
      return new Map();
    }
  }

  /**
   * 保存所有消息部分
   */
  private async saveParts(parts: Map<string, Part[]>): Promise<void> {
    const data: Record<string, Part[]> = {};
    
    for (const [messageID, messageParts] of parts.entries()) {
      data[messageID] = messageParts;
    }
    
    await this.context.globalState.update(this.partsStorageKey, JSON.stringify(data));
  }
}