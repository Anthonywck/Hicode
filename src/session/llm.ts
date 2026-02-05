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
export interface StreamOutput {
  stream: StreamTextResult<any, any>;
}

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

  // 准备消息和配置（参考 opencode 的实现）
  // opencode 直接传递 messages 数组，在 middleware 中转换
  const providerOptions = ProviderTransform.providerOptions(input.model, options);
  
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
    messages: [
      ...system.map(
        (x): ModelMessage => ({
          role: 'system',
          content: x,
        }),
      ),
      ...input.messages,
    ],
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
              // @ts-expect-error
              // 转换消息格式：合并 system 消息，确保格式正确
              // 注意：这里转换后的消息应该符合 ModelMessage[] schema
              args.params.prompt = ProviderTransform.message(args.params.prompt, input.model, options);
              
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
  
  return { stream: result };
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