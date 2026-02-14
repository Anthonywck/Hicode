/**
 * Message Handler
 * 处理聊天消息的发送和接收，集成API Client和Context Manager
 * 使用新的 Session 系统替代 HistoryManager
 */

import { APIClientManager } from '../api/client';
import { ContextManager } from '../context/manager';
import { ChatRequest, ChatMessage, ChatResponse } from '../api/types';
import { Session } from '../session/sessionClass';
import { SessionFactory, getSessionFactory } from '../session/factory';
import { SessionManager, getSessionManager } from '../session/session';
import { prompt, PromptInput } from '../session/prompt';
import { MessageWithParts, MessageRole } from '../session/message';
import * as vscode from 'vscode';
import { getExtensionContext } from '../extension';

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
 * 资源数据结构
 */
export interface ResourceData {
  /** 资源类型 */
  type: 'code' | 'file' | 'image' | 'folder';
  /** 代码内容（type为code时使用） */
  code?: string;
  /** 代码语言（type为code时使用） */
  language?: string;
  /** 代码语言ID（type为code时使用） */
  languageId?: string;
  /** 文件路径 */
  filePath?: string;
  /** 起始行号（type为code时使用） */
  startLine?: number;
  /** 结束行号（type为code时使用） */
  endLine?: number;
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
  /** 资源列表 */
  resources?: ResourceData[];
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
  /** 工具调用更新时的回调（可选） */
  onToolCallUpdate?: (update: ToolCallUpdate) => void;
}

/**
 * 工具调用更新
 */
export interface ToolCallUpdate {
  /** 更新类型 */
  type: 'start' | 'complete' | 'error';
  /** 工具名称 */
  toolName: string;
  /** 工具调用ID */
  toolCallId: string;
  /** 工具参数（start时） */
  args?: Record<string, any>;
  /** 工具结果（complete时） */
  result?: string;
  /** 错误信息（error时） */
  error?: string;
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
 * 使用新的 Session 系统替代 HistoryManager
 */
export class MessageHandler implements IMessageHandler {
  private config: Required<MessageHandlerConfig>;
  private sessionFactory: SessionFactory | null = null;
  private sessionManager: SessionManager | null = null;

  constructor(
    private apiClient: APIClientManager,
    private contextManager: ContextManager,
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
   * 初始化 Session 工厂和管理器
   */
  private async initializeSession(): Promise<void> {
    if (!this.sessionFactory || !this.sessionManager) {
      const context = await getExtensionContext();
      this.sessionFactory = getSessionFactory(context);
      this.sessionManager = getSessionManager(context);
    }
  }

  /**
   * 发送消息（非流式）
   * 注意：非流式消息现在通过流式接口实现，然后等待完成
   */
  async handleSendMessage(
    content: string,
    options?: SendMessageOptions
  ): Promise<ChatResponse> {
    // 验证输入
    if (!content || content.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }

    // 累积响应内容
    let accumulatedContent = '';
    let finalResponse: ChatResponse | null = null;

// 使用流式接口，但等待完成
    console.log(`[HICODE DEBUG] handleSendMessage调用handleSendStreamMessage`);
    await this.handleSendStreamMessage(
      content,
      {
        onChunk: (chunk: string) => {
          accumulatedContent += chunk;
          console.log(`[HICODE DEBUG] 非流式处理累积文本块 - 长度: ${chunk.length}, 总长度: ${accumulatedContent.length}`);
        },
        onEnd: () => {
          // 流结束，构建响应
          console.log(`[HICODE DEBUG] 非流式处理完成 - 总长度: ${accumulatedContent.length}`);
          finalResponse = {
            content: accumulatedContent,
            finishReason: 'stop',
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0
            }
          };
        },
        onError: (error: Error) => {
          console.error(`[HICODE DEBUG] 非流式处理错误:`, error);
          throw error;
        }
      },
      options
    );

    if (!finalResponse) {
      throw new Error('Failed to get response');
    }

    return finalResponse;
  }

  /**
   * 发送流式消息
   * 使用新的 Session 系统和主循环
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

    try {
      // 初始化 Session 系统
      await this.initializeSession();
      
      if (!this.sessionFactory || !this.sessionManager) {
        throw new Error('Session system not initialized');
      }

      // 获取或创建会话
      const session = await this.getOrCreateSession(options?.sessionId);

      // 获取当前模型配置
      const currentModelId = this.apiClient.getCurrentModel();
      
      if (!currentModelId) {
        throw new Error('No model is currently selected. Please select a model first.');
      }

      // 解析模型ID (格式: providerID/modelID)
      const [providerID, modelID] = currentModelId.includes('/')
        ? currentModelId.split('/', 2)
        : ['openai', currentModelId];

      // 构建 PromptInput
      const promptInput: PromptInput = {
        sessionID: session.info.id,
        model: {
          providerID,
          modelID,
        },
        parts: [
          {
            type: 'text',
            text: content.trim(),
          },
        ],
      };

      // 如果有资源，添加文件部分
      if (options?.resources && options.resources.length > 0) {
        for (const resource of options.resources) {
          if (resource.type === 'file' && resource.filePath) {
            promptInput.parts.push({
              type: 'file',
              url: resource.filePath,
              filename: resource.filePath.split('/').pop() || resource.filePath,
            });
          } else if (resource.type === 'code' && resource.code) {
            // 代码资源转换为文本
            promptInput.parts.push({
              type: 'text',
              text: `\n\`\`\`${resource.language || 'text'}\n${resource.code}\n\`\`\`\n`,
            });
          }
        }
      }

      // 启动主循环，直接传递回调函数以支持实时流式更新
      // 使用回调方式实现流式响应（参考 opencode 的实现）
      console.log(`[HICODE DEBUG] MessageHandler开始调用prompt函数`);
      const result = await prompt({
        ...promptInput,
        onTextChunk: (chunk: string) => {
          // 实时发送文本增量到前端
          callbacks.onChunk(chunk);
        },
        onToolCallUpdate: (toolCall: any) => {
          // 实时发送工具调用更新到前端
          console.log(`[HICODE DEBUG] 收到工具调用更新:`, toolCall);
          if (callbacks.onToolCallUpdate) {
            callbacks.onToolCallUpdate({
              type: toolCall.type || 'start',
              toolName: toolCall.toolName || toolCall.tool || '',
              toolCallId: toolCall.toolCallId || toolCall.id || '',
              args: toolCall.args || toolCall.input,
              result: toolCall.result,
              error: toolCall.error,
            });
          }
        },
      });
      
      console.log(`[HICODE DEBUG] prompt函数调用完成`);
      // 发送完成标志
      callbacks.onEnd();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[HICODE DEBUG] prompt函数调用失败:`, error);
      
      // 如果是 API 错误（如 ZhipuAI 的 messages 参数非法），提供更详细的错误信息
      const apiError = error as any;
      if (apiError?.statusCode === 400 && apiError?.data?.error) {
        const apiErrorMessage = apiError.data.error.message || apiError.data.error.code || errorMessage;
        callbacks.onError(new Error(`API 请求失败: ${apiErrorMessage}`));
      } else {
        callbacks.onError(new Error(`Failed to send stream message: ${errorMessage}`));
      }
    }
  }


  /**
   * 重新发送消息
   * 注意：新 Session 系统中，需要根据消息ID重新发送
   */
  async resendMessage(
    messageIndex: number,
    options?: SendMessageOptions
  ): Promise<ChatResponse> {
    // 初始化 Session 系统
    await this.initializeSession();
    if (!this.sessionFactory || !this.sessionManager) {
      throw new Error('Session system not initialized');
    }

    // 获取会话
    if (!options?.sessionId) {
      throw new Error('Session ID is required for resending messages');
    }

    const session = await this.sessionFactory.getSession(options.sessionId);
    if (!session) {
      throw new Error(`Session ${options.sessionId} not found`);
    }

    // 获取所有消息
    const messages: MessageWithParts[] = [];
    for await (const msg of session.getMessages()) {
      messages.push(msg);
    }

    // 反转顺序，从旧到新
    messages.reverse();

    // 验证消息索引
    if (messageIndex < 0 || messageIndex >= messages.length) {
      throw new Error('Invalid message index');
    }

    // 获取要重新发送的消息
    const message = messages[messageIndex];
    if (message.role !== MessageRole.User) {
      throw new Error('Can only resend user messages');
    }

    // 获取消息的文本内容
    const textParts = message.parts.filter(p => p.type === 'text');
    const content = textParts.map(p => (p as any).text).join('');

    if (!content) {
      throw new Error('Message has no text content');
    }

    // 删除该消息之后的所有消息
    // TODO: 实现消息删除功能
    // 暂时通过创建新会话或使用消息ID来处理

    // 重新发送消息
    return this.handleSendMessage(content, {
      ...options,
      sessionId: options.sessionId,
    });
  }

  /**
   * 获取或创建会话
   */
  private async getOrCreateSession(sessionId?: string): Promise<Session> {
    await this.initializeSession();
    if (!this.sessionFactory || !this.sessionManager) {
      throw new Error('Session system not initialized');
    }

    if (sessionId) {
      const session = await this.sessionFactory.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      return session;
    }

    // 获取当前模型
    const currentModel = this.apiClient.getCurrentModel();
    if (!currentModel) {
      throw new Error('No model is currently selected. Please select a model first.');
    }

    // 创建新会话
    const session = await this.sessionFactory.createSession(`对话 ${new Date().toLocaleString()}`);

    return session;
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
