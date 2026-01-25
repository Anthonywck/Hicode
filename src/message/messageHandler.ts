/**
 * Message Handler
 * 处理聊天消息的发送和接收，集成API Client和Context Manager
 */

import { APIClientManager } from '../api/client';
import { ContextManager } from '../context/manager';
import { HistoryManager } from '../history/manager';
import { ChatRequest, ChatMessage, ChatResponse } from '../api/types';
import { ChatMessage as HistoryChatMessage } from '../history/types';

/**
 * 消息处理器配置
 */
export interface MessageHandlerConfig {
  /** 是否启用流式响应 */
  enableStreaming?: boolean;
  /** 默认温度参数 */
  defaultTemperature?: number;
  /** 默认最大token数 */
  defaultMaxTokens?: number;
  /** 是否自动包含代码上下文 */
  includeContext?: boolean;
}

/**
 * 发送消息的选项
 */
export interface SendMessageOptions {
  /** 是否使用流式响应 */
  stream?: boolean;
  /** 温度参数 */
  temperature?: number;
  /** 最大token数 */
  maxTokens?: number;
  /** 是否包含代码上下文 */
  includeContext?: boolean;
  /** 会话ID（如果不提供则使用当前会话） */
  sessionId?: string;
}

/**
 * 流式响应回调
 */
export interface StreamCallbacks {
  /** 接收到数据块时的回调 */
  onChunk: (chunk: string) => void;
  /** 流结束时的回调 */
  onEnd: () => void;
  /** 发生错误时的回调 */
  onError: (error: Error) => void;
}

/**
 * 消息处理器接口
 */
export interface IMessageHandler {
  /**
   * 发送消息
   * @param content 消息内容
   * @param options 发送选项
   * @returns 响应内容
   */
  handleSendMessage(
    content: string,
    options?: SendMessageOptions
  ): Promise<ChatResponse>;

  /**
   * 发送流式消息
   * @param content 消息内容
   * @param callbacks 流式响应回调
   * @param options 发送选项
   */
  handleSendStreamMessage(
    content: string,
    callbacks: StreamCallbacks,
    options?: SendMessageOptions
  ): Promise<void>;

  /**
   * 重新发送消息
   * @param messageIndex 消息索引
   * @param options 发送选项
   */
  resendMessage(
    messageIndex: number,
    options?: SendMessageOptions
  ): Promise<ChatResponse>;
}

/**
 * 消息处理器实现
 */
export class MessageHandler implements IMessageHandler {
  private config: Required<MessageHandlerConfig>;

  constructor(
    private apiClient: APIClientManager,
    private contextManager: ContextManager,
    private historyManager: HistoryManager,
    config?: MessageHandlerConfig
  ) {
    // 设置默认配置
    this.config = {
      enableStreaming: config?.enableStreaming ?? true,
      defaultTemperature: config?.defaultTemperature ?? 0.6,
      defaultMaxTokens: config?.defaultMaxTokens ?? 2000,
      includeContext: config?.includeContext ?? true
    };
  }

  /**
   * 发送消息（非流式）
   */
  async handleSendMessage(
    content: string,
    options?: SendMessageOptions
  ): Promise<ChatResponse> {
    // 验证输入
    if (!content || content.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }

    // 获取或创建会话
    const session = this.getOrCreateSession(options?.sessionId);

    // 收集代码上下文（如果启用）
    const includeContext = options?.includeContext ?? this.config.includeContext;
    const context = includeContext 
      ? await this.contextManager.getCurrentContext()
      : undefined;

    // 创建用户消息
    const userMessage: ChatMessage = {
      role: 'user',
      content: content.trim(),
      context,
      timestamp: new Date()
    };

    // 添加到历史记录
    this.historyManager.addMessage(session.id, userMessage as HistoryChatMessage);

    // 构建请求
    const request = this.buildChatRequest(session.id, options);

    try {
      // 发送请求
      const response = await this.apiClient.sendChatRequest(request);

      // 创建助手消息
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.content,
        timestamp: new Date()
      };

      // 添加到历史记录
      this.historyManager.addMessage(session.id, assistantMessage as HistoryChatMessage);

      return response;
    } catch (error) {
      // 记录错误
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to send message: ${errorMessage}`);
    }
  }

  /**
   * 发送流式消息
   */
  async handleSendStreamMessage(
    content: string,
    callbacks: StreamCallbacks,
    options?: SendMessageOptions
  ): Promise<void> {
    // 验证输入
    if (!content || content.trim().length === 0) {
      callbacks.onError(new Error('Message content cannot be empty'));
      return;
    }

    // 获取或创建会话
    const session = this.getOrCreateSession(options?.sessionId);

    // 收集代码上下文（如果启用）
    // 注意：上下文收集可能会比较耗时，考虑优化或异步处理
    const includeContext = options?.includeContext ?? this.config.includeContext;
    const contextStartTime = Date.now();
    const context = includeContext 
      ? await this.contextManager.getCurrentContext()
      : undefined;
    const contextTime = Date.now() - contextStartTime;
    
    if (contextTime > 100) {
      console.warn(`[MessageHandler] Context collection took ${contextTime}ms, consider optimizing`);
    }

    // 创建用户消息
    const userMessage: ChatMessage = {
      role: 'user',
      content: content.trim(),
      context,
      timestamp: new Date()
    };

    // 添加到历史记录
    // 检查是否重复添加（防止重复）
    const existingMessages = session.messages;
    const isDuplicate = existingMessages.length > 0 && 
      existingMessages[existingMessages.length - 1].role === 'user' &&
      existingMessages[existingMessages.length - 1].content === userMessage.content;
    
    if (isDuplicate) {
      console.warn(`[MessageHandler] Duplicate message detected, skipping addMessage`);
    } else {
      this.historyManager.addMessage(session.id, userMessage as HistoryChatMessage);
    }

    // 构建请求（强制使用流式）
    const request = this.buildChatRequest(session.id, { ...options, stream: true });

    // 累积响应内容
    let accumulatedContent = '';

    // 包装回调以累积内容
    const wrappedOnChunk = (chunk: string) => {
      accumulatedContent += chunk;
      callbacks.onChunk(chunk);
    };

    const wrappedOnEnd = () => {
      // 创建助手消息
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: accumulatedContent,
        timestamp: new Date()
      };

      // 添加到历史记录
      // 检查是否重复添加（防止重复）
      const existingMessages = this.historyManager.getSession(session.id)?.messages || [];
      const isDuplicate = existingMessages.length > 0 && 
        existingMessages[existingMessages.length - 1].role === 'assistant' &&
        existingMessages[existingMessages.length - 1].content === assistantMessage.content;
      
      if (isDuplicate) {
        console.warn(`[MessageHandler] Duplicate assistant message detected, skipping addMessage`);
      } else {
        this.historyManager.addMessage(session.id, assistantMessage as HistoryChatMessage);
      }

      callbacks.onEnd();
    };

    const wrappedOnError = (error: Error) => {
      callbacks.onError(error);
    };

    try {
      // 发送流式请求
      await this.apiClient.sendStreamChatRequest(
        request,
        wrappedOnChunk,
        wrappedOnEnd,
        wrappedOnError
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      callbacks.onError(new Error(`Failed to send stream message: ${errorMessage}`));
    }
  }

  /**
   * 重新发送消息
   */
  async resendMessage(
    messageIndex: number,
    options?: SendMessageOptions
  ): Promise<ChatResponse> {
    // 获取当前会话
    const session = this.historyManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session found');
    }

    // 验证消息索引
    if (messageIndex < 0 || messageIndex >= session.messages.length) {
      throw new Error('Invalid message index');
    }

    // 获取要重新发送的消息
    const message = session.messages[messageIndex];
    if (message.role !== 'user') {
      throw new Error('Can only resend user messages');
    }

    // 删除该消息之后的所有消息
    session.messages.splice(messageIndex);

    // 重新发送消息
    return this.handleSendMessage(message.content, {
      ...options,
      sessionId: session.id,
      includeContext: !!message.context
    });
  }

  /**
   * 获取或创建会话
   */
  private getOrCreateSession(sessionId?: string) {
    if (sessionId) {
      const session = this.historyManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      return session;
    }

    // 获取当前会话
    let session = this.historyManager.getCurrentSession();
    
    // 如果没有当前会话，创建新会话
    if (!session) {
      const currentModel = this.apiClient.getCurrentModel();
      if (!currentModel) {
        throw new Error('No model is currently selected');
      }
      session = this.historyManager.createSession(currentModel);
    }

    return session;
  }

  /**
   * 构建聊天请求
   */
  private buildChatRequest(
    sessionId: string,
    options?: SendMessageOptions
  ): ChatRequest {
    // 获取会话
    const session = this.historyManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 构建消息列表（深拷贝，避免修改原始消息）
    const messages: ChatMessage[] = session.messages.map(msg => ({
      ...msg,
      // 移除context字段，避免在请求中重复包含上下文信息
      // context信息已经在enrichMessageContent中处理过了
      context: undefined
    }));

    // 添加系统消息（如果还没有）
    if (messages.length === 0 || messages[0].role !== 'system') {
      messages.unshift({
        role: 'system',
        content: 'You are a professional programming assistant named "Hicode", which can assist developers in solving programming problems, understanding code, and providing technical advice.',
        timestamp: new Date()
      });
    }

    // 构建请求
    // temperature 和 maxTokens 不再单独传递，temperature 会从模型配置中获取，maxTokens 不设置
    const request: ChatRequest = {
      messages,
      model: session.model,
      stream: options?.stream ?? this.config.enableStreaming
      // temperature 和 maxTokens 已移除，temperature 从模型配置中获取，maxTokens 不设置
    } as ChatRequest;

    // 添加 sessionId 到请求中（用于 gRPC 调用）
    (request as any).sessionId = sessionId;

    return request;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<MessageHandlerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * 获取当前配置
   */
  getConfig(): MessageHandlerConfig {
    return { ...this.config };
  }
}
