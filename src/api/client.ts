/**
 * API Client Manager
 * 管理所有模型的API调用，提供统一的接口
 * 使用 AI SDK 统一接口
 */
import {
  IAPIClient,
  ModelConfig,
  ProviderInfo,
  ChatRequest,
  ChatResponse,
  CodeContext,
  CompletionSuggestion,
} from './types';
import { ProviderManager } from './provider/providerManager';
import { ProviderTransform } from './provider/transform';
import type { IModelManager } from '../config/modelManager';
import type { ModelMessage } from 'ai';

/**
 * API客户端管理器
 * 负责管理多个模型，提供统一的API调用接口
 */
export class APIClientManager implements IAPIClient {
  private providerManager: ProviderManager;
  private modelManager: IModelManager;

  constructor(modelManager: IModelManager) {
    this.modelManager = modelManager;
    this.providerManager = ProviderManager.getInstance();
  }

  /**
   * 解析模型ID
   * 支持格式: "providerID/modelID" 或 "modelId"（向后兼容）
   */
  private parseModelId(modelId: string): [string, string] {
    if (!modelId) {
      throw new Error('Model ID cannot be empty');
    }

    // 支持格式: "providerID/modelID"
    if (modelId.includes('/')) {
      const [providerID, ...rest] = modelId.split('/');
      if (!providerID || !rest.length) {
        throw new Error(`Invalid model ID format: ${modelId}. Expected format: "providerID/modelID"`);
      }
      return [providerID, rest.join('/')];
    }

    // 向后兼容：尝试从模型配置中查找
    const configs = this.modelManager.getModelConfigs();
    const model = configs.find((m) => m.modelId === modelId || m.modelID === modelId || m.modelName === modelId);
    if (model) {
      // 如果找到了模型配置，确保有 providerID 和 modelID
      if (model.providerID && model.modelID) {
        return [model.providerID, model.modelID];
      }
      // 如果只有 providerID，尝试从 modelName 或 modelId 推断 modelID
      if (model.providerID) {
        const inferredModelID = model.modelID || model.modelName || (model.modelId && !model.modelId.includes('-') ? model.modelId : 'unknown');
        return [model.providerID, inferredModelID];
      }
    }

    // 如果找不到，尝试使用当前模型
    const currentModelId = this.modelManager.getCurrentModel();
    if (currentModelId && currentModelId !== modelId) {
      const currentModel = configs.find((m) => m.modelId === currentModelId);
      if (currentModel) {
        if (currentModel.providerID && currentModel.modelID) {
          return [currentModel.providerID, currentModel.modelID];
        }
        if (currentModel.providerID) {
          const inferredModelID = currentModel.modelID || currentModel.modelName || (currentModel.modelId && !currentModel.modelId.includes('-') ? currentModel.modelId : 'unknown');
          return [currentModel.providerID, inferredModelID];
        }
      }
    }

    throw new Error(`Cannot parse model ID: ${modelId}. Expected format: "providerID/modelID" or a valid model ID from configuration.`);
  }

  /**
   * 转换消息格式
   */
  private convertMessages(messages: ChatRequest['messages'] | ModelMessage[]): Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }> {
    return messages
      .filter((msg) => {
        // 过滤掉 tool 角色的消息（generateText 不支持 tool 角色）
        return msg.role !== 'tool';
      })
      .map((msg) => {
        // 处理 ModelMessage 类型（可能包含复杂 content）
        if (typeof msg.content === 'string') {
          return {
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content,
          };
        }
        // 如果是数组形式的 content，转换为字符串
        if (Array.isArray(msg.content)) {
          const textParts = msg.content
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text)
            .join('');
          return {
            role: msg.role as 'system' | 'user' | 'assistant',
            content: textParts,
          };
        }
        // 默认情况
        return {
          role: msg.role as 'system' | 'user' | 'assistant',
          content: String(msg.content),
        };
      });
  }

  /**
   * 映射结束原因
   */
  private mapFinishReason(reason: string): 'stop' | 'length' | 'error' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
      case 'length_limit':
      case 'max_tokens':
        return 'length';
      default:
        return 'error';
    }
  }

/**
   * 发送聊天请求
   */
  async sendChatRequest(request: ChatRequest): Promise<ChatResponse> {
    try {
      console.log(`[HICODE DEBUG] 开始发送聊天请求`);
      
      // 如果没有指定模型，使用当前模型
      let modelId = request.model;
      if (!modelId) {
        modelId = this.modelManager.getCurrentModel();
        if (!modelId) {
          throw new Error('No model is currently selected. Please select a model first.');
        }
      }
      
      console.log(`[HICODE DEBUG] 使用模型: ${modelId}`);
      
      // 解析模型ID
      const [providerID, modelID] = this.parseModelId(modelId);

      // 获取模型和提供商配置
      const model = await this.modelManager.getModel(providerID, modelID);
      const provider = await this.modelManager.getProvider(providerID);

      console.log(`[HICODE DEBUG] 模型配置 - Provider: ${providerID}, Model: ${modelID}`);

      // 获取语言模型实例
      const languageModel = await this.providerManager.getLanguageModel(model, provider);

      // 转换消息格式
      const messages = this.convertMessages(request.messages);
      console.log(`[HICODE DEBUG] 转换后的消息数量: ${messages.length}`);

      // 应用消息转换
      const transformedMessages = ProviderTransform.message(
        request.messages,
        model,
        {}
      );

      // 获取 Provider 特定选项
      const providerOptions = ProviderTransform.options({
        model,
        sessionID: '', // TODO: 从请求中获取
        providerOptions: {},
      });

      // 动态导入 AI SDK
      const { generateText } = await import('ai');
      
      console.log(`[HICODE DEBUG] 开始调用AI SDK - generateText`);
      
      // 调用 AI SDK
      const result = await generateText({
        model: languageModel,
        messages: this.convertMessages(transformedMessages),
        temperature: request.temperature ?? ProviderTransform.temperature(model) ?? 0.6,
        maxTokens: request.maxTokens ?? model.limit.output,
        ...providerOptions,
      } as any); // 使用 any 类型以兼容不同版本的 AI SDK

      console.log(`[HICODE DEBUG] AI SDK调用完成 - 响应长度: ${result.text?.length || 0}, 完成原因: ${result.finishReason}`);
      console.log(`[HICODE DEBUG] 响应内容预览:`, result.text?.substring(0, 200) || '');
      
      return {
        content: result.text,
        finishReason: this.mapFinishReason(result.finishReason),
        usage: {
          promptTokens: (result.usage as any)?.promptTokens ?? (result.usage as any)?.inputTokens ?? 0,
          completionTokens: (result.usage as any)?.completionTokens ?? (result.usage as any)?.outputTokens ?? 0,
          totalTokens: (result.usage as any)?.totalTokens ?? 0,
        },
      };
    } catch (error) {
      console.error(`[HICODE DEBUG] 发送聊天请求失败:`, error);
      throw new Error(
        `Failed to send chat request: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

/**
   * 发送流式聊天请求
   */
  async sendStreamChatRequest(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onEnd: () => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      console.log(`[HICODE DEBUG] 开始发送流式聊天请求`);
      
      // 如果没有指定模型，使用当前模型
      let modelId = request.model;
      if (!modelId) {
        modelId = this.modelManager.getCurrentModel();
        if (!modelId) {
          onError(new Error('No model is currently selected. Please select a model first.'));
          return;
        }
      }
      
      // 解析模型ID
      const [providerID, modelID] = this.parseModelId(modelId);

      // 获取模型和提供商配置
      const model = await this.modelManager.getModel(providerID, modelID);
      const provider = await this.modelManager.getProvider(providerID);

      console.log(`[HICODE DEBUG] 流式请求模型配置 - Provider: ${providerID}, Model: ${modelID}`);

      // 获取语言模型实例
      const languageModel = await this.providerManager.getLanguageModel(model, provider);

      // 应用消息转换
      const transformedMessages = ProviderTransform.message(
        request.messages,
        model,
        {}
      );

      // 获取 Provider 特定选项
      const providerOptions = ProviderTransform.options({
        model,
        sessionID: '', // TODO: 从请求中获取
        providerOptions: {},
      });

      // 动态导入 AI SDK
      const ai = await import('ai');
      const { streamText } = ai;
      
      // 调用 AI SDK 流式接口
      // 参考 opencode 的实现，使用 fullStream 并处理所有 chunk 类型
      // 关键：即使不使用工具，也要传递空的 tools 对象，避免 AI SDK 内部处理错误
      // 注意：AI SDK 6.0 使用 maxOutputTokens 而不是 maxTokens
      const streamOptions: any = {
        model: languageModel,
        messages: this.convertMessages(transformedMessages),
        temperature: request.temperature ?? ProviderTransform.temperature(model) ?? 0.6,
        maxOutputTokens: request.maxTokens ?? model.limit.output, // AI SDK 6.0 使用 maxOutputTokens
        // 传递空的 tools 对象，参考 opencode 的实现
        tools: {},
        activeTools: [],
        // 禁用工具调用
        maxToolRoundtrips: 0,
        experimental_toolCallStreaming: false,
        // 禁用遥测功能，避免 OpenTelemetry 错误
        experimental_telemetry: {
          isEnabled: false,
        },
        ...providerOptions,
      };
      
      // 不删除 tools，保持空对象（opencode 的做法）
      
try {
        // 添加 onError 回调来处理流错误，参考 opencode 的实现
        streamOptions.onError = (error: any) => {
          console.error('[APIClient] Stream error in onError callback:', error);
          // 不在这里抛出错误，让 fullStream 处理
        };
        
        console.log(`[HICODE DEBUG] 开始调用AI SDK - streamText`);
        const result = await streamText(streamOptions);

        // 使用 fullStream 处理所有 chunk 类型，参考 opencode 的实现
        // 使用 any 类型以处理所有可能的 chunk 类型
        let currentText = '';
        console.log(`[HICODE DEBUG] 开始处理流式响应`);
        try {
          for await (const chunk of result.fullStream) {
          const chunkType = (chunk as any).type;
          
          switch (chunkType) {
            case 'start':
            case 'stream-start':
              // 流开始，不做处理
              console.log(`[HICODE DEBUG] 收到流开始事件 - 类型: ${chunkType}`);
              break;
            
            case 'text-start':
              // 文本开始，重置当前文本
              currentText = '';
              break;
            
case 'text-delta':
              // 文本增量，累积并发送
              // AI SDK 6.0 使用 text 属性而不是 textDelta
              const textDelta = (chunk as any).text || (chunk as any).textDelta;
              if (textDelta) {
                currentText += textDelta;
                console.log('[HICODE DEBUG] 发送文本增量:', { length: textDelta.length, preview: textDelta.substring(0, 50) });
                onChunk(textDelta);
              } else {
                console.warn('[HICODE DEBUG] text-delta chunk没有text或textDelta属性', { chunk });
              }
              break;
            
            case 'text-end':
              // 文本结束，不做处理（已经在 text-delta 中发送）
              break;
            
case 'finish':
            case 'finish-step':
            case 'step-finish':
              // 流结束
              console.log(`[HICODE DEBUG] 收到流结束事件 - 类型: ${chunkType}`);
              break;
            
            case 'error':
              // 错误，抛出
              console.error(`[HICODE DEBUG] 收到错误事件:`, (chunk as any).error);
              throw (chunk as any).error;
            
            // 忽略其他类型的 chunk（如 tool-call, tool-result, reasoning-* 等）
            case 'reasoning-start':
            case 'reasoning-delta':
            case 'reasoning-end':
            case 'tool-call':
            case 'tool-call-streaming-start':
            case 'tool-call-delta':
            case 'tool-result':
            case 'tool-error':
            case 'tool-input-start':
            case 'tool-input-delta':
            case 'tool-input-end':
            case 'start-step':
              // 这些类型我们不处理，但也不抛出错误
              break;
            
default:
              // 对于未知的 chunk 类型，记录日志但不抛出错误（参考 opencode 的实现）
              console.log(`[HICODE DEBUG] 未处理的chunk类型: ${chunkType}`, chunk);
              break;
          }
        }
} catch (streamError: any) {
          // 如果 fullStream 失败（可能是 stream-start 错误），尝试使用 textStream
          if (streamError.message?.includes('stream-start') || streamError.message?.includes('Unhandled chunk type')) {
            console.warn(`[HICODE DEBUG] fullStream失败，尝试textStream: ${streamError.message}`);
            try {
              // 尝试使用 textStream 作为回退
              console.log(`[HICODE DEBUG] 开始使用textStream`);
              for await (const chunk of result.textStream) {
                onChunk(chunk);
              }
            } catch (textStreamError: any) {
              // 如果 textStream 也失败，抛出错误
              console.error(`[HICODE DEBUG] textStream也失败:`, textStreamError);
              throw textStreamError;
            }
          } else {
            console.error(`[HICODE DEBUG] 流处理失败:`, streamError);
            throw streamError;
          }
        }
        
        console.log(`[HICODE DEBUG] 流式响应处理完成`);
        onEnd();
      } catch (error) {
        console.error(`[HICODE DEBUG] 流处理失败:`, error);
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      onError(errorObj);
    }
  }

  /**
   * 发送补全请求
   */
  async sendCompletionRequest(
    context: CodeContext,
    prefix: string,
    suffix: string
  ): Promise<CompletionSuggestion[]> {
    try {
      // 获取当前模型
      const currentModelId = this.modelManager.getCurrentModel();
      if (!currentModelId) {
        throw new Error('No model is currently selected');
      }

      const [providerID, modelID] = this.parseModelId(currentModelId);
      const model = await this.modelManager.getModel(providerID, modelID);
      const provider = await this.modelManager.getProvider(providerID);
      const languageModel = await this.providerManager.getLanguageModel(model, provider);

      // 构建补全提示词
      const prompt = this.buildCompletionPrompt(context, prefix, suffix);

      const messages = [
        {
          role: 'system' as const,
          content: 'You are a code completion assistant. Provide concise code completions based on context. Return only the completion code without explanations.',
        },
        {
          role: 'user' as const,
          content: prompt,
        },
      ];

      // 动态导入 AI SDK
      const ai = await import('ai');
      const { generateText } = ai;
      
      const result = await generateText({
        model: languageModel,
        messages,
        temperature: 0.2, // 较低的温度以获得更确定的补全
        maxTokens: 150,
      } as any); // 使用 any 类型以兼容不同版本的 AI SDK

      // 解析补全建议
      return this.parseCompletionResponse(result.text);
    } catch (error) {
      throw new Error(
        `Failed to send completion request: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取当前模型ID
   */
  getCurrentModel(): string {
    return this.modelManager.getCurrentModel();
  }

  /**
   * 设置当前模型ID
   */
  async setCurrentModel(modelId: string): Promise<void> {
    await this.modelManager.setCurrentModel(modelId);
  }

  /**
   * 验证API配置
   */
  async validateConfig(config: ModelConfig): Promise<boolean> {
    try {
      // 检查必需字段
      if (!config.modelId || !config.providerID || !config.modelID) {
        return false;
      }

      // 检查 API 配置
      if (!config.api || !config.api.url || !config.api.npm) {
        return false;
      }

      // 尝试获取 Provider（验证配置是否有效）
      const provider = await this.modelManager.getProvider(config.providerID);
      if (!provider) {
        return false;
      }

      // 尝试获取模型（验证模型是否存在）
      const model = await this.modelManager.getModel(config.providerID, config.modelID);
      if (!model) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 构建补全提示词
   */
  private buildCompletionPrompt(
    context: CodeContext,
    prefix: string,
    suffix: string
  ): string {
    let prompt = `File type: ${context.currentFile.language}\n\n`;

    // 添加相关导入和定义
    if (context.relatedFiles && context.relatedFiles.length > 0) {
      prompt += 'Related context:\n';
      context.relatedFiles.forEach((file) => {
        prompt += `${file.excerpt}\n`;
      });
      prompt += '\n';
    }

    prompt += 'Please provide code completion for:\n\n';
    prompt += '```' + context.currentFile.language + '\n';
    prompt += prefix;
    prompt += '<CURSOR>';
    if (suffix) {
      prompt += '\n' + suffix;
    }
    prompt += '\n```\n\n';
    prompt += 'Return only the code that should be inserted at <CURSOR> position.';

    return prompt;
  }

  /**
   * 解析补全响应
   */
  private parseCompletionResponse(content: string): CompletionSuggestion[] {
    // 提取代码块
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)\n```/;
    const match = content.match(codeBlockRegex);

    const completionText = match ? match[1] : content.trim();

    if (!completionText) {
      return [];
    }

    return [
      {
        text: completionText,
        kind: 'text',
        detail: 'AI Suggestion',
        documentation: 'Code completion generated by AI',
      },
    ];
  }
}
