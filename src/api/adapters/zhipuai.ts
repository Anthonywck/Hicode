/**
 * 智谱AI模型适配器
 * 实现智谱AI API的格式转换和调用逻辑
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
import { LanguageModelChatToolMode } from 'vscode';

/**
 * 智谱AI API消息格式
 */
interface ZhipuAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 智谱AI API请求格式
 */
interface ZhipuAIChatRequest {
  model: string;
  messages: ZhipuAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

/**
 * 智谱AI API响应格式
 */
interface ZhipuAIChatResponse {
  id: string;
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
 * 智谱AI流式响应数据块
 */
interface ZhipuAIStreamChunk {
  id: string;
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
 * 智谱AI适配器实现
 */
export class ZhipuAIAdapter implements ModelAdapter {
  private axiosInstance: AxiosInstance;
  private config: ModelConfig;
  private promptManager?: IPromptManager;

  constructor(config: ModelConfig, promptManager?: IPromptManager) {
    this.config = config;
    this.promptManager = promptManager;
    
    // 调试日志
    console.log(`ZhipuAIAdapter initialized:`, {
      modelId: config.modelId,
      modelName: config.modelName,
      vendor: config.vendor,
      apiBaseUrl: config.apiBaseUrl,
      hasApiKey: !!config.apiKey,
      apiKeyLength: config.apiKey?.length || 0
    });
    
    this.axiosInstance = axios.create({
      baseURL: config.apiBaseUrl || 'https://open.bigmodel.cn/api/paas/v4',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      timeout: 60000, // 60秒超时
    });
  }

  /**
   * 发送聊天请求
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const zhipuRequest = await this.convertToZhipuAIFormat(request);
      const response = await this.axiosInstance.post<ZhipuAIChatResponse>(
        '/chat/completions',
        zhipuRequest
      );
      return this.convertFromZhipuAIFormat(response.data);
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
      const zhipuRequest = await this.convertToZhipuAIFormat(request);
      zhipuRequest.stream = true;

      const response = await this.axiosInstance.post(
        '/chat/completions',
        zhipuRequest,
        {
          responseType: 'stream',
        }
      );

      console.log(`[ZhipuAIAdapter] axiosInstance.post completed, response received:`, {
        status: response.status,
        statusText: response.statusText,
        hasData: !!response.data
      });

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
              const data = JSON.parse(line.slice(6)) as ZhipuAIStreamChunk;
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
        console.error('ZhipuAI stream error:', error);
        onError(error);
      });

      response.data.on('end', () => {
        onEnd();
      });
    } catch (error) {
      console.error('ZhipuAI chatStream error:', {
        error,
        message: error instanceof Error ? error.message : String(error),
        response: (error as any)?.response?.data,
        status: (error as any)?.response?.status,
        hasApiKey: !!this.config.apiKey
      });
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
            content: '你是一个代码补全助手。请根据上下文提供简洁的代码补全建议。只返回补全的代码，不要包含解释。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: this.config.modelName,
        stream: false,
        temperature: 0.2, // 较低的温度以获得更确定的补全
        maxTokens: 100,
      };

      const response = await this.chat(request);

      // 解析补全建议
      return this.parseCompletionResponse(response.content);
    } catch (error) {
      console.error('ZhipuAI completion error:', error);
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
            content: '你好',
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
   * 使用简单的估算方法：中文字符约1.5 tokens，英文单词约1 token
   */
  countTokens(text: string): number {
    // 简单估算：中文字符约1.5 tokens，英文单词约1 token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = text.split(/\s+/).filter(word => /[a-zA-Z]/.test(word)).length;
    return Math.ceil(chineseChars * 1.5 + englishWords);
  }

  /**
   * 转换为智谱AI API格式
   */
  private async convertToZhipuAIFormat(request: ChatRequest): Promise<ZhipuAIChatRequest> {
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
      top_p: 0.7, // 智谱AI推荐的默认值
    };
  }

  /**
   * 从智谱AI API格式转换
   */
  private convertFromZhipuAIFormat(response: ZhipuAIChatResponse): ChatResponse {
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
        content += `\n\n选中的代码：\n\`\`\`${ctx.currentFile.language}\n${ctx.selection.text}\n\`\`\``;
      }

      // 添加当前文件信息
      if (ctx.currentFile && !ctx.selection) {
        content += `\n\n当前文件 (${ctx.currentFile.path})：\n\`\`\`${ctx.currentFile.language}\n${ctx.currentFile.content}\n\`\`\``;
      }

      // 添加相关文件信息
      if (ctx.relatedFiles && ctx.relatedFiles.length > 0) {
        content += '\n\n相关文件：';
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
    let prompt = `文件类型: ${context.currentFile.language}\n\n`;

    // 添加相关导入和定义
    if (context.relatedFiles && context.relatedFiles.length > 0) {
      prompt += '相关上下文：\n';
      context.relatedFiles.forEach(file => {
        prompt += `${file.excerpt}\n`;
      });
      prompt += '\n';
    }

    prompt += '请为以下代码提供补全：\n\n';
    prompt += '```' + context.currentFile.language + '\n';
    prompt += prefix;
    prompt += '<CURSOR>';
    if (suffix) {
      prompt += '\n' + suffix;
    }
    prompt += '\n```\n\n';
    prompt += '只返回应该插入到<CURSOR>位置的代码，不要包含其他内容。';

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
        detail: 'AI建议',
        documentation: '由智谱AI生成的代码补全',
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
    let errorMessage = '未知错误';

    if (axios.isAxiosError(error)) {
      if (error.response) {
        // 服务器返回错误
        const status = error.response.status;
        const data = error.response.data;

        if (status === 401) {
          errorMessage = '认证失败：API密钥无效';
        } else if (status === 429) {
          errorMessage = '请求频率超限：请稍后重试';
        } else if (status === 500) {
          errorMessage = '智谱AI服务器错误：请稍后重试';
        } else {
          errorMessage = `API错误 (${status}): ${
            data?.error?.message || error.response.statusText
          }`;
        }
      } else if (error.request) {
        // 请求发送但没有响应
        errorMessage = '网络错误：无法连接到智谱AI API';
      } else {
        // 请求配置错误
        errorMessage = `请求错误: ${error.message}`;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      content: `错误: ${errorMessage}`,
      finishReason: 'error',
    };
  }
}
