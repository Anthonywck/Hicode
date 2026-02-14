/**
 * 会话处理器模块
 * 处理LLM响应流，管理工具调用和消息生成
 */

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { MessageRole, MessageWithParts, AssistantMessage, UserMessage } from './message';
import { ReasoningPart, ToolPart, Part, generatePartID, type ToolState } from './message-v2';
import { ISessionStorage } from './storage';
import type { ModelConfig } from '../api/types';
import type { AgentConfig } from '../agent/types';
import type { Tool as ToolInfo } from '../tool/tool';
import { ToolRegistry } from '../tool/registry';
import { stream as streamLLM, type StreamOutput } from './llm';
import type { ModelMessage } from 'ai';
import { Agent } from '../agent/agent';
import { PermissionManager, RejectedError, DeniedError } from '../permission/permission';
import { PermissionRuleset } from '../permission/ruleset';

const logger = createLogger('session.processor');

/**
 * 死循环检测阈值（连续相同工具调用次数）
 */
const DOOM_LOOP_THRESHOLD = 3;

/**
 * 会话处理器配置
 */
export interface ProcessorConfig {
  /** 会话ID */
  sessionID: string;
  /** 用户消息 */
  userMessage: UserMessage;
  /** 用户消息的原始 parts（用于确保用户消息内容可用） */
  userMessageParts?: Part[];
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
  private toolCalls: Map<string, ToolPart> = new Map();
  private currentTextPart: Part | null = null;
  private reasoningParts: Map<string, ReasoningPart> = new Map();
  private isProcessing = false;
  private blocked = false;
  // 用于跟踪工具输入的增量更新（参考 opencode）
  private toolInputBuffers: Map<string, string> = new Map();
  /** 文本块回调 */
  public onTextChunk?: (chunk: string) => void;
  /** 工具调用更新回调 */
  public onToolCallUpdate?: (toolCall: any) => void;
  /** 权限管理器（可选） */
  private permissionManager?: PermissionManager;

  constructor(config: ProcessorConfig) {
    this.config = config;
    logger.info('SessionProcessor 初始化', { sessionID: config.sessionID });
  }

  /**
   * 设置权限管理器
   */
  setPermissionManager(manager: PermissionManager): void {
    this.permissionManager = manager;
  }

  /**
   * 重置处理器状态，用于循环中创建新的助手消息
   */
  reset(): void {
    this.assistantMessage = null;
    this.toolCalls.clear();
    this.currentTextPart = null;
    this.reasoningParts.clear();
    this.isProcessing = false;
    this.blocked = false;
    this.toolInputBuffers.clear();
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
      console.log(`[HICODE DEBUG] SessionProcessor开始处理 - sessionID: ${this.config.sessionID}`);
      
      // 创建助手消息（如果还没有）
      if (!this.assistantMessage) {
        this.assistantMessage = await this.createAssistantMessage();
        console.log(`[HICODE DEBUG] 创建新的助手消息 - ID: ${this.assistantMessage.id}`);
      }

      // 构建LLM流输入（每次获取最新消息历史）
      const streamInput = await this.buildStreamInput();
      console.log(`[HICODE DEBUG] 构建流输入完成 - 消息数量: ${streamInput.messages.length}`);

      // 开始流处理
      const streamResult = await streamLLM(streamInput);
      console.log(`[HICODE DEBUG] 开始流处理`);
      
      // 处理流（使用 fullStream，参考 opencode）
      shouldContinue = await this.processStream(streamResult.fullStream);
      console.log(`[HICODE DEBUG] 流处理完成，是否继续: ${shouldContinue}`);

      // 如果 finishReason 是 tool-calls，需要继续
      if (shouldContinue) {
        return 'continue';
      }
      
      return 'stop';
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('会话处理失败', { error: error.message, sessionID: this.config.sessionID });
      console.error(`[HICODE DEBUG] 会话处理失败 - ${error.message}`, error);
      
      // 检查是否是权限拒绝错误
      if (error instanceof RejectedError || error instanceof DeniedError) {
        this.blocked = true;
      }
      
      // 标记所有未完成的工具调用为错误
      if (this.assistantMessage) {
        const parts = await this.config.storage.getParts(this.assistantMessage.id);
        for (const part of parts) {
          if (part.type === 'tool' && part.state) {
            if (part.state.status !== 'completed' && part.state.status !== 'error') {
              const errorState: ToolState = {
                status: 'error',
                input: part.state.input,
                error: error.message,
                time: {
                  start: part.state.status === 'running' ? part.state.time.start : Date.now(),
                  end: Date.now(),
                },
              };
              const updatedPart: ToolPart = {
                ...part,
                state: errorState,
              };
              await this.config.storage.updatePart(this.assistantMessage.id, updatedPart);
            }
          }
        }
        
        await this.config.storage.setAssistantMessageError(this.assistantMessage.id, {
          name: error.name,
          message: error.message,
          isRetryable: false,
        });
      }
      
      return this.blocked ? 'stop' : 'stop';
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

    const msg = await this.config.storage.createAssistantMessage({
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
    
    // 验证消息已保存到存储
    const savedMsg = await this.config.storage.getMessage(this.config.sessionID, msg.id);
    if (!savedMsg) {
      logger.error('助手消息创建后未能在存储中找到', {
        sessionID: this.config.sessionID,
        messageID: msg.id,
      });
      throw new Error(`助手消息创建失败：消息 ${msg.id} 未保存到存储`);
    }
    
    // 返回存储中保存的消息，转换为 processor 期望的格式
    // 注意：存储中保存的消息 role 是 'assistant' 字符串，但 processor 期望 MessageRole 枚举
    return {
      ...msg,
      role: MessageRole.Assistant, // 转换为枚举格式
    } as AssistantMessage;
  }

  /**
   * 构建流输入
   * 每次调用时获取最新的消息历史（包含工具调用结果）
   * 参考 opencode：先遍历存储中的消息，检查是否已包含当前用户消息，避免重复添加
   */
  private async buildStreamInput() {
    // 获取最新的消息历史（包含工具调用结果）
    const latestMessages: ModelMessage[] = [];
    // 用于跟踪已添加的工具调用，避免重复（参考 opencode）
    const addedToolCalls = new Set<string>();
    
    // 用于跟踪已添加的用户消息ID，避免重复添加
    const addedUserMessageIds = new Set<string>();
    
    // 标记当前用户消息是否已在历史中找到
    let currentUserMessageFound = false;
    // 保存当前用户消息的内容（用于后续检查）
    let currentUserContent: string | undefined;
    
    // 获取当前用户消息的内容（用于后续检查）
    const currentUserParts = this.config.userMessageParts || await this.config.storage.getParts(this.config.userMessage.id);
    const currentUserTextParts = currentUserParts.filter((p: any) => p.type === 'text');
    if (currentUserTextParts.length > 0) {
      const userContent = (currentUserTextParts[0] as any).text;
      if (userContent && userContent.trim()) {
        currentUserContent = userContent;
      }
    }
    
    // 先遍历存储中的消息，检查是否已包含当前用户消息（参考 opencode）
    for await (const msgWithParts of this.config.storage.streamMessages(this.config.sessionID)) {
      // streamMessages 返回 { info, parts } 结构
      const msgInfo = (msgWithParts as any).info || msgWithParts;
      const parts = (msgWithParts as any).parts || [];
      
      // 避免重复添加同一个用户消息
      if (addedUserMessageIds.has(msgInfo.id)) {
        continue;
      }
      
      // 转换为 ModelMessage
      if (msgInfo.role === MessageRole.User) {
        // 检查是否是当前用户消息
        if (msgInfo.id === this.config.userMessage.id) {
          currentUserMessageFound = true;
        }
        
        const textParts = parts.filter((p: any) => p.type === 'text');
        if (textParts.length > 0) {
          latestMessages.push({
            role: 'user',
            content: (textParts[0] as any).text,
          });
          addedUserMessageIds.add(msgInfo.id);
        }
      } else if (msgInfo.role === MessageRole.Assistant) {
        const textParts = parts.filter((p: any) => p.type === 'text');
        // 注意：storage 中的 tool parts 类型是 'tool'，不是 'tool-call'
        const toolParts = parts.filter((p: any) => p.type === 'tool');
        
        // 先收集有效的工具调用结果（参考 opencode：只添加已完成或出错的工具调用）
        const validToolResults: Array<{ toolPart: any; toolCallId: string; content: string }> = [];
        
        for (const toolPart of toolParts) {
          const tp = toolPart as any;
          // 支持两种格式：message-v2 的 'callID' 和 message.ts 的 'toolCallId'
          const toolCallId = tp.callID || tp.toolCallId;
          
          // 如果 toolCallId 仍然为 undefined，跳过这个工具调用
          if (!toolCallId) {
            continue;
          }
          
          // 避免重复添加同一个工具调用
          if (addedToolCalls.has(toolCallId)) {
            continue;
          }
          
          // 只添加已完成或出错的工具调用（参考 opencode）
          const status = tp.state?.status;
          if (status !== 'completed' && status !== 'error') {
            continue;
          }
          
          // 优先使用 state.output，其次是 result（向后兼容）
          const output = tp.state?.output ?? tp.result;
          // 优先使用 state.error，其次是 error（向后兼容）
          const error = tp.state?.error ?? tp.error;
          
          // 获取工具名称
          const toolName = tp.toolName || tp.tool;
          
          // 确保 content 是字符串（参考 opencode）
          let content: string;
          if (output !== undefined && output !== null) {
            if (typeof output === 'string') {
              content = output;
            } else if (typeof output === 'object') {
              // 如果是对象，检查是否有 text 字段（参考 opencode 的 toModelOutput）
              const outputObj = output as any;
              if (outputObj.text && typeof outputObj.text === 'string') {
                content = outputObj.text;
              } else {
                content = JSON.stringify(output);
              }
            } else {
              content = String(output);
            }
          } else if (error) {
            content = typeof error === 'string' ? error : String(error);
          } else {
            // 如果没有输出或错误，使用空字符串（参考 opencode）
            content = '';
          }
          
          // 收集有效的工具调用结果
          validToolResults.push({
            toolPart: tp,
            toolCallId,
            content,
          });
        }
        
        // 只有当有文本部分或有效的工具调用结果时，才添加 Assistant 消息（参考 opencode）
        const hasText = textParts.length > 0;
        const hasValidToolResults = validToolResults.length > 0;
        
        if (hasText || hasValidToolResults) {
          // 重要：由于最后会反转数组（latestMessages.reverse()），所以在反转之前
          // 我们需要让 tool 在前，assistant 在后，这样反转后就会变成 assistant -> tool
          // AI SDK 要求消息顺序为 assistant -> tool -> assistant -> tool
          
          // 先添加有效的工具调用结果（在反转前，tool 在前）
          for (const { toolPart: tp, toolCallId, content } of validToolResults) {
            const toolName = tp.toolName || tp.tool;
            
            // AI SDK 的 tool 消息格式：content 必须是 tool-result 格式的数组
            latestMessages.push({
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId,
                  toolName: toolName || 'unknown',
                  output: {
                    type: 'text',
                    value: content,
                  },
                },
              ],
            } as any);
            
            addedToolCalls.add(toolCallId);
          }
          
          // 然后添加 assistant 消息（在反转前，assistant 在后）
          // 如果有文本部分，添加文本消息
          if (hasText) {
            latestMessages.push({
              role: 'assistant',
              content: (textParts[0] as any).text,
            });
          } else if (hasValidToolResults) {
            // 如果只有工具调用结果，没有文本，添加一个占位符 assistant 消息
            // 这表示这个 assistant 消息只有工具调用请求，没有文本
            latestMessages.push({
              role: 'assistant',
              content: '', // 空的 assistant 消息，表示只有工具调用请求
            });
          }
        }
      }
    }
    
    // 如果当前用户消息不在历史中（第一次调用），才添加它
    // 参考 opencode：确保用户消息只在第一次添加，避免在循环中重复添加
    // 注意：由于后面会反转数组，当前用户消息（最新的）应该添加到数组末尾（push）
    if (!currentUserMessageFound && currentUserContent) {
      // 再次检查消息历史中是否已经有相同内容的用户消息（双重保险）
      const hasSameUserMessage = latestMessages.some(
        msg => msg.role === 'user' && 
        typeof msg.content === 'string' && 
        msg.content === currentUserContent
      );
      
      if (!hasSameUserMessage) {
        // 将用户消息添加到数组末尾（因为后面会反转，反转后它会在最后，作为最新的消息）
        latestMessages.push({
          role: 'user',
          content: currentUserContent,
        });
      }
    } else if (!currentUserMessageFound && !currentUserContent) {
      // 如果没有找到用户消息且没有内容，检查是否已经有用户消息
      const hasAnyUserMessage = latestMessages.some(msg => msg.role === 'user');
      if (!hasAnyUserMessage) {
        // 只有在没有任何用户消息时才添加占位符（ZhipuAI 要求至少有一个用户消息）
        latestMessages.push({
          role: 'user',
          content: ' ', // 使用单个空格作为占位符
        });
      }
    }
    
    // 确保至少有一条消息（ZhipuAI 要求）
    if (latestMessages.length === 0) {
      console.warn(`[HICODE DEBUG] 警告：消息历史为空，添加占位符用户消息`);
      latestMessages.push({
        role: 'user',
        content: ' ', // 使用单个空格作为占位符
      });
    }
    
    // 参考 opencode 的 filterCompacted：反转消息顺序，使其从最旧到最新（正序）
    // storage.streamMessages 返回的是倒序（从最新到最旧），需要反转成正序
    latestMessages.reverse();
    
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

    console.log(`[HICODE DEBUG] 开始处理模型响应流`);

    for await (const value of stream) {
      this.config.abort.throwIfAborted();

      switch (value.type) {
        case 'start':
          // 流开始，设置会话状态为忙碌
          logger.info('流开始', { sessionID: this.config.sessionID });
          break;

        case 'reasoning-start':
          // 推理开始
          await this.handleReasoningStart(value);
          break;

        case 'reasoning-delta':
          // 推理增量（已优化为同步函数，不阻塞）
          this.handleReasoningDelta(value);
          break;

        case 'reasoning-end':
          // 推理结束
          await this.handleReasoningEnd(value);
          break;

        case 'text-start':
          // 文本开始，初始化文本部分
          // 注意：这里需要等待创建完成，因为后续的 text-delta 需要 currentTextPart
          // 但这是必要的，因为我们需要 part ID 来更新
          // 优化：虽然需要等待，但这是第一次创建，后续的 delta 更新不会阻塞
          console.log(`[HICODE DEBUG] 收到文本开始事件`);
          if (!this.currentTextPart || this.currentTextPart.type !== 'text') {
            // 创建新的文本部分（同步等待，但只执行一次）
            // 这是必要的，因为后续的 text-delta 需要 currentTextPart 存在
            const newPart = await this.config.storage.addPart(
              this.assistantMessage.id,
              {
                type: 'text' as const,
                text: '',
                time: {
                  start: Date.now(),
                },
              } as Omit<Part, 'id' | 'sessionID' | 'messageID'>
            );
            if (newPart.type === 'text') {
              this.currentTextPart = newPart;
            }
          }
          break;

        case 'text-delta':
          // 立即处理文本增量，不等待（已优化为同步函数）
          this.handleTextDelta(value.text);
          break;

        case 'text-end':
          // 文本结束，完成文本部分
          await this.handleTextEnd(value);
          break;

        case 'tool-input-start':
          // 工具输入开始（参考 opencode）
          console.log(`[HICODE DEBUG] 收到工具输入开始事件:`, {
            toolName: value.toolName,
            toolCallId: value.id || value.toolCallId,
          });
          await this.handleToolInputStart(value);
          break;

        case 'tool-input-delta':
          // 工具输入增量（参考 opencode）
          await this.handleToolInputDelta(value);
          break;

        case 'tool-input-end':
          // 工具输入结束（参考 opencode）
          await this.handleToolInputEnd(value);
          break;

        case 'tool-call':
          console.log(`[HICODE DEBUG] 收到工具调用事件:`, {
            toolName: value.toolName,
            toolCallId: value.toolCallId,
            input: value.input,
            args: value.args,
          });
          await this.handleToolCall(value);
          break;

        case 'tool-result':
          // 工具结果事件（AI SDK 可能在某些情况下发送）
          console.log(`[HICODE DEBUG] 收到工具结果事件:`, {
            toolCallId: value.toolCallId,
            result: value.result,
          });
          await this.handleToolResult(value);
          break;

        case 'tool-error':
          // 工具错误事件
          await this.handleToolError(value);
          break;

        case 'finish-step':
          // 完成步骤，包含 usage 信息（参考 opencode）
          console.log(`[HICODE DEBUG] 收到完成步骤事件 - finishReason: ${value.finishReason}`);
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
            console.log(`[HICODE DEBUG] Token使用情况 - 输入: ${tokens.input}, 输出: ${tokens.output}, 总成本: ${cost}`);
          }
          finish = value.finishReason;
          console.log(`[HICODE DEBUG] 流处理完成，finishReason: ${finish}, 工具调用数量: ${this.toolCalls.size}`);
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
          console.log(`[HICODE DEBUG] 收到finish事件 - finishReason: ${finish}`);
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

    // 完成消息（检查消息是否存在）
    if (this.assistantMessage) {
      try {
        // 先检查消息是否存在
        const message = await this.config.storage.getMessage(
          this.config.sessionID,
          this.assistantMessage.id
        );
        
        if (!message) {
          logger.warn('助手消息不存在，跳过完成操作', {
            sessionID: this.config.sessionID,
            messageID: this.assistantMessage.id,
          });
          console.warn(`[HICODE DEBUG] 助手消息不存在，跳过完成操作 - messageID: ${this.assistantMessage.id}`);
        } else {
          await this.config.storage.completeAssistantMessage(
            this.assistantMessage.id,
            {
              cost,
              tokens,
              finish,
            }
          );
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('完成助手消息失败', {
          sessionID: this.config.sessionID,
          messageID: this.assistantMessage.id,
          error: err.message,
        });
        console.error(`[HICODE DEBUG] 完成助手消息失败 - messageID: ${this.assistantMessage.id}, error: ${err.message}`, err);
        // 不重新抛出错误，避免中断流程
      }
    }
    
    // 标记所有未完成的工具调用为错误（如果流被中断）
    if (this.assistantMessage) {
      const parts = await this.config.storage.getParts(this.assistantMessage.id);
      for (const part of parts) {
        if (part.type === 'tool' && part.state) {
          if (part.state.status !== 'completed' && part.state.status !== 'error') {
            const errorState: ToolState = {
              status: 'error',
              input: part.state.input,
              error: 'Tool execution aborted',
              time: {
                start: part.state.status === 'running' ? part.state.time.start : Date.now(),
                end: Date.now(),
              },
            };
            const updatedPart: ToolPart = {
              ...part,
              state: errorState,
            };
            await this.config.storage.updatePart(this.assistantMessage.id, updatedPart);
          }
        }
      }
    }

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
      toolCallsCount: this.toolCalls.size,
      blocked: this.blocked,
    });
    console.log(`[HICODE DEBUG] 流处理完成 - finishReason: ${finish}, hasToolCalls: ${hasToolCalls}, shouldContinue: ${shouldContinue}, 工具调用数量: ${this.toolCalls.size}, blocked: ${this.blocked}`);
    
    // 如果被阻止，返回 stop
    if (this.blocked) {
      return false;
    }
    
    return shouldContinue;
  }

  /**
   * 处理推理开始
   */
  private async handleReasoningStart(chunk: any): Promise<void> {
    if (!this.assistantMessage) {
      return;
    }

    const reasoningId = chunk.id;
    if (reasoningId && this.reasoningParts.has(reasoningId)) {
      return; // 已存在，跳过
    }

    const reasoningPart: ReasoningPart = {
      id: generatePartID(),
      sessionID: this.config.sessionID,
      messageID: this.assistantMessage.id,
      type: 'reasoning',
      text: '',
      time: {
        start: Date.now(),
      },
      metadata: chunk.providerMetadata,
    };

    this.reasoningParts.set(reasoningId, reasoningPart);
    await this.config.storage.addPart(this.assistantMessage.id, reasoningPart);
  }

  /**
   * 处理推理增量
   * 优化：参考 opencode 实现，存储更新异步非阻塞
   */
  private handleReasoningDelta(chunk: any): void {
    if (!this.assistantMessage) {
      return;
    }

    const reasoningId = chunk.id;
    const part = this.reasoningParts.get(reasoningId);
    if (!part) {
      return;
    }

    part.text += chunk.text;
    if (chunk.providerMetadata) {
      part.metadata = chunk.providerMetadata;
    }

    // 存储更新使用 fire-and-forget 模式，不阻塞流式处理
    if (part.text) {
      this.config.storage.updatePart(this.assistantMessage.id, part).catch((err) => {
        logger.error('更新推理部分失败', { 
          error: err instanceof Error ? err.message : String(err),
          messageID: this.assistantMessage?.id,
        });
      });
    }
  }

  /**
   * 处理推理结束
   */
  private async handleReasoningEnd(chunk: any): Promise<void> {
    if (!this.assistantMessage) {
      return;
    }

    const reasoningId = chunk.id;
    const part = this.reasoningParts.get(reasoningId);
    if (!part) {
      return;
    }

    part.text = part.text.trimEnd();
    part.time = {
      ...part.time,
      end: Date.now(),
    };

    if (chunk.providerMetadata) {
      part.metadata = chunk.providerMetadata;
    }

    await this.config.storage.updatePart(this.assistantMessage.id, part);
    this.reasoningParts.delete(reasoningId);
  }

  /**
   * 处理文本增量
   * 优化：参考 opencode 实现，立即发送增量更新，存储更新异步非阻塞
   * 关键优化点：
   * 1. 先立即调用 onTextChunk 回调，确保前端立即收到数据
   * 2. 存储更新使用 fire-and-forget 模式，不阻塞流式处理
   * 3. 这样可以确保每个 chunk 都能立即发送到前端，不会因为存储写入而延迟
   */
  private handleTextDelta(text: string): void {
    if (!this.assistantMessage) {
      return;
    }

    // 立即调用文本块回调（实时流式输出，不阻塞）
    // 这是最关键的部分：先发送到前端，再处理存储
    // 参考 opencode：在 text-delta 中立即发送增量更新
    if (this.onTextChunk) {
      this.onTextChunk(text);
    }

    // 如果还没有文本部分，说明 text-start 事件还没处理完
    // 这种情况下，我们仍然发送 chunk 到前端，但跳过存储更新
    // text-start 事件会创建 part，后续的 delta 会正常更新
    if (!this.currentTextPart || this.currentTextPart.type !== 'text') {
      // 注意：这里不创建 part，因为 text-start 事件会处理
      // 我们只负责发送 chunk 到前端
      return;
    }

    // 更新内存中的文本部分
    this.currentTextPart.text += text;

    // 存储更新使用 fire-and-forget 模式，不阻塞流式处理
    // 参考 opencode：立即发送增量更新，存储更新异步进行
    // 这样可以确保流式处理不被阻塞，chunk 可以立即发送到前端
    this.config.storage.updatePart(this.assistantMessage.id, this.currentTextPart).catch((err) => {
      logger.error('更新文本部分失败', { 
        error: err instanceof Error ? err.message : String(err),
        messageID: this.assistantMessage?.id,
      });
    });
  }

  /**
   * 处理文本结束
   */
  private async handleTextEnd(chunk: any): Promise<void> {
    if (!this.assistantMessage || !this.currentTextPart || this.currentTextPart.type !== 'text') {
      return;
    }

    this.currentTextPart.text = this.currentTextPart.text.trimEnd();
    this.currentTextPart.time = {
      start: this.currentTextPart.time?.start ?? Date.now(),
      end: Date.now(),
    };

    if (chunk.providerMetadata) {
      this.currentTextPart.metadata = chunk.providerMetadata;
    }

    await this.config.storage.updatePart(this.assistantMessage.id, this.currentTextPart);
    this.currentTextPart = null;
  }

  /**
   * 处理工具输入开始（参考 opencode）
   */
  private async handleToolInputStart(chunk: any): Promise<void> {
    if (!this.assistantMessage || !this.config.toolRegistry) {
      return;
    }

    const toolCallId = chunk.id || chunk.toolCallId;
    const toolName = chunk.toolName;

    // 创建工具调用部分（状态为 pending，使用 message-v2 格式）
    const pendingState: ToolState = {
      status: 'pending',
      input: {},
      raw: '',
    };
    const newPart = await this.config.storage.addPart(this.assistantMessage.id, {
      type: 'tool' as const,
      callID: toolCallId,
      tool: toolName,
      state: pendingState,
    } as Omit<Part, 'id' | 'sessionID' | 'messageID'>);
    
    if (newPart.type === 'tool') {
      this.toolCalls.set(toolCallId, newPart);
      this.toolInputBuffers.set(toolCallId, '');
      console.log(`[HICODE DEBUG] 工具输入开始 - 工具: ${toolName}, ID: ${toolCallId}`);
    }
  }

  /**
   * 处理工具输入增量（参考 opencode）
   */
  private async handleToolInputDelta(chunk: any): Promise<void> {
    const toolCallId = chunk.toolCallId || chunk.id;
    const currentBuffer = this.toolInputBuffers.get(toolCallId) || '';
    this.toolInputBuffers.set(toolCallId, currentBuffer + (chunk.inputDelta || ''));
  }

  /**
   * 处理工具输入结束（参考 opencode）
   */
  private async handleToolInputEnd(chunk: any): Promise<void> {
    // 工具输入结束，参数已经完整，等待 tool-call 事件执行
  }

  /**
   * 检测死循环（doom loop）
   * 检查最近 N 次工具调用是否相同
   */
  private async checkDoomLoop(toolName: string, input: Record<string, any>): Promise<void> {
    if (!this.assistantMessage) {
      return;
    }

    try {
      const parts = await this.config.storage.getParts(this.assistantMessage.id);
      const toolParts = parts.filter((p): p is ToolPart => 
        p.type === 'tool' && 
        p.tool === toolName &&
        p.state.status !== 'pending'
      );

      // 获取最后 N 个工具调用
      const lastN = toolParts.slice(-DOOM_LOOP_THRESHOLD);
      
      if (lastN.length === DOOM_LOOP_THRESHOLD) {
        // 检查是否所有调用都相同（工具名和参数）
        const allSame = lastN.every(part => 
          part.tool === toolName &&
          JSON.stringify(part.state.input) === JSON.stringify(input)
        );

        if (allSame) {
          logger.warn('检测到死循环', {
            toolName,
            sessionID: this.config.sessionID,
            count: DOOM_LOOP_THRESHOLD,
          });

          // 获取 Agent 配置和权限规则集
          const agent = Agent.get(this.config.agent.name);
          if (agent && this.permissionManager) {
            try {
              await this.permissionManager.ask(
                {
                  sessionID: this.config.sessionID,
                  permission: 'doom_loop',
                  patterns: [toolName],
                  metadata: {
                    tool: toolName,
                    input,
                  },
                  tool: {
                    messageID: this.assistantMessage.id,
                    callID: '', // 这里可以传入实际的 callID
                  },
                },
                agent.permission || []
              );
            } catch (error) {
              // 如果权限被拒绝，设置 blocked 标志
              if (error instanceof RejectedError || error instanceof DeniedError) {
                this.blocked = true;
                throw error;
              }
            }
          }
        }
      }
    } catch (error) {
      // 如果检测过程中出错，记录但不中断流程
      logger.error('死循环检测失败', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 处理工具调用
   * 参考 opencode 的实现，处理 tool-call 事件
   * 注意：AI SDK 的流式处理中，tool-call 事件包含完整的工具调用信息（包括参数）
   */
  private async handleToolCall(chunk: any): Promise<void> {
    if (!this.assistantMessage || !this.config.toolRegistry) {
      return;
    }

    // AI SDK 的流式处理中，tool-call 事件包含完整的工具调用信息
    // 参考 opencode：使用 value.input 而不是 value.args
    const toolCallId = chunk.toolCallId || chunk.id;
    const toolName = chunk.toolName;
    // AI SDK 的 tool-call 事件中，参数在 input 字段中（参考 opencode）
    // 如果 input 是 undefined，尝试从 args 获取，如果都没有，使用空对象
    const args = chunk.input !== undefined ? chunk.input : (chunk.args !== undefined ? chunk.args : {});
    
    console.log(`[HICODE DEBUG] 处理工具调用 - 工具: ${toolName}, ID: ${toolCallId}`);
    
    // 如果参数是 undefined 或 null，记录警告
    if (args === undefined || args === null) {
      console.warn(`[HICODE DEBUG] ⚠️ 警告：工具 ${toolName} 的参数是 ${args}，这可能导致工具执行失败`);
    }

    // 检查死循环
    await this.checkDoomLoop(toolName, args);

    // 获取或创建工具调用部分
    let toolCallPart = this.toolCalls.get(toolCallId);
    if (!toolCallPart) {
      // 创建新的工具调用部分（使用 message-v2 格式）
      const pendingState: ToolState = {
        status: 'pending',
        input: {},
        raw: '',
      };
      const newPart = await this.config.storage.addPart(this.assistantMessage.id, {
        type: 'tool' as const,
        callID: toolCallId,
        tool: toolName,
        state: pendingState,
      } as Omit<Part, 'id' | 'sessionID' | 'messageID'>);
      if (newPart.type === 'tool') {
        toolCallPart = newPart;
        this.toolCalls.set(toolCallId, toolCallPart);
      }
    }

    if (!toolCallPart) {
      logger.error('无法创建工具调用部分', { toolCallId, toolName });
      return;
    }

    // 更新工具调用部分状态为 running
    const runningState: ToolState = {
      status: 'running',
      input: args,
      time: {
        start: Date.now(),
      },
      ...(chunk.providerMetadata ? { metadata: chunk.providerMetadata } : {}),
    };

    const updatedPart: ToolPart = {
      ...toolCallPart,
      state: runningState,
    };

    await this.config.storage.updatePart(this.assistantMessage.id, updatedPart);
    this.toolCalls.set(toolCallId, updatedPart);

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
      console.log(`[HICODE DEBUG] 工具不存在 - ${toolName}`);
      const errorMessage = `工具 ${toolName} 不存在`;
      const startTime = toolCallPart.state.status === 'running' ? toolCallPart.state.time.start : Date.now();
      const errorState: ToolState = {
        status: 'error',
        input: toolCallPart.state.input,
        error: errorMessage,
        time: {
          start: startTime,
          end: Date.now(),
        },
      };
      const updatedPart: ToolPart = {
        ...toolCallPart,
        state: errorState,
      };
      await this.config.storage.updatePart(this.assistantMessage.id, updatedPart);
      
      if (this.onToolCallUpdate) {
        this.onToolCallUpdate({
          type: 'error',
          toolName,
          toolCallId,
          error: errorMessage,
        });
      }
      return;
    }
    
    console.log(`[HICODE DEBUG] 找到工具: ${toolName}，开始执行`);

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
          if (toolCallPart.state.status === 'running' && this.assistantMessage) {
            const runningState: ToolState = {
              ...toolCallPart.state,
              metadata: input.metadata,
            };
            const updatedPart: ToolPart = {
              ...toolCallPart,
              state: runningState,
            };
            await this.config.storage.updatePart(this.assistantMessage.id, updatedPart);
            this.toolCalls.set(toolCallId, updatedPart);
          }
        },
        ask: async (req: any) => {
          // 权限检查（暂时总是允许）
          // 在实际实现中，这里应该调用权限系统
          return Promise.resolve();
        },
      };

      // 执行工具
      console.log(`\n🛠️  [HICODE] ========== 工具执行开始 ==========`);
      console.log(`   工具名称: ${toolName}`);
      console.log(`   工具调用ID: ${toolCallId}`);
      console.log(`   参数:`, JSON.stringify(args, null, 2));
      const startTime = Date.now();
      const result = await initialized.execute(args, context);
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      console.log(`   执行时间: ${executionTime}ms`);
      console.log(`   执行结果类型: ${typeof result}`);
      if (result && typeof result === 'object') {
        const resultObj = result as any;
        console.log(`   结果字段:`, Object.keys(resultObj));
        if (resultObj.output) {
          const outputPreview = typeof resultObj.output === 'string' 
            ? (resultObj.output.length > 200 ? resultObj.output.substring(0, 200) + '...' : resultObj.output)
            : JSON.stringify(resultObj.output).substring(0, 200);
          console.log(`   输出预览: ${outputPreview}`);
        }
      }
      console.log(`🛠️  [HICODE] ========== 工具执行结束 ==========\n`);

      // 格式化工具输出（确保是字符串）
      let outputText: string;
      if (typeof result === 'string') {
        outputText = result;
      } else if (result && typeof result === 'object') {
        // 如果结果有 output 字段，使用它
        const resultObj = result as any;
        if (resultObj.output && typeof resultObj.output === 'string') {
          outputText = resultObj.output;
        } else if (resultObj.text && typeof resultObj.text === 'string') {
          outputText = resultObj.text;
        } else {
          outputText = JSON.stringify(result);
        }
      } else {
        outputText = String(result);
      }

      // 更新工具调用结果
      const toolStartTime = toolCallPart.state.status === 'running' ? toolCallPart.state.time.start : Date.now();
      const resultTitle = (result as any)?.title || '';
      const resultMetadata = (result as any)?.metadata || {};
      const resultAttachments = (result as any)?.attachments || [];
      
      const completedState: ToolState = {
        status: 'completed',
        input: args,
        output: outputText,
        title: resultTitle,
        metadata: resultMetadata,
        time: {
          start: toolStartTime,
          end: endTime,
        },
        attachments: resultAttachments,
      };

      const updatedPart: ToolPart = {
        ...toolCallPart,
        state: completedState,
      };
      
      // ========== 打印工具调用完成结果 ==========
      console.log('\n');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('✅ [HICODE] 工具调用完成 - 详细结果');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`🛠️  工具名称: ${toolName}`);
      console.log(`🆔 工具调用ID: ${toolCallId}`);
      console.log(`⏱️  执行时间: ${executionTime}ms`);
      console.log(`📊 状态: ${completedState.status}`);
      console.log('');
      
      // 打印输入参数
      console.log('📥 输入参数:');
      console.log(JSON.stringify(args, null, 2));
      console.log('');
      
      // 打印输出结果
      console.log('📤 输出结果:');
      if (resultTitle) {
        console.log(`   标题: ${resultTitle}`);
      }
      console.log(`   输出长度: ${outputText.length} 字符`);
      if (outputText.length > 0) {
        console.log(`   输出内容:`);
        console.log(outputText.split('\n').map(line => `   ${line}`).join('\n'));
      } else {
        console.log('   (无输出内容)');
      }
      console.log('');
      
      // 打印元数据
      if (Object.keys(resultMetadata).length > 0) {
        console.log('📋 元数据:');
        console.log(JSON.stringify(resultMetadata, null, 2).split('\n').map(line => `   ${line}`).join('\n'));
        console.log('');
      }
      
      // 打印附件信息
      if (resultAttachments && resultAttachments.length > 0) {
        console.log(`📎 附件数量: ${resultAttachments.length}`);
        resultAttachments.forEach((attachment: any, index: number) => {
          console.log(`   [${index + 1}] 类型: ${attachment.type || 'unknown'}`);
          if (attachment.mime) console.log(`       MIME: ${attachment.mime}`);
          if (attachment.filename) console.log(`       文件名: ${attachment.filename}`);
          if (attachment.url) {
            const urlPreview = attachment.url.length > 100 
              ? attachment.url.substring(0, 100) + '...' 
              : attachment.url;
            console.log(`       URL: ${urlPreview}`);
          }
        });
        console.log('');
      }
      
      // 打印时间信息
      console.log('⏰ 时间信息:');
      console.log(`   开始时间: ${new Date(toolStartTime).toLocaleString()}`);
      console.log(`   结束时间: ${new Date(endTime).toLocaleString()}`);
      console.log(`   耗时: ${executionTime}ms`);
      console.log('');
      
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('\n');
      // ========== 日志打印结束 ==========
      
      console.log(`💾 [HICODE] 保存工具结果到 storage:`, {
        toolCallId,
        toolName,
        outputLength: outputText.length,
        hasAttachments: (completedState.attachments?.length ?? 0) > 0,
        messageId: this.assistantMessage.id,
        status: completedState.status,
        outputPreview: outputText.length > 100 ? outputText.substring(0, 100) + '...' : outputText,
      });
      
      await this.config.storage.updatePart(this.assistantMessage.id, updatedPart);
      
      // 验证保存是否成功
      const savedParts = await this.config.storage.getParts(this.assistantMessage.id);
      const savedToolPart = savedParts.find((p: any) => p.type === 'tool' && ((p.callID || p.toolCallId) === toolCallId)) as any;
      console.log(`[HICODE DEBUG] 验证工具结果保存:`, {
        toolCallId,
        found: !!savedToolPart,
        savedStatus: savedToolPart?.state?.status,
        savedOutput: savedToolPart?.state?.output ? (typeof savedToolPart.state.output === 'string' ? savedToolPart.state.output.substring(0, 100) : typeof savedToolPart.state.output) : undefined,
      });
      
      // 从内存中移除（已完成）
      this.toolCalls.delete(toolCallId);
      
      console.log(`[HICODE DEBUG] 工具 ${toolName} 执行完成，耗时: ${executionTime}ms`);
      
      if (this.onToolCallUpdate) {
        this.onToolCallUpdate({
          type: 'complete',
          toolName,
          toolCallId,
          result: outputText,
        });
      }
    } catch (error) {
      // 记录工具执行错误
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[HICODE DEBUG] 工具 ${toolName} 执行失败: ${errorMessage}`, error);
      
      const startTime = toolCallPart.state.status === 'running' ? toolCallPart.state.time.start : Date.now();
      const errorState: ToolState = {
        status: 'error',
        input: args,
        error: errorMessage,
        time: {
          start: startTime,
          end: Date.now(),
        },
      };

      const updatedPart: ToolPart = {
        ...toolCallPart,
        state: errorState,
      };
      
      await this.config.storage.updatePart(this.assistantMessage.id, updatedPart);
      
      // 检查是否是权限拒绝错误
      if (error instanceof RejectedError || error instanceof DeniedError) {
        this.blocked = true;
      }
      
      // 从内存中移除（已出错）
      this.toolCalls.delete(toolCallId);
      
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
   * 处理工具错误事件
   */
  private async handleToolError(chunk: any): Promise<void> {
    if (!this.assistantMessage) {
      return;
    }

    const toolCallId = chunk.toolCallId;
    const toolCallPart = this.toolCalls.get(toolCallId);
    if (!toolCallPart || toolCallPart.state.status !== 'running') {
      return;
    }

    const error = chunk.error;
    const errorMessage = error instanceof Error ? error.message : String(error);

    const errorState: ToolState = {
      status: 'error',
      input: chunk.input ?? toolCallPart.state.input,
      error: errorMessage,
      time: {
        start: toolCallPart.state.time.start,
        end: Date.now(),
      },
    };

    const updatedPart: ToolPart = {
      ...toolCallPart,
      state: errorState,
    };

    await this.config.storage.updatePart(this.assistantMessage.id, updatedPart);

    // 检查是否是权限拒绝错误
    if (error instanceof RejectedError || error instanceof DeniedError) {
      this.blocked = true;
    }

    // 从内存中移除
    this.toolCalls.delete(toolCallId);

    if (this.onToolCallUpdate) {
      this.onToolCallUpdate({
        type: 'error',
        toolName: toolCallPart.tool,
        toolCallId,
        error: errorMessage,
      });
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
    
    // 如果工具调用不在内存中，可能已经被 handleToolCall 处理完成了
    // 这种情况下，AI SDK 的 tool-result 事件可能是重复的，可以忽略
    if (!toolCallPart) {
      console.log(`[HICODE DEBUG] 工具调用 ${chunk.toolCallId} 不在内存中，可能已处理完成，忽略 tool-result 事件`);
      return;
    }
    
    if (toolCallPart.state.status !== 'running') {
      console.log(`[HICODE DEBUG] 工具调用 ${chunk.toolCallId} 状态不是 running，忽略 tool-result 事件`);
      return;
    }

    // 根据 opencode 的实现，AI SDK 的 tool-result 事件格式是：
    // { toolCallId, output: { output, metadata, title, attachments } }
    // 或者可能是 { toolCallId, result, output }
    let outputText: string = '';
    let outputMetadata: any = {};
    let outputTitle: string = '';
    let outputAttachments: any[] = [];
    
    // 优先使用 output.output（opencode 格式）
    if (chunk.output) {
      const output = chunk.output;
      if (typeof output === 'string') {
        outputText = output;
      } else if (output && typeof output === 'object') {
        // opencode 格式：output.output 是实际输出文本
        if (output.output !== undefined) {
          outputText = typeof output.output === 'string' ? output.output : JSON.stringify(output.output);
        } else if (output.text && typeof output.text === 'string') {
          outputText = output.text;
        } else if (output.value && typeof output.value === 'string') {
          outputText = output.value;
        } else {
          outputText = JSON.stringify(output);
        }
        outputMetadata = output.metadata || {};
        outputTitle = output.title || '';
        outputAttachments = output.attachments || [];
      }
    } else if (chunk.result !== undefined) {
      // 兼容其他格式：直接使用 result
      if (typeof chunk.result === 'string') {
        outputText = chunk.result;
      } else if (chunk.result && typeof chunk.result === 'object') {
        if (chunk.result.text && typeof chunk.result.text === 'string') {
          outputText = chunk.result.text;
        } else {
          outputText = JSON.stringify(chunk.result);
        }
      } else {
        outputText = String(chunk.result);
      }
    }

    // 更新工具调用结果
    const endTime = Date.now();
    const executionTime = endTime - toolCallPart.state.time.start;
    
    const completedState: ToolState = {
      status: 'completed',
      input: chunk.input ?? toolCallPart.state.input,
      output: outputText,
      title: outputTitle,
      metadata: outputMetadata,
      time: {
        start: toolCallPart.state.time.start,
        end: endTime,
      },
      attachments: outputAttachments,
    };

    const updatedPart: ToolPart = {
      ...toolCallPart,
      state: completedState,
    };
    
    // ========== 打印工具结果事件处理 ==========
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [HICODE] 工具结果事件处理 - 详细结果');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`🛠️  工具名称: ${toolCallPart.tool}`);
    console.log(`🆔 工具调用ID: ${chunk.toolCallId}`);
    console.log(`⏱️  执行时间: ${executionTime}ms`);
    console.log(`📊 状态: ${completedState.status}`);
    console.log('');
    
    // 打印输入参数
    console.log('📥 输入参数:');
    console.log(JSON.stringify(completedState.input, null, 2).split('\n').map(line => `   ${line}`).join('\n'));
    console.log('');
    
    // 打印输出结果
    console.log('📤 输出结果:');
    if (outputTitle) {
      console.log(`   标题: ${outputTitle}`);
    }
    console.log(`   输出长度: ${outputText.length} 字符`);
    if (outputText.length > 0) {
      console.log(`   输出内容:`);
      console.log(outputText.split('\n').map(line => `   ${line}`).join('\n'));
    } else {
      console.log('   (无输出内容)');
    }
    console.log('');
    
    // 打印元数据
    if (Object.keys(outputMetadata).length > 0) {
      console.log('📋 元数据:');
      console.log(JSON.stringify(outputMetadata, null, 2).split('\n').map(line => `   ${line}`).join('\n'));
      console.log('');
    }
    
    // 打印附件信息
    if (outputAttachments && outputAttachments.length > 0) {
      console.log(`📎 附件数量: ${outputAttachments.length}`);
      outputAttachments.forEach((attachment: any, index: number) => {
        console.log(`   [${index + 1}] 类型: ${attachment.type || 'unknown'}`);
        if (attachment.mime) console.log(`       MIME: ${attachment.mime}`);
        if (attachment.filename) console.log(`       文件名: ${attachment.filename}`);
        if (attachment.url) {
          const urlPreview = attachment.url.length > 100 
            ? attachment.url.substring(0, 100) + '...' 
            : attachment.url;
          console.log(`       URL: ${urlPreview}`);
        }
      });
      console.log('');
    }
    
    // 打印时间信息
    console.log('⏰ 时间信息:');
    console.log(`   开始时间: ${new Date(toolCallPart.state.time.start).toLocaleString()}`);
    console.log(`   结束时间: ${new Date(endTime).toLocaleString()}`);
    console.log(`   耗时: ${executionTime}ms`);
    console.log('');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n');
    // ========== 日志打印结束 ==========

    await this.config.storage.updatePart(this.assistantMessage.id, updatedPart);

    // 从内存中移除（已完成）
    this.toolCalls.delete(chunk.toolCallId);

    if (this.onToolCallUpdate) {
      this.onToolCallUpdate({
        type: 'complete',
        toolName: toolCallPart.tool,
        toolCallId: chunk.toolCallId,
        result: outputText,
      });
    }
  }
}