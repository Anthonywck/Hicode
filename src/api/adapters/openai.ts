/**
 * OpenAI模型适配器
 * 实现OpenAI API的格式转换和调用逻辑
 */

import axios, { AxiosInstance } from 'axios';
import {
  ModelAdapter,
  ModelConfig,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  CodeContext,
  CompletionSuggestion,
} from '../types';
import { IPromptManager } from '../../prompts/types';

/**
 * OpenAI API消息格式
 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI API请求格式
 */
interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

/**
 * OpenAI API响应格式
 */
interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI流式响应数据块
 */
interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

/**
 * OpenAI适配器实现
 */
export class OpenAIAdapter implements ModelAdapter {
  private axiosInstance: AxiosInstance;
  private config: ModelConfig;
  private promptManager?: IPromptManager;

  constructor(config: ModelConfig, promptManager?: IPromptManager) {
    this.config = config;
    this.promptManager = promptManager;
    this.axiosInstance = axios.create({
      baseURL: config.apiBaseUrl || 'https://api.openai.com/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      timeout: 60000, // 60秒超时（OpenAI可能需要更长时间）
    });
  }

  /**
   * 发送聊天请求
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const openaiRequest = await this.convertToOpenAIFormat(request);
      const response = await this.axiosInstance.post<OpenAIChatResponse>(
        '/chat/completions',
        openaiRequest
      );
      return this.convertFromOpenAIFormat(response.data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 发送流式聊天请求
   */
  async chatStream(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onEnd: () => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      const openaiRequest = await this.convertToOpenAIFormat(request);
      openaiRequest.stream = true;

      const response = await this.axiosInstance.post(
        '/chat/completions',
        openaiRequest,
        {
          responseType: 'stream',
        }
      );

      let buffer = '';

      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.trim() === 'data: [DONE]') {
            onEnd();
            return;
          }

          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as OpenAIStreamChunk;
              const content = data.choices[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
              if (data.choices[0]?.finish_reason) {
                onEnd();
              }
            } catch (parseError) {
              // 忽略解析错误，继续处理下一行
            }
          }
        }
      });

      response.data.on('error', (error: Error) => {
        onError(error);
      });

      response.data.on('end', () => {
        onEnd();
      });
    } catch (error) {
      onError(error as Error);
    }
  }

  /**
   * 发送补全请求
   */
  async complete(
    context: CodeContext,
    prefix: string,
    suffix: string
  ): Promise<CompletionSuggestion[]> {
    try {
      // 构建补全提示词
      const prompt = this.buildCompletionPrompt(context, prefix, suffix);

      const request: ChatRequest = {
        messages: [
          {
            role: 'system',
            content: 'You are a code completion assistant. Provide concise code completions based on context. Return only the completion code without explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: this.config.modelName,
        stream: false,
        temperature: 0.2, // 较低的温度以获得更确定的补全
        maxTokens: 150,
      };

      const response = await this.chat(request);

      // 解析补全建议
      return this.parseCompletionResponse(response.content);
    } catch (error) {
      console.error('OpenAI completion error:', error);
      return [];
    }
  }

  /**
   * 验证配置
   */
  async validateConfig(config: ModelConfig): Promise<boolean> {
    try {
      // 检查必需字段
      if (!config.modelId || !config.apiKey) {
        return false;
      }

      // 尝试发送一个简单的请求来验证API密钥
      const testRequest: ChatRequest = {
        messages: [
          {
            role: 'user',
            content: 'Hi',
          },
        ],
        model: config.modelName,
        stream: false,
        maxTokens: 5,
      };

      await this.chat(testRequest);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 计算token数量
   * 使用简单的估算方法：约4个字符 = 1 token
   */
  countTokens(text: string): number {
    // OpenAI的token计算较为复杂，这里使用简单估算
    // 平均约4个字符对应1个token
    return Math.ceil(text.length / 4);
  }

  /**
   * 转换为OpenAI API格式
   */
  private async convertToOpenAIFormat(request: ChatRequest): Promise<OpenAIChatRequest> {
    const messages = await Promise.all(
      request.messages.map(async msg => ({
        role: msg.role,
        content: await this.enrichMessageContent(msg),
      }))
    );
    
    return {
      model: request.model,
      messages,
      stream: request.stream,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    };
  }

  /**
   * 从OpenAI API格式转换
   */
  private convertFromOpenAIFormat(response: OpenAIChatResponse): ChatResponse {
    const choice = response.choices[0];
    return {
      content: choice.message.content,
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }

  /**
   * 丰富消息内容，包含代码上下文
   * 如果配置了 PromptManager，使用模板系统；否则使用原有的硬编码逻辑
   */
  private async enrichMessageContent(message: ChatMessage): Promise<string> {
    // 如果配置了 PromptManager，使用模板系统
    if (this.promptManager) {
      return await this.promptManager.enrichMessageContent(message);
    }
    
    // 否则使用原有的硬编码逻辑（向后兼容）
    let content = message.content;

    if (message.context) {
      const ctx = message.context;

      // 添加选中的代码
      if (ctx.selection) {
        content += `\n\nSelected code:\n\`\`\`${ctx.currentFile.language}\n${ctx.selection.text}\n\`\`\``;
      }

      // 添加当前文件信息
      if (ctx.currentFile && !ctx.selection) {
        content += `\n\nCurrent file (${ctx.currentFile.path}):\n\`\`\`${ctx.currentFile.language}\n${ctx.currentFile.content}\n\`\`\``;
      }

      // 添加相关文件信息
      if (ctx.relatedFiles && ctx.relatedFiles.length > 0) {
        content += '\n\nRelated files:';
        ctx.relatedFiles.forEach(file => {
          content += `\n- ${file.path}:\n\`\`\`\n${file.excerpt}\n\`\`\``;
        });
      }
    }

    return content;
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
      context.relatedFiles.forEach(file => {
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
        documentation: 'Code completion generated by OpenAI',
      },
    ];
  }

  /**
   * 映射结束原因
   */
  private mapFinishReason(reason: string): 'stop' | 'length' | 'error' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      default:
        return 'error';
    }
  }

  /**
   * 处理错误
   */
  private handleError(error: any): ChatResponse {
    let errorMessage = 'Unknown error';

    if (axios.isAxiosError(error)) {
      if (error.response) {
        // 服务器返回错误
        const status = error.response.status;
        const data = error.response.data;

        if (status === 401) {
          errorMessage = 'Authentication failed: Invalid API key';
        } else if (status === 429) {
          errorMessage = 'Rate limit exceeded: Please try again later';
        } else if (status === 500) {
          errorMessage = 'OpenAI server error: Please try again later';
        } else {
          errorMessage = `API error (${status}): ${
            data?.error?.message || error.response.statusText
          }`;
        }
      } else if (error.request) {
        // 请求发送但没有响应
        errorMessage = 'Network error: Unable to connect to OpenAI API';
      } else {
        // 请求配置错误
        errorMessage = `Request error: ${error.message}`;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      content: `Error: ${errorMessage}`,
      finishReason: 'error',
    };
  }
}
