/**
 * ProviderTransform - 消息转换层
 * 负责将通用消息格式转换为特定 Provider 需要的格式
 */

import type { ModelMessage } from 'ai';
import type { ChatMessage, ModelConfig } from '../types';

export namespace ProviderTransform {
  /**
   * 转换消息格式（支持 ModelMessage 和 ChatMessage）
   * 参考 opencode 的实现
   */
  export function message(
    msgs: ModelMessage[] | ChatMessage[],
    model: ModelConfig,
    options: Record<string, unknown> = {}
  ): ModelMessage[] {
    // 1. 过滤不支持的内容类型
    msgs = unsupportedParts(msgs as any, model) as any;

// 2. 对于 zhipuai/openai-compatible，合并多个 system 消息为一个，并确保 content 是字符串
    // 参考 opencode：某些模型不支持多个 system 消息，需要合并
    // 关键问题：zhipuai/openai-compatible API 要求 system 消息的 content 必须是字符串，不能是数组
    // 即使只有一个 system 消息，如果它的 content 是数组，也需要转换为字符串
    if (model.providerID === 'zhipuai' || model.api.npm === '@ai-sdk/openai-compatible') {
      console.log(`[HICODE DEBUG] 对智谱AI消息进行特殊处理 - 原始消息数量: ${msgs.length}`);
      
      const systemMsgs: ModelMessage[] = [];
      const otherMsgs: ModelMessage[] = [];
      
      // 分离 system 消息和其他消息
      for (const msg of msgs) {
        if (msg.role === 'system') {
          systemMsgs.push(msg);
        } else {
          otherMsgs.push(msg);
        }
      }
      
      console.log(`[HICODE DEBUG] 智谱AI消息分离 - 系统消息: ${systemMsgs.length}, 其他消息: ${otherMsgs.length}`);
      
      // 处理 system 消息：合并多个为一个，并确保 content 是字符串
      // 注意：即使只有一个 system 消息，也要确保它的 content 是字符串
      if (systemMsgs.length > 0) {
        // 提取所有 system 消息的文本内容，确保转换为字符串
        const systemContents: string[] = [];
        for (const msg of systemMsgs) {
          if (typeof msg.content === 'string') {
            // 已经是字符串，直接使用
            if (msg.content.trim() !== '') {
              systemContents.push(msg.content);
            }
          } else if (Array.isArray(msg.content)) {
            // 如果是数组，提取所有 text 部分并合并为字符串
            const textParts = (msg.content as any[])
              .filter((part: any) => part.type === 'text' && typeof part.text === 'string')
              .map((part: any) => part.text)
              .join('');
            if (textParts.trim() !== '') {
              systemContents.push(textParts);
            }
          }
          // 其他情况（null, undefined 等）跳过
        }
        
        // 合并所有 system 内容为一个字符串
        const mergedSystemContent = systemContents.join('\n\n');
        
        console.log(`[HICODE DEBUG] 智谱AI合并系统消息 - 原始系统消息数: ${systemContents.length}, 合并后长度: ${mergedSystemContent.length}`);
        console.log(`[HICODE DEBUG] 智谱AI系统消息前200字符:`, mergedSystemContent.substring(0, 200));
        
        if (mergedSystemContent.trim() !== '') {
          // 创建一个合并后的 system 消息，确保 content 是字符串
          msgs = [
            {
              role: 'system',
              content: mergedSystemContent, // 确保是字符串，不是数组
            } as ModelMessage,
            ...otherMsgs,
          ];
          console.log(`[HICODE DEBUG] 智谱AI消息转换完成 - 总消息数: ${msgs.length}`);
        } else {
          // 如果所有 system 消息都为空，移除它们
          msgs = otherMsgs;
          console.log(`[HICODE DEBUG] 智谱AI所有系统消息为空，已移除`);
        }
      }
    }

    // 3. 标准化消息格式
    msgs = normalizeMessages(msgs as any, model, options) as any;

    return msgs as ModelMessage[];
  }

/**
   * 获取默认温度参数
   */
  export function temperature(model: ModelConfig): number | undefined {
    const id = model.modelID.toLowerCase();
    if (id.includes('qwen')) return 0.55;
    if (id.includes('glm-4.6')) return 1.0;
    if (id.includes('glm-4.7')) return 1.0;
    return undefined;
  }
  
  /**
   * 检查模型是否需要特殊的工具调用设置
   */
  export function needsSpecialToolHandling(model: ModelConfig): boolean {
    const id = model.modelID.toLowerCase();
    const provider = model.providerID.toLowerCase();
    
    // 智谱AI模型可能需要特殊处理
    return provider.includes('zhipuai') || id.includes('glm');
  }

  /**
   * 获取 Provider 特定选项
   */
  export function options(input: {
    model: ModelConfig;
    sessionID: string;
    providerOptions?: Record<string, any>;
  }): Record<string, any> {
    const result: Record<string, any> = {};

    // 智谱AI特殊配置
    // 注意：thinking 功能会导致大量 reasoning-delta 事件，严重影响首token速度
    // 默认禁用以提升响应速度，如果需要可以手动启用
    // 如果启用 thinking，首token可能会延迟几十秒到几分钟
    if (
      ['zai', 'zhipuai'].includes(input.model.providerID) &&
      input.model.api.npm === '@ai-sdk/openai-compatible'
    ) {
      // 检查是否在 providerOptions 中明确启用了 thinking
      const enableThinking = input.providerOptions?.enableThinking === true;
      if (enableThinking) {
        result['thinking'] = {
          type: 'enabled',
          clear_thinking: false,
        };
      }
      // 默认不启用 thinking，以提升首token速度
    }

    return result;
  }

  /**
   * 获取 Provider Options（用于传递给 AI SDK）
   * 参考 opencode 的实现
   */
  export function providerOptions(model: ModelConfig, options: Record<string, any>): Record<string, any> | undefined {
    // 根据不同的 SDK 返回相应的 providerOptions
    // 参考 opencode 的实现，将 options 包装在对应的 key 下
    const sdkKey = getSDKKey(model.api.npm);
    if (!sdkKey) return undefined;
    
    // 如果 options 为空，返回 undefined
    if (!options || Object.keys(options).length === 0) return undefined;
    
    return { [sdkKey]: options };
  }

  /**
   * 获取 SDK 对应的 key（用于 providerOptions）
   */
  function getSDKKey(npm: string): string | undefined {
    switch (npm) {
      case '@ai-sdk/openai':
      case '@ai-sdk/azure':
        return 'openai';
      case '@ai-sdk/anthropic':
        return 'anthropic';
      case '@ai-sdk/google':
        return 'google';
      case '@ai-sdk/openai-compatible':
        return 'openaiCompatible';
      default:
        return undefined;
    }
  }

  /**
   * 转换工具 schema（参考 opencode）
   * 关键：opencode 在这里进行模型特定的转换（例如 Google/Gemini 的 integer enum 转换）
   * 这确保了 schema 符合特定模型的要求
   */
  export function schema(model: ModelConfig, schema: any): any {
    // 参考 opencode：对于 Google/Gemini，需要将 integer enum 转换为 string enum
    if (model.providerID === 'google' || model.api.id.includes('gemini')) {
      const sanitizeGemini = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') {
          return obj;
        }

        if (Array.isArray(obj)) {
          return obj.map(sanitizeGemini);
        }

        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (key === 'enum' && Array.isArray(value)) {
            // Convert all enum values to strings
            result[key] = value.map((v) => String(v));
            // If we have integer type with enum, change type to string
            if (result.type === 'integer' || result.type === 'number') {
              result.type = 'string';
            }
          } else if (typeof value === 'object' && value !== null) {
            result[key] = sanitizeGemini(value);
          } else {
            result[key] = value;
          }
        }

        // Filter required array to only include fields that exist in properties
        if (result.type === 'object' && result.properties && Array.isArray(result.required)) {
          result.required = result.required.filter((field: any) => field in result.properties);
        }

        if (result.type === 'array' && result.items == null) {
          result.items = {};
        }

        return result;
      };

      schema = sanitizeGemini(schema);
    }

    // 对于其他模型，直接返回 schema
    return schema;
  }

  /**
   * 计算最大输出 token 数
   * 参考 opencode 的实现
   */
  export function maxOutputTokens(
    npm: string,
    options: Record<string, any>,
    limit?: number,
    max?: number
  ): number | undefined {
    const modelCap = limit || max || 32_000;
    const standardLimit = max ? Math.min(modelCap, max) : modelCap;

    // Handle thinking mode for @ai-sdk/anthropic, @ai-sdk/google-vertex/anthropic (budgetTokens)
    // and @ai-sdk/openai-compatible with Claude (budget_tokens)
    if (
      npm === '@ai-sdk/anthropic' ||
      npm === '@ai-sdk/google-vertex/anthropic' ||
      npm === '@ai-sdk/openai-compatible'
    ) {
      const thinking = options?.['thinking'];
      // Support both camelCase (for @ai-sdk/anthropic) and snake_case (for openai-compatible)
      const budgetTokens =
        typeof thinking?.['budgetTokens'] === 'number'
          ? thinking['budgetTokens']
          : typeof thinking?.['budget_tokens'] === 'number'
            ? thinking['budget_tokens']
            : 0;
      const enabled = thinking?.['type'] === 'enabled';
      if (enabled && budgetTokens > 0) {
        // Return text tokens so that text + thinking <= model cap, preferring 32k text when possible.
        if (budgetTokens + standardLimit <= modelCap) {
          return standardLimit;
        }
        return modelCap - budgetTokens;
      }
    }

    return standardLimit;
  }

  /**
   * 过滤不支持的内容类型
   */
  function unsupportedParts(
    msgs: ModelMessage[] | ChatMessage[],
    model: ModelConfig
  ): ModelMessage[] | ChatMessage[] {
    return msgs.map((msg) => {
      // 只处理 ChatMessage 类型的 user 消息
      if ('role' in msg && msg.role === 'user' && 'context' in msg && msg.context) {
        const ctx = (msg as any).context;

        // 检查多模态支持
        if (ctx.selection) {
          // 如果模型不支持多模态，将图片等内容转换为文本描述
          // 这里可以根据需要扩展
        }
      }

      return msg;
    });
  }

  /**
   * 标准化消息格式（参考 opencode 的实现）
   */
  function normalizeMessages(
    msgs: ModelMessage[] | ChatMessage[],
    model: ModelConfig,
    options: Record<string, unknown>
  ): ModelMessage[] | ChatMessage[] {
    // 参考 opencode：只对特定模型进行特殊处理
    // Anthropic rejects messages with empty content - filter out empty string messages
    // and remove empty text/reasoning parts from array content
    if (model.api.npm === '@ai-sdk/anthropic') {
      msgs = msgs
        .map((msg) => {
          if (typeof msg.content === 'string') {
            if (msg.content === '') return undefined;
            return msg;
          }
          if (!Array.isArray(msg.content)) return msg;
          const filtered = (msg.content as any[]).filter((part: any) => {
            if (part.type === 'text' || part.type === 'reasoning') {
              return part.text !== '';
            }
            return true;
          });
          if (filtered.length === 0) return undefined;
          return { ...msg, content: filtered };
        })
        .filter((msg): msg is ModelMessage | ChatMessage => msg !== undefined);
    }
    
    // 对于 zhipuai/openai-compatible，也需要过滤空内容（类似 Anthropic）
    // 关键问题：zhipuai/openai-compatible API 要求 system 消息的 content 必须是字符串
    // 即使 system 消息已经在 message() 函数中合并了，这里也要再次确保格式正确（防御性处理）
    // 参考 opencode：opencode 不对 zhipuai 进行特殊处理，但我们需要确保格式正确
    if (model.providerID === 'zhipuai' || model.api.npm === '@ai-sdk/openai-compatible') {
      msgs = msgs
        .map((msg) => {
          // system 消息：确保 content 是字符串（必须）
          // 注意：system 消息应该在 message() 函数中已经被合并并转换为字符串
          // 但如果这里仍然发现数组格式，说明前面的处理有问题，需要修复
          if (msg.role === 'system') {
            if (typeof msg.content === 'string') {
              // 已经是字符串，检查是否为空
              if (msg.content.trim() === '') return undefined;
              return msg;
            }
            // 如果 system 消息的 content 是数组，转换为字符串（防御性处理）
            // 这种情况不应该发生，因为已经在 message() 函数中处理过了
            // 但如果发生了，这里会修复它
            if (Array.isArray(msg.content)) {
              const textParts = (msg.content as any[])
                .filter((part: any) => part.type === 'text' && typeof part.text === 'string')
                .map((part: any) => part.text)
                .join('');
              if (textParts.trim() === '') return undefined;
              // 强制转换为字符串
              return { ...msg, content: textParts } as ModelMessage;
            }
            // 未知格式（null, undefined 等），跳过
            return undefined;
          }
          // tool 消息：确保 content 是 ToolContent 格式（数组，包含 tool-result 或 tool-approval-response）
          if (msg.role === 'tool') {
            if (!Array.isArray(msg.content)) {
              // tool 消息的 content 必须是数组
              return undefined;
            }
            
            // 验证并转换 tool 消息的内容
            const filtered = (msg.content as any[]).filter((part: any) => {
              // tool-result 部分：验证完整结构
              if (part.type === 'tool-result') {
                // 确保有必需的字段
                if (!part.toolCallId || !part.toolName || !part.output) {
                  return false;
                }
                // 验证 output 结构
                if (part.output.type === 'text') {
                  return typeof part.output.value === 'string' && part.output.value !== '';
                }
                if (part.output.type === 'json') {
                  return part.output.value !== undefined && part.output.value !== null;
                }
                // 其他 output 类型（error-text, error-json, execution-denied, content）
                return true;
              }
              
              // tool-approval-response 部分
              if (part.type === 'tool-approval-response') {
                return part.approvalId !== undefined && typeof part.approved === 'boolean';
              }
              
              // 如果类型不是 tool-result 或 tool-approval-response，过滤掉
              // 这包括错误的格式，如 { type: 'text', text: ... }
              return false;
            });
            
            if (filtered.length === 0) return undefined;
            return { ...msg, content: filtered } as ModelMessage;
          }
          
          // user/assistant 消息：处理字符串或数组内容
          if (typeof msg.content === 'string') {
            if (msg.content.trim() === '') return undefined;
            return msg;
          }
          if (!Array.isArray(msg.content)) return msg;
          
          // 过滤空内容部分
          const filtered = (msg.content as any[]).filter((part: any) => {
            // text 和 reasoning 部分：确保 text 不为空
            if (part.type === 'text' || part.type === 'reasoning') {
              return part.text !== '' && part.text !== undefined && part.text !== null;
            }
            // tool-call 和 tool-result 部分：确保格式正确
            if (part.type === 'tool-call') {
              return part.toolCallId !== undefined && part.toolName !== undefined;
            }
            if (part.type === 'tool-result') {
              return part.toolCallId !== undefined && part.toolName !== undefined;
            }
            return true;
          });
          
          if (filtered.length === 0) return undefined;
          return { ...msg, content: filtered };
        })
        .filter((msg): msg is ModelMessage | ChatMessage => msg !== undefined);
    }

    return msgs;
  }
}
