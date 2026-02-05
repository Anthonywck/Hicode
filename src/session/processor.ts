/**
 * 会话处理器模块
 * 处理LLM响应流，管理工具调用和消息生成
 */

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { MessageRole, MessageWithParts, TextPart, ToolCallPart, AssistantMessage, UserMessage } from './message';
import { ISessionStorage } from './storage';
import type { ModelConfig } from '../api/types';
import type { AgentConfig } from '../agent/types';
import type { Tool as ToolInfo } from '../tool/tool';
import { ToolRegistry } from '../tool/registry';
import { stream as streamLLM, type StreamOutput } from './llm';
import type { ModelMessage } from 'ai';

const logger = createLogger('session.processor');

/**
 * 会话处理器配置
 */
export interface ProcessorConfig {
  /** 会话ID */
  sessionID: string;
  /** 用户消息 */
  userMessage: UserMessage;
  /** 模型配置 */
  model: ModelConfig;
  /** Agent配置 */
  agent: AgentConfig;
  /** 工具注册表 */
  toolRegistry?: ToolRegistry;
  /** 语言模型实例 */
  languageModel: any;
  /** Provider信息 */
  provider: any;
  /** 消息历史 */
  messages: ModelMessage[];
  /** 中止信号 */
  abort: AbortSignal;
  /** 存储接口 */
  storage: ISessionStorage;
}

/**
 * 处理结果
 */
export interface ProcessorResult {
  /** 助手消息 */
  assistantMessage: AssistantMessage;
  /** 是否已完成 */
  completed: boolean;
  /** 错误信息（如果有） */
  error?: Error;
  /** 是否应该继续循环（工具调用后需要继续处理） */
  shouldContinue?: boolean;
}

/**
 * 会话处理器
 */
export class SessionProcessor {
  private config: ProcessorConfig;
  private assistantMessage: AssistantMessage | null = null;
  private toolCalls: Map<string, ToolCallPart> = new Map();
  private currentTextPart: TextPart | null = null;
  private isProcessing = false;
  /** 文本块回调 */
  public onTextChunk?: (chunk: string) => void;
  /** 工具调用更新回调 */
  public onToolCallUpdate?: (toolCall: any) => void;

  constructor(config: ProcessorConfig) {
    this.config = config;
    logger.info('SessionProcessor 初始化', { sessionID: config.sessionID });
  }

  /**
   * 重置处理器状态，用于循环中创建新的助手消息
   */
  reset(): void {
    this.assistantMessage = null;
    this.toolCalls.clear();
    this.currentTextPart = null;
    this.isProcessing = false;
  }

  /**
   * 处理会话
   * 返回处理状态：'continue' 表示需要继续（工具调用后），'stop' 表示完成
   */
  async process(): Promise<'continue' | 'stop'> {
    if (this.isProcessing) {
      throw new Error('会话正在处理中');
    }

    this.isProcessing = true;
    let shouldContinue = false;

    try {
      // 创建助手消息（如果还没有）
      if (!this.assistantMessage) {
        this.assistantMessage = await this.createAssistantMessage();
      }

      // 构建LLM流输入（每次获取最新消息历史）
      const streamInput = await this.buildStreamInput();

      // 开始流处理
      const streamResult = await streamLLM(streamInput);
      
      // 处理流（使用 fullStream，参考 opencode）
      shouldContinue = await this.processStream(streamResult.stream.fullStream);

      // 如果 finishReason 是 tool-calls，需要继续
      if (shouldContinue) {
        return 'continue';
      }
      
      return 'stop';
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('会话处理失败', { error: error.message, sessionID: this.config.sessionID });
      
      if (this.assistantMessage) {
        await this.config.storage.setAssistantMessageError(this.assistantMessage.id, {
          name: error.name,
          message: error.message,
          isRetryable: false,
        });
      }
      return 'stop';
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 创建助手消息
   */
  private async createAssistantMessage(): Promise<AssistantMessage> {
    if (!this.config.storage) {
      throw new Error('存储接口未提供');
    }

    return await this.config.storage.createAssistantMessage({
      sessionID: this.config.sessionID,
      parentID: this.config.userMessage.id,
      modelID: this.config.model.modelID,
      providerID: this.config.model.providerID,
      mode: this.config.agent.mode || 'primary',
      agent: this.config.agent.name,
      path: {
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        root: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
      },
    });
  }

  /**
   * 构建流输入
   * 每次调用时获取最新的消息历史（包含工具调用结果）
   */
  private async buildStreamInput() {
    // 获取最新的消息历史（包含工具调用结果）
    const latestMessages: ModelMessage[] = [];
    for await (const msg of this.config.storage.streamMessages(this.config.sessionID)) {
      // 转换为 ModelMessage
      if (msg.role === MessageRole.User) {
        const textParts = msg.parts.filter(p => p.type === 'text');
        if (textParts.length > 0) {
          latestMessages.push({
            role: 'user',
            content: (textParts[0] as any).text,
          });
        }
      } else if (msg.role === MessageRole.Assistant) {
        const textParts = msg.parts.filter(p => p.type === 'text');
        const toolParts = msg.parts.filter(p => p.type === 'tool-call');
        
        // 如果有文本部分，添加文本消息
        if (textParts.length > 0) {
          latestMessages.push({
            role: 'assistant',
            content: (textParts[0] as any).text,
          });
        }
        
        // 如果有工具调用，添加工具调用消息（AI SDK 格式）
        for (const toolPart of toolParts) {
          const tp = toolPart as any;
          // 优先使用 state.output，其次是 result（向后兼容）
          const output = tp.state?.output ?? tp.result;
          // 优先使用 state.error，其次是 error（向后兼容）
          const error = tp.state?.error ?? tp.error;
          
          latestMessages.push({
            role: 'tool',
            toolCallId: tp.toolCallId,
            toolName: tp.toolName,
            content: output ? JSON.stringify(output) : (error || ''),
          } as any);
        }
      }
    }
    
    return {
      user: this.config.userMessage,
      model: this.config.model,
      languageModel: this.config.languageModel,
      sessionID: this.config.sessionID,
      agent: this.config.agent,
      toolRegistry: this.config.toolRegistry,
      messages: latestMessages.length > 0 ? latestMessages : this.config.messages,
      abort: this.config.abort,
      retries: 0,
      provider: this.config.provider,
    };
  }

  /**
   * 处理流
   * 参考 opencode 的实现，处理 AI SDK 的流事件
   * 返回是否应该继续（如果有工具调用）
   */
  private async processStream(stream: any): Promise<boolean> {
    if (!this.assistantMessage) {
      throw new Error('助手消息未初始化');
    }

    let cost = 0;
    let tokens = {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: {
        read: 0,
        write: 0,
      },
    };
    let finish: string | undefined;

    for await (const value of stream) {
      this.config.abort.throwIfAborted();

      switch (value.type) {
        case 'text-start':
          // 文本开始，初始化文本部分
          if (!this.currentTextPart) {
            const newPart = await this.config.storage.addPart(
              this.assistantMessage.id,
              {
                type: 'text' as const,
                text: '',
              } as any
            );
            if (newPart.type === 'text') {
              this.currentTextPart = newPart;
            }
          }
          break;

        case 'text-delta':
          await this.handleTextDelta(value.text);
          break;

        case 'text-end':
          // 文本结束，可以在这里做清理工作
          break;

        case 'tool-call':
          await this.handleToolCall(value);
          break;

        // 注意：AI SDK 中通常没有 tool-result 事件，工具结果在 tool-call 事件中处理
        // 这里保留是为了兼容性
        case 'tool-result':
          await this.handleToolResult(value);
          break;

        case 'finish-step':
          // 完成步骤，包含 usage 信息（参考 opencode）
          if (value.usage) {
            tokens = {
              input: value.usage.promptTokens || 0,
              output: value.usage.completionTokens || 0,
              reasoning: value.usage.reasoningTokens || 0,
              cache: {
                read: value.usage.cacheReadTokens || 0,
                write: value.usage.cacheWriteTokens || 0,
              },
            };
            cost = value.usage.totalCost || 0;
          }
          finish = value.finishReason;
          break;

        case 'finish':
          // 兼容旧的事件类型
          finish = value.finishReason || value.finish;
          if (value.usage) {
            tokens = {
              input: value.usage.promptTokens || 0,
              output: value.usage.completionTokens || 0,
              reasoning: value.usage.reasoningTokens || 0,
              cache: {
                read: value.usage.cacheReadTokens || 0,
                write: value.usage.cacheWriteTokens || 0,
              },
            };
            cost = value.usage.totalCost || 0;
          }
          break;

        case 'usage':
          // 兼容旧的事件类型
          if (value.usage) {
            tokens = {
              input: value.usage.promptTokens || 0,
              output: value.usage.completionTokens || 0,
              reasoning: value.usage.reasoningTokens || 0,
              cache: {
                read: value.usage.cacheReadTokens || 0,
                write: value.usage.cacheWriteTokens || 0,
              },
            };
            cost = value.usage.totalCost || 0;
          }
          break;

        case 'error':
          throw value.error || new Error(`流处理错误: ${value.error || '未知错误'}`);
      }
    }

    // 完成消息
    await this.config.storage.completeAssistantMessage(
      this.assistantMessage.id,
      {
        cost,
        tokens,
        finish,
      }
    );
    
    // 返回是否应该继续（如果有工具调用，需要继续处理工具结果）
    // 参考 opencode：finishReason 可能是 "tool-calls" 或其他值
    // 如果有工具调用，无论 finishReason 是什么，都应该继续
    const hasToolCalls = this.toolCalls.size > 0;
    const shouldContinue = hasToolCalls || finish === 'tool-calls' || finish === 'tool_call' || finish === 'tool-call';
    logger.info('流处理完成', { 
      sessionID: this.config.sessionID, 
      finishReason: finish, 
      shouldContinue,
      hasToolCalls,
      toolCallsCount: this.toolCalls.size 
    });
    return shouldContinue;
  }

  /**
   * 处理文本增量
   */
  private async handleTextDelta(text: string): Promise<void> {
    if (!this.assistantMessage) {
      return;
    }

    // 调用文本块回调（实时流式输出）
    if (this.onTextChunk) {
      this.onTextChunk(text);
    }

    if (!this.currentTextPart) {
      // 创建新的文本部分
      const newPart = await this.config.storage.addPart(
        this.assistantMessage.id,
        {
          type: 'text' as const,
          text: '',
        } as Omit<TextPart, 'id' | 'sessionID' | 'messageID'>
      );
      
      // 确保是 TextPart 类型
      if (newPart.type === 'text') {
        this.currentTextPart = newPart as TextPart;
      } else {
        // 如果不是 text 类型，重新创建
        const textPart: TextPart = {
          ...newPart,
          type: 'text',
          text: '',
        };
        this.currentTextPart = textPart;
      }
    }

    // 更新文本部分
    if (this.currentTextPart && this.currentTextPart.type === 'text') {
      this.currentTextPart.text += text;
      await this.config.storage.updatePart(this.assistantMessage.id, this.currentTextPart);
    }
  }

  /**
   * 处理工具调用
   * 参考 opencode 的实现，处理 tool-call 事件
   * 注意：AI SDK 的流式处理中，tool-call 事件已经包含完整的工具调用信息
   */
  private async handleToolCall(chunk: any): Promise<void> {
    if (!this.assistantMessage || !this.config.toolRegistry) {
      return;
    }

    // AI SDK 的流式处理中，tool-call 事件包含完整的工具调用信息
    const toolCallId = chunk.toolCallId;
    const toolName = chunk.toolName;
    const args = chunk.args;

    // 创建或更新工具调用部分
    const toolCallPart: ToolCallPart = {
      id: `part_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      sessionID: this.config.sessionID,
      messageID: this.assistantMessage.id,
      type: 'tool-call',
      toolCallId,
      toolName,
      args,
      // 初始化状态为 "running"
      state: {
        status: 'running',
        input: args,
        time: {
          start: Date.now(),
        },
      },
    };

    // 保存工具调用部分
    await this.config.storage.addPart(this.assistantMessage.id, toolCallPart);
    this.toolCalls.set(toolCallId, toolCallPart);

    // 通知回调
    if (this.onToolCallUpdate) {
      this.onToolCallUpdate({
        type: 'start',
        toolName,
        toolCallId,
        args,
      });
    }

    // 获取工具并执行
    const toolInfo = this.config.toolRegistry.get(toolName);
    if (!toolInfo) {
      // 工具不存在，记录错误
      toolCallPart.error = `工具 ${toolName} 不存在`;
      const startTime = toolCallPart.state?.time?.start ?? Date.now();
      toolCallPart.state = {
        ...toolCallPart.state,
        status: 'error',
        time: {
          start: startTime,
          end: Date.now(),
        },
      };
      await this.config.storage.updatePart(this.assistantMessage.id, toolCallPart);
      
      if (this.onToolCallUpdate) {
        this.onToolCallUpdate({
          type: 'error',
          toolName,
          toolCallId,
          error: toolCallPart.error,
        });
      }
      return;
    }

    try {
      // 初始化工具
      const initialized = await toolInfo.init({
        agent: this.config.agent,
      });

      // 创建执行上下文
      const context = {
        sessionID: this.config.sessionID,
        messageID: this.assistantMessage.id,
        agent: this.config.agent.name,
        abort: this.config.abort,
        callID: toolCallId,
        extra: {},
        messages: [],
        metadata: async (input: any) => {
          // 更新工具调用的元数据
          if (toolCallPart.state && this.assistantMessage) {
            toolCallPart.state.metadata = input.metadata;
            await this.config.storage.updatePart(this.assistantMessage.id, toolCallPart);
          }
        },
        ask: async (req: any) => {
          // 权限检查（暂时总是允许）
          // 在实际实现中，这里应该调用权限系统
          return Promise.resolve();
        },
      };

      // 执行工具
      const result = await initialized.execute(args, context);

      // 更新工具调用结果
      const startTime = toolCallPart.state?.time?.start ?? Date.now();
      toolCallPart.state = {
        ...toolCallPart.state,
        status: 'completed',
        output: result,
        time: {
          start: startTime,
          end: Date.now(),
        },
        metadata: result.metadata || {},
        title: result.title || '',
        attachments: result.attachments || [],
      };
      
      await this.config.storage.updatePart(this.assistantMessage.id, toolCallPart);
      
      if (this.onToolCallUpdate) {
        this.onToolCallUpdate({
          type: 'complete',
          toolName,
          toolCallId,
          result,
        });
      }
    } catch (error) {
      // 记录工具执行错误
      const errorMessage = error instanceof Error ? error.message : String(error);
      const startTime = toolCallPart.state?.time?.start ?? Date.now();
      toolCallPart.state = {
        ...toolCallPart.state,
        status: 'error',
        error: errorMessage,
        time: {
          start: startTime,
          end: Date.now(),
        },
      };
      
      await this.config.storage.updatePart(this.assistantMessage.id, toolCallPart);
      
      if (this.onToolCallUpdate) {
        this.onToolCallUpdate({
          type: 'error',
          toolName,
          toolCallId,
          error: errorMessage,
        });
      }
    }
  }

  /**
   * 处理工具结果
   * 注意：在新的实现中，工具结果在 tool-call 事件中处理
   * 这个方法主要用于兼容性
   */
  private async handleToolResult(chunk: any): Promise<void> {
    if (!this.assistantMessage) {
      return;
    }

    const toolCallPart = this.toolCalls.get(chunk.toolCallId);
    if (!toolCallPart) {
      return;
    }

    // 更新工具调用结果（主要用于兼容性）
    if (chunk.result && toolCallPart.state) {
      toolCallPart.state.output = chunk.result;
      toolCallPart.state.status = 'completed';
    }
    
    if (chunk.error && toolCallPart.state) {
      toolCallPart.state.error = chunk.error;
      toolCallPart.state.status = 'error';
    }

    // 更新时间
    if (toolCallPart.state && toolCallPart.state.time) {
      toolCallPart.state.time.end = Date.now();
    }

    await this.config.storage.updatePart(this.assistantMessage.id, toolCallPart);
  }
}