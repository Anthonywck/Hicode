/**
 * gRPC API 客户端适配器
 * 将所有 API 调用路由到 Agent 服务（通过 gRPC）
 * 参考 vscode/hicode 项目的实现
 */

import { IAPIClient, ChatRequest, ChatResponse, CodeContext, CompletionSuggestion, ModelConfig } from './types';
import { fetchStreamResponse, fetchResponse } from '../grpc/chat';
import { getGrpcClientManager } from '../grpc/grpcClient';
import * as vscode from 'vscode';
import { generateUUID } from '../utils/tools';
import { getConfigManager } from '../extension';

/**
 * gRPC API 客户端
 * 实现 IAPIClient 接口，将所有调用路由到 Agent 服务
 */
export class GrpcAPIClient implements IAPIClient {
  private modelManager: any;
  private currentModel: string | null = null;

  constructor(modelManager?: any) {
    this.modelManager = modelManager;
    if (this.modelManager) {
      this.currentModel = this.modelManager.getCurrentModel();
    }
  }

  /**
   * 获取当前模型
   */
  getCurrentModel(): string | null {
    if (this.modelManager) {
      const configModelId = this.modelManager.getCurrentModel();
      if (configModelId) {
        this.currentModel = configModelId;
        return configModelId;
      }
    }
    return this.currentModel;
  }

  /**
   * 设置当前模型
   */
  async setCurrentModel(modelId: string): Promise<void> {
    if (this.modelManager) {
      await this.modelManager.setCurrentModel(modelId);
    }
    this.currentModel = modelId;
  }

  /**
   * 将 ChatRequest 转换为 gRPC 请求格式（符合 proto 定义）
   * proto 定义：message ChatRequest {
   *   repeated ChatMessage messages = 1;
   *   string model = 2;
   *   bool stream = 3;
   *   ModelConfig model_config = 4;
   *   optional float temperature = 5;
   *   optional int32 max_tokens = 6;
   * }
   */
  private async convertChatRequestToGrpc(request: ChatRequest, sessionId?: string): Promise<any> {
    // 获取当前模型配置
    const modelId = this.getCurrentModel() || request.model || 'current';
    const models = this.modelManager?.getModelConfigs() || [];
    const modelConfig = models.find((m: ModelConfig) => m.modelId === modelId || m.modelName === modelId);
    
    if (!modelConfig) {
      throw new Error(`Model not found: ${modelId}`);
    }

    // 获取 API key（从 SecretStorage）
    let apiKey = '';
    if (this.modelManager) {
      try {
        apiKey = await this.modelManager.getApiKey(modelId) || '';
      } catch (error) {
        console.warn(`Failed to get API key for model ${modelId}:`, error);
      }
    }

    if (!apiKey && modelConfig.apiKey) {
      apiKey = modelConfig.apiKey;
    }

    if (!apiKey || apiKey.trim() === '') {
      throw new Error(`API key not found for model ${modelId}. Please configure the API key in settings.`);
    }

    // 转换 messages 数组为 proto 格式，并提取上下文信息
    let codeContext: CodeContext | undefined = undefined;
    const protoMessages = request.messages.map((msg: any) => {
      const protoMsg: any = {
        role: msg.role,
        content: msg.content || ''
      };
      
      // 提取上下文信息（从 user 消息中提取）
      if (msg.role === 'user' && msg.context) {
        codeContext = msg.context;
      }
      
      // 处理工具调用（如果有）
      if ((msg as any).toolCalls) {
        protoMsg.tool_calls = (msg as any).toolCalls.map((tc: any) => ({
          id: tc.id || '',
          name: tc.function?.name || '',
          arguments: typeof tc.function?.arguments === 'string' 
            ? tc.function.arguments 
            : JSON.stringify(tc.function?.arguments || {})
        }));
      }
      
      if ((msg as any).toolCallId) {
        protoMsg.tool_call_id = (msg as any).toolCallId;
      }
      
      return protoMsg;
    });

    // 获取 Agent Mode 和 Prompt Type
    let agentMode: 'chat' | 'agent' = 'chat';
    let promptType: string = 'hicode_common_chat_prompt_type';
    
    try {
      const configManager = await getConfigManager();
      agentMode = configManager.getAgentMode();
      
      // 当 AgentMode 是 chat 时，promptType 是 hicode_common_chat_prompt_type
      // 当 AgentMode 是 agent 时，可以根据需要设置其他 promptType
      if (agentMode === 'chat') {
        promptType = 'hicode_common_chat_prompt_type';
      } else {
        // Agent 模式下的 promptType，可以根据实际需求设置
        promptType = 'hicode_agent_prompt_type';
      }
    } catch (error) {
      console.warn('Failed to get agent mode, using default:', error);
    }

    // 获取语言信息（从上下文或当前编辑器）
    let language: string = 'plaintext';
    const ctx = codeContext as CodeContext | undefined;
    if (ctx && ctx.currentFile && ctx.currentFile.language) {
      language = ctx.currentFile.language;
    } else {
      // 尝试从当前打开的编辑器获取语言
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        language = editor.document.languageId || 'plaintext';
      }
    }

    // 构建上下文对象（如果存在）
    let contextObj: any = undefined;
    if (ctx) {
      contextObj = {
        current_file: ctx.currentFile ? {
          path: ctx.currentFile.path || '',
          language: ctx.currentFile.language || '',
          content: ctx.currentFile.content || ''
        } : undefined,
        selection: ctx.selection ? {
          text: ctx.selection.content || '',
          start_line: ctx.selection.startLine || 0,
          end_line: ctx.selection.endLine || 0
        } : undefined,
        cursor_context: ctx.cursorContext ? {
          line: ctx.cursorContext.line || 0,
          column: ctx.cursorContext.column || 0,
          before_cursor: ctx.cursorContext.beforeCursor || '',
          after_cursor: ctx.cursorContext.afterCursor || ''
        } : undefined,
        related_files: (ctx.relatedFiles || []).map((file: any) => ({
          path: file.path || '',
          relevance: file.relevance || 0,
          excerpt: file.excerpt || ''
        })),
        project_info: ctx.projectInfo ? {
          name: ctx.projectInfo.name || '',
          dependencies: ctx.projectInfo.dependencies || [],
          framework: ctx.projectInfo.framework || ''
        } : undefined
      };
    }

    // 获取 resources（从请求中提取）
    const resources = (request as any).resources || [];

    // 构建符合 proto 定义的请求对象
    const grpcRequest: any = {
      messages: protoMessages,
      model: request.model || modelId,
      stream: request.stream || false,
      model_config: {
        model_id: modelConfig.modelId,
        model_name: modelConfig.modelName,
        display_name: modelConfig.displayName,
        vendor: modelConfig.vendor,
        api_key: apiKey,
        api_base_url: modelConfig.apiBaseUrl,
        max_context_tokens: modelConfig.maxContextTokens,
        support_multimodal: modelConfig.supportMultimodal || false,
        // temperature: 优先使用请求中的值，否则使用模型配置中的值，最后使用默认值0.6
        temperature: request.temperature !== undefined 
          ? request.temperature 
          : (modelConfig.temperature !== undefined ? modelConfig.temperature : 0.6)
      },
      // 添加上下文信息、Agent Mode 和 Prompt Type（作为额外字段，服务端可以通过这些字段获取）
      context: contextObj,
      agent_mode: agentMode,
      prompt_type: promptType,
      language: language,
      // 添加 resources（作为扩展字段，传递给 agent grpc 服务）
      resources: resources.map((r: any) => ({
        type: r.type || 'code',
        code: r.code || '',
        language: r.languageId || r.language || '',
        language_id: r.languageId || r.language || '',
        file_path: r.filePath || '',
        start_line: r.startLine || 0,
        end_line: r.endLine || 0
      }))
    };

    // 不再单独传递 temperature 和 max_tokens，temperature 已在 model_config 中，max_tokens 不设置

    return grpcRequest;
  }

  /**
   * 发送聊天请求（非流式）
   */
  async sendChatRequest(request: ChatRequest): Promise<ChatResponse> {
    try {
      // 转换为 gRPC 请求格式（符合 proto 定义）
      const grpcRequest = await this.convertChatRequestToGrpc(request);
      
      // 调用 gRPC 接口（需要修改 fetchResponse 以支持新的格式）
      const reply = await fetchResponse(grpcRequest);
      
      // 转换为 ChatResponse 格式
      return {
        content: reply,
        finishReason: 'stop',
        usage: undefined
      };
    } catch (error) {
      console.error('[GrpcAPIClient] sendChatRequest failed:', error);
      throw new Error(
        `gRPC chat request failed: ${error instanceof Error ? error.message : String(error)}`
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
      // 转换为 gRPC 请求格式（符合 proto 定义）
      const grpcRequest = await this.convertChatRequestToGrpc(request);
      
      // 调用 gRPC 流式接口（需要修改 fetchStreamResponse 以支持新的格式）
      await fetchStreamResponse(grpcRequest, (text: string) => {
        if (text === '[DONE]') {
          onEnd();
        } else {
          onChunk(text);
        }
      });
    } catch (error) {
      console.error('[GrpcAPIClient] sendStreamChatRequest failed:', error);
      const errorObj = error instanceof Error 
        ? error 
        : new Error(String(error));
      onError(errorObj);
    }
  }

  /**
   * 发送补全请求
   * 将补全请求转换为聊天请求
   */
  async sendCompletionRequest(
    context: CodeContext,
    prefix: string,
    suffix: string
  ): Promise<CompletionSuggestion[]> {
    try {
      // 构建补全提示词
      const prompt = `请为以下代码生成补全建议：\n\n前缀代码：\n${prefix}\n\n后缀代码：\n${suffix}\n\n请只返回补全的代码，不要包含其他解释。`;
      
      const request: ChatRequest = {
        messages: [
          {
            role: 'system',
            content: '你是一个代码补全助手。请根据上下文生成代码补全建议。'
          },
          {
            role: 'user',
            content: prompt,
            context
          }
        ],
        model: this.getCurrentModel() || 'current',
        stream: false
      };

      const response = await this.sendChatRequest(request);
      
      // 解析补全建议（简化实现）
      return [{
        text: response.content,
        kind: 'snippet',
        detail: 'AI generated completion'
      }];
    } catch (error) {
      console.error('gRPC completion request failed:', error);
      return [];
    }
  }

  /**
   * 验证API配置
   * gRPC 模式下，配置验证由 Agent 服务处理
   */
  async validateConfig(config: ModelConfig): Promise<boolean> {
    // 基本验证：检查必需字段
    if (!config.modelId || !config.modelName) {
      return false;
    }
    
    // gRPC 模式下，API 密钥和 URL 由 Agent 服务管理
    // 这里只做基本验证
    return true;
  }
}
