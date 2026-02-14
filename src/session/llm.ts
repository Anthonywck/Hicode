/**
 * LLM 流式处理封装
 * 封装 AI SDK 的 streamText，提供工具参数转换和流式响应处理
 * 优化了工具参数序列化逻辑，确保不包含 Zod 内部结构
 */

import {
  streamText,
  type ModelMessage,
  type StreamTextResult,
  type Tool,
  type ToolSet,
  tool,
  jsonSchema,
  wrapLanguageModel,
} from 'ai';
import { z } from 'zod';
import type { ModelConfig, ProviderInfo } from '../api/types';
import type { UserMessage } from './message';
import type { AgentConfig } from '../agent/types';
import type { Tool as ToolInfo } from '../tool/tool';
import { ToolRegistry } from '../tool/registry';
import { createLogger } from '../utils/logger';
import { ProviderTransform } from '../api/provider/transform';
import { zodToJsonSchemaClean, validateFunctionSchema } from '../utils/zod-schema-utils';
import { SystemPrompt } from './system';

const log = createLogger('session.llm');

/**
 * LLM 流式输入参数
 */
export interface StreamInput {
  /** 用户消息 */
  user: UserMessage;
  /** 模型配置 */
  model: ModelConfig;
  /** 语言模型实例 */
  languageModel: any;
  /** 会话ID */
  sessionID: string;
  /** Agent配置 */
  agent: AgentConfig;
  /** 工具注册表 */
  toolRegistry?: ToolRegistry;
  /** 预解析的工具（可选） */
  tools?: Record<string, Tool>;
  /** 系统提示词（可选） */
  system?: string[];
  /** 消息历史 */
  messages: ModelMessage[];
  /** 中止信号 */
  abort?: AbortSignal;
  /** 重试次数 */
  retries?: number;
  /** Provider信息 */
  provider: ProviderInfo;
}

/**
 * LLM 流式输出
 */
export type StreamOutput = StreamTextResult<ToolSet, any>;

const OUTPUT_TOKEN_MAX = 32_000;

/**
 * 流式调用 LLM
 */
export async function stream(input: StreamInput): Promise<StreamOutput> {
  
  log.info('stream', {
    modelID: input.model.modelID,
    providerID: input.model.providerID,
    sessionID: input.sessionID,
    agent: input.agent.name,
  });

  // 构建系统提示词
  const system = [];
  const providerPrompt = input.agent.prompt 
    ? [input.agent.prompt] 
    : await SystemPrompt.provider(input.model);
  
  // 构建 system 数组：先添加 provider prompt，然后添加环境信息
  const systemParts: string[] = [
    // 使用 agent prompt，否则使用 provider prompt（参考 opencode）
    ...(Array.isArray(providerPrompt) ? providerPrompt : [providerPrompt]),
    // 任何自定义提示词
    ...(input.system || []),
    // 用户消息中的系统提示词
    ...(input.user.system ? [input.user.system] : []),
  ].filter((x) => x);
  
  // 将所有部分 join 成一个字符串
  if (systemParts.length > 0) {
    system.push(systemParts.join('\n'));
  }
  
  // 添加环境信息（单独添加，参考 opencode）
  const environmentInfo = await SystemPrompt.environment(input.model);
  if (environmentInfo) {
    system.push(...(Array.isArray(environmentInfo) ? environmentInfo : [environmentInfo]));
  }

  // 构建选项（参考opencode的实现）
  const baseOptions = ProviderTransform.options({
    model: input.model,
    sessionID: input.sessionID,
    providerOptions: input.provider.options || {},
  });
  const options: Record<string, any> = {
    ...baseOptions,
    ...(input.model.options || {}),
    ...(input.agent.options || {}),
  };

  // 构建参数（使用ProviderTransform的默认值）
  const temperature = input.model.capabilities.temperature
    ? (input.agent.temperature ?? ProviderTransform.temperature(input.model) ?? 0.6)
    : undefined;
  const topP = input.agent.topP ?? 0.9;

  // 计算最大输出token数（使用ProviderTransform）
  const maxOutputTokens = ProviderTransform.maxOutputTokens(
    input.model.api.npm,
    options,
    input.model.limit.output,
    OUTPUT_TOKEN_MAX
  );

  // 解析工具：如果提供了预解析的工具，直接使用；否则从 toolRegistry 解析
  // 这里使用改进的工具解析逻辑，确保工具参数不包含 Zod 内部结构
  const tools = input.tools || (await resolveTools(input));

  // LiteLLM and some Anthropic proxies require the tools parameter to be present
  // when message history contains tool calls, even if no tools are being used.
  // Add a dummy tool that is never called to satisfy this validation.
  // This is enabled for:
  // 1. Providers with "litellm" in their ID or API ID (auto-detected)
  // 2. Providers with explicit "litellmProxy: true" option (opt-in for custom gateways)
  const isLiteLLMProxy =
    input.provider.options?.['litellmProxy'] === true ||
    input.model.providerID.toLowerCase().includes('litellm') ||
    input.model.api.id.toLowerCase().includes('litellm');

  if (isLiteLLMProxy && Object.keys(tools).length === 0 && hasToolCalls(input.messages)) {
    tools['_noop'] = tool({
      description:
        'Placeholder for LiteLLM/Anthropic proxy compatibility - required when message history contains tool calls but no active tools are needed',
      inputSchema: jsonSchema({ type: 'object', properties: {} }),
      execute: async () => ({ output: '', title: '', metadata: {} }),
    });
  }

  // 准备消息和配置（参考 opencode 的实现）
  // opencode 直接传递 messages 数组，在 middleware 中转换
  const providerOptions = ProviderTransform.providerOptions(input.model, options);
  
  // 构建最终的消息数组（用于日志打印）
  const finalMessages = (() => {
    const systemMessages: ModelMessage[] = system
      .filter((x) => typeof x === 'string' && x.trim() !== '')
      .map((x): ModelMessage => ({
        role: 'system',
        content: typeof x === 'string' ? x : String(x),
      }));
    
    const filteredMessages = input.messages.filter((msg) => {
      if (msg.role === 'system') {
        return false;
      }
      return true;
    });
    
    return [
      ...systemMessages,
      ...filteredMessages,
    ];
  })();
  
  // ========== 打印详细的调用信息 ==========
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀 [HICODE] Agent 调用模型 - 详细信息');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📋 Session ID: ${input.sessionID}`);
  console.log(`🤖 Agent: ${input.agent.name}`);
  console.log(`🔧 Model: ${input.model.providerID}/${input.model.modelID}`);
  console.log(`📊 Model API: ${input.model.api.npm}`);
  console.log('');
  
  // 打印模型参数
  console.log('⚙️  模型参数:');
  console.log(`   - Temperature: ${temperature ?? 'N/A'}`);
  console.log(`   - TopP: ${topP}`);
  console.log(`   - MaxOutputTokens: ${maxOutputTokens ?? 'N/A'}`);
  console.log(`   - MaxRetries: ${input.retries ?? 0}`);
  console.log('');
  
  // 打印系统提示词
  console.log('📝 System Prompt:');
  if (system.length === 0) {
    console.log('   (无系统提示词)');
  } else {
    system.forEach((sysPrompt, index) => {
      const promptStr = typeof sysPrompt === 'string' ? sysPrompt : String(sysPrompt);
      const preview = promptStr.length > 500 ? promptStr.substring(0, 500) + '...' : promptStr;
      console.log(`   [System ${index + 1}] (${promptStr.length} 字符)`);
      console.log(`   ${preview.split('\n').map(line => `   ${line}`).join('\n')}`);
      if (promptStr.length > 500) {
        console.log(`   ... (省略 ${promptStr.length - 500} 字符)`);
      }
    });
  }
  console.log('');
  
  // 打印消息历史
  console.log(`💬 消息历史 (${finalMessages.length} 条):`);
  finalMessages.forEach((msg, index) => {
    const role = msg.role.toUpperCase();
    let contentPreview = '';
    
    if (typeof msg.content === 'string') {
      contentPreview = msg.content.length > 200 
        ? msg.content.substring(0, 200) + '...' 
        : msg.content;
    } else if (Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text || '')
        .join(' ');
      contentPreview = textParts.length > 200 
        ? textParts.substring(0, 200) + '...' 
        : textParts;
      
      // 检查是否有工具调用
      const toolCalls = msg.content.filter((part: any) => part.type === 'tool-call');
      const toolResults = msg.content.filter((part: any) => part.type === 'tool-result');
      if (toolCalls.length > 0 || toolResults.length > 0) {
        contentPreview += ` [包含 ${toolCalls.length} 个工具调用, ${toolResults.length} 个工具结果]`;
      }
    } else {
      contentPreview = JSON.stringify(msg.content).substring(0, 200);
    }
    
    const contentLength = typeof msg.content === 'string' 
      ? msg.content.length 
      : Array.isArray(msg.content)
        ? msg.content.reduce((sum: number, part: any) => {
            if (part.type === 'text' && part.text) return sum + part.text.length;
            return sum;
          }, 0)
        : JSON.stringify(msg.content).length;
    
    console.log(`   [${index + 1}] ${role} (${contentLength} 字符)`);
    console.log(`       ${contentPreview.split('\n').map(line => `       ${line}`).join('\n')}`);
  });
  console.log('');
  
  // 打印工具列表
  const toolNames = Object.keys(tools).filter((x) => x !== 'invalid' && x !== '_noop');
  console.log(`🛠️  可用工具 (${toolNames.length} 个):`);
  if (toolNames.length === 0) {
    console.log('   (无可用工具)');
  } else {
    toolNames.forEach((toolName, index) => {
      const toolInfo = tools[toolName];
      const description = toolInfo.description || '(无描述)';
      const descPreview = description.length > 100 
        ? description.substring(0, 100) + '...' 
        : description;
      console.log(`   [${index + 1}] ${toolName}`);
      console.log(`       ${descPreview}`);
    });
  }
  console.log('');
  
  // 打印 Provider Options（摘要）
  console.log('🔧 Provider Options:');
  if (!providerOptions || typeof providerOptions !== 'object') {
    console.log('   (无额外选项)');
  } else {
    const optionsKeys = Object.keys(providerOptions);
    if (optionsKeys.length === 0) {
      console.log('   (无额外选项)');
    } else {
      // 只打印前几个选项，避免输出过长
      const previewKeys = optionsKeys.slice(0, 5);
      previewKeys.forEach(key => {
        const value = providerOptions[key];
        const valueStr = typeof value === 'object' 
          ? JSON.stringify(value).substring(0, 100) 
          : String(value);
        console.log(`   - ${key}: ${valueStr}`);
      });
      if (optionsKeys.length > 5) {
        console.log(`   ... (还有 ${optionsKeys.length - 5} 个选项)`);
      }
    }
  }
  console.log('');
  
  // 打印 Headers（摘要）
  const headers = input.model.headers || {};
  const headerKeys = Object.keys(headers);
  if (headerKeys.length > 0) {
    console.log('📨 Headers:');
    headerKeys.forEach(key => {
      // 隐藏敏感信息
      const value = key.toLowerCase().includes('key') || key.toLowerCase().includes('token')
        ? '***HIDDEN***'
        : headers[key];
      console.log(`   - ${key}: ${value}`);
    });
    console.log('');
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n');
  // ========== 日志打印结束 ==========
  
  // 参考 opencode：直接传递 messages，使用 wrapLanguageModel 和 middleware 转换
  const result = streamText({
    onError(error: unknown) {
      // 记录详细的错误信息，包括错误代码和类型
      const err = error as any;
      
      // 对于 zhipuai，添加详细的错误日志，包括请求参数
      const isZhipuai = input.model.providerID === 'zhipuai' || input.model.api.npm === '@ai-sdk/openai-compatible';
      if (isZhipuai) {
        console.error('[ERROR] ========== ZhipuAI API Error ==========');
        console.error('[ERROR] Error name:', err?.name);
        console.error('[ERROR] Error message:', err?.message);
        console.error('[ERROR] Status code:', err?.statusCode);
        console.error('[ERROR] Request URL:', err?.url);
        
        // 打印请求体中的关键信息
        if (err?.requestBodyValues) {
          console.error('[ERROR] Request body (model):', err.requestBodyValues.model);
          console.error('[ERROR] Request body (temperature):', err.requestBodyValues.temperature);
          console.error('[ERROR] Request body (top_p):', err.requestBodyValues.top_p);
          console.error('[ERROR] Request body (max_tokens):', err.requestBodyValues.max_tokens);
        }
        console.error('[ERROR] Stack:', err?.stack);
        console.error('[ERROR] ===================================================');
      }
      
      log.error('stream error', {
        error,
        name: err?.name,
        message: err?.message,
        code: err?.code,
        statusCode: err?.statusCode,
        stack: err?.stack,
      });
    },
    async experimental_repairToolCall(failed) {
      const lower = failed.toolCall.toolName.toLowerCase();
      if (lower !== failed.toolCall.toolName && tools[lower]) {
        log.info('repairing tool call', {
          tool: failed.toolCall.toolName,
          repaired: lower,
        });
        return {
          ...failed.toolCall,
          toolName: lower,
        };
      }
      return {
        ...failed.toolCall,
        input: JSON.stringify({
          tool: failed.toolCall.toolName,
          error: failed.error.message,
        }),
        toolName: 'invalid',
      };
    },
    temperature,
    topP,
    providerOptions: providerOptions,
    activeTools: Object.keys(tools).filter((x) => x !== 'invalid'),
    tools,
    maxOutputTokens,
    abortSignal: input.abort,
    headers: {
      ...(input.model.headers || {}),
    },
    maxRetries: input.retries ?? 0,
    // 参考 opencode：直接传递 messages，使用 wrapLanguageModel 和 middleware 转换
    // 确保所有 system 消息的 content 都是字符串
    messages: (() => {
      const systemMessages: ModelMessage[] = system
        .filter((x) => typeof x === 'string' && x.trim() !== '')
        .map((x): ModelMessage => ({
          role: 'system',
          content: typeof x === 'string' ? x : String(x),
        }));
      
      // 验证 input.messages 中没有意外的 system 消息（应该由 system 数组统一管理）
      const filteredMessages = input.messages.filter((msg) => {
        if (msg.role === 'system') {
          log.warn('发现意外的 system 消息，将被忽略', {
            sessionID: input.sessionID,
            content: typeof msg.content === 'string' 
              ? msg.content.substring(0, 100) 
              : JSON.stringify(msg.content).substring(0, 100),
          });
          return false;
        }
        return true;
      });
      
      return [
        ...systemMessages,
        ...filteredMessages,
      ];
    })(),
    // 参考 opencode：使用 wrapLanguageModel 和 middleware 转换消息
    // 关键点：middleware 中的 transformParams 会在运行时转换消息格式
    // 对于 zhipuai，ProviderTransform.message 会：
    // 1. 合并多个 system 消息为一个
    // 2. 确保 system 消息的 content 是字符串（不是数组）
    // 3. 过滤空内容
    model: wrapLanguageModel({
      model: input.languageModel,
      middleware: [
        {
          specificationVersion: 'v3' as const,
          async transformParams(args) {
            if (args.type === 'stream') {
              // 转换消息格式：合并 system 消息，确保格式正确
              // 注意：AI SDK 的 middleware 使用 prompt 参数（内部将 messages 转换为 prompt）
              // prompt 参数在 middleware 中可用，但类型定义可能不完整
              if (args.params.prompt) {
                // @ts-expect-error - Type mismatch between prompt format and ModelMessage[]
                // ProviderTransform.message 返回 ModelMessage[]，但 prompt 可能是其他格式
                args.params.prompt = ProviderTransform.message(args.params.prompt, input.model, options);
              }
              
              // 注意：工具参数清理已移至 resolveTools 函数中
              // 这里不再需要清理，因为 resolveTools 已确保所有工具参数不包含 Zod 内部结构
            }
            return args.params;
          },
        },
      ],
    }),
    experimental_telemetry: {
      isEnabled: false,
      metadata: {
        sessionId: input.sessionID,
      },
    },
  });
  
  return result;
}

/**
 * 解析工具
 * 将工具注册表中的工具转换为 AI SDK 的 Tool 格式
 * 使用改进的 Zod schema 序列化逻辑，确保不包含任何内部结构
 */
async function resolveTools(
  input: Pick<StreamInput, 'toolRegistry' | 'agent' | 'user' | 'model'>
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};

  // 如果没有工具注册表，返回空对象
  if (!input.toolRegistry) {
    return tools;
  }

  // 获取 MCP 工具（如果可用）
  try {
    const { getMcpTools } = await import('../mcp/tools');
    const mcpTools = await getMcpTools();
    Object.assign(tools, mcpTools);
    log.debug('MCP 工具已加载', { count: Object.keys(mcpTools).length });
  } catch (error) {
    log.debug('无法加载 MCP 工具', { error: error instanceof Error ? error.message : String(error) });
  }

  // 获取所有工具
  const toolInfos = input.toolRegistry.all();

  // 过滤被禁用的工具（暂时不过滤，等待权限系统完善）
  const enabledTools = toolInfos;

  // 转换每个工具
  for (const toolInfo of enabledTools) {
    try {
      // 初始化工具（获取参数 schema 和描述）
      const initialized = await toolInfo.init({
        agent: input.agent,
      });

      // 转换 Zod schema 为 JSON schema
      // 参考 opencode：使用 z.toJSONSchema()，然后通过 ProviderTransform.schema() 进行模型特定转换
      // 关键：确保传递给 jsonSchema() 的是纯 JSON 对象，不包含任何 Zod 内部结构
      let jsonSchemaObj: any;
      try {
        // 参考 opencode：使用 z.toJSONSchema()（zod 3.23+）
        if (typeof (z as any).toJSONSchema === 'function') {
          jsonSchemaObj = (z as any).toJSONSchema(initialized.parameters);
        } else {
          // 回退到 zod-to-json-schema 包
          // 使用改进的清理函数确保移除所有 Zod 内部结构
          jsonSchemaObj = zodToJsonSchemaClean(initialized.parameters, {
            removeRefs: true,
            removeTitles: false,
          });
        }
        
        // 参考 opencode：通过 ProviderTransform.schema() 进行模型特定的转换
        // 这可能会修改 schema（例如 Google/Gemini 的 integer enum 转换）
        jsonSchemaObj = ProviderTransform.schema(input.model, jsonSchemaObj);
        
        // 验证 JSON Schema 格式是否符合 Function Calling 要求
        const validation = validateFunctionSchema(jsonSchemaObj);
        if (!validation.valid) {
          log.warn(`工具 ${toolInfo.id} 的 JSON Schema 验证失败`, { 
            toolId: toolInfo.id,
            errors: validation.errors,
          });
          // 对于验证失败的工具，我们仍然尝试使用，但记录警告
        }
        
        // 最后再次确保是纯 JSON 对象（深度序列化）
        jsonSchemaObj = JSON.parse(JSON.stringify(jsonSchemaObj));
      } catch (error) {
        log.error('Failed to convert Zod schema to JSON schema', {
          toolId: toolInfo.id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      
      // 转换为 AI SDK Tool（参考 opencode）
      tools[toolInfo.id] = tool({
        id: toolInfo.id as any,
        description: initialized.description,
        inputSchema: jsonSchema(jsonSchemaObj) as any,
        execute: async (args: any) => {
          // 这里需要实际的工具执行上下文
          // 暂时返回占位符，实际执行会在 processor 中处理
          // 注意：AI SDK 的 tool execute 函数应该返回工具结果对象
          return { output: '', title: '', metadata: {} };
        },
      });
      
      log.debug(`工具 ${toolInfo.id} 已成功解析`, { 
        toolId: toolInfo.id,
        schemaType: jsonSchemaObj.type,
        propertiesCount: jsonSchemaObj.properties ? Object.keys(jsonSchemaObj.properties).length : 0,
      });
    } catch (error) {
      log.error('Failed to resolve tool', {
        toolId: toolInfo.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // 继续处理其他工具，不中断整个流程
    }
  }

  return tools;
}

/**
 * Check if messages contain any tool-call content
 * Used to determine if a dummy tool should be added for LiteLLM proxy compatibility
 */
export function hasToolCalls(messages: ModelMessage[]): boolean {
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part.type === 'tool-call' || part.type === 'tool-result') return true;
    }
  }
  return false;
}