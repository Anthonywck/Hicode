/**
 * Session 类
 * 封装会话操作，提供消息和部分的访问接口
 * 参考 opencode 的设计，但使用类的方式实现
 */

import * as vscode from 'vscode';
import { ISessionStorage, VSCodeSessionStorage } from './storage';
import { MessageWithParts, Part, MessageRole, generateMessageID } from './message';
import { createLogger } from '../utils/logger';

const log = createLogger('session.class');

/**
 * 会话信息
 */
export interface SessionInfo {
  /** 会话ID */
  id: string;
  /** 会话标题 */
  title: string;
  /** 创建时间 */
  created: number;
  /** 更新时间 */
  updated: number;
}

/**
 * Session 类
 * 提供会话级别的消息和部分操作
 */
export class Session {
  /** 会话信息 */
  public readonly info: SessionInfo;
  private storage: ISessionStorage;

  constructor(info: SessionInfo, storage: ISessionStorage) {
    this.info = info;
    this.storage = storage;
  }

  /**
   * 获取所有消息（按时间倒序）
   */
  async *getMessages(): AsyncIterable<MessageWithParts> {
    for await (const msg of this.storage.streamMessages(this.info.id)) {
      yield msg;
    }
  }

  /**
   * 获取指定消息
   */
  async getMessage(messageID: string): Promise<MessageWithParts | null> {
    return await this.storage.getMessageWithParts(this.info.id, messageID);
  }

  /**
   * 获取消息的所有部分
   */
  async getParts(messageID: string): Promise<Part[]> {
    const message = await this.getMessage(messageID);
    return message?.parts || [];
  }

  /**
   * 创建用户消息
   */
  async createUserMessage(input: {
    agent: string;
    model: { providerID: string; modelID: string };
    system?: string;
    parts: Array<{ type: 'text'; text: string } | { type: 'file'; url: string; filename?: string }>;
  }): Promise<MessageWithParts> {
    const messageID = generateMessageID();
    const now = Date.now();

    const userMessage = await this.storage.createUserMessage({
      sessionID: this.info.id,
      messageID,
      agent: input.agent,
      model: input.model,
      system: input.system,
      parts: input.parts,
      time: {
        created: now,
      },
    });

    return {
      ...userMessage,
      parts: input.parts.map((part, idx) => {
        const basePart = {
          id: `part_${now}_${idx}`,
          sessionID: this.info.id,
          messageID,
        };
        
        if (part.type === 'file') {
          return {
            ...basePart,
            type: 'file' as const,
            mime: 'text/plain', // 默认 MIME 类型
            url: part.url,
            filename: part.filename,
          };
        } else {
          return {
            ...basePart,
            type: 'text' as const,
            text: part.text,
          };
        }
      }),
    };
  }

  /**
   * 添加文本部分到指定消息
   */
  async addTextPart(messageID: string, text: string): Promise<void> {
    await this.storage.addPart(messageID, {
      type: 'text' as const,
      text,
    } as any);
  }
}
