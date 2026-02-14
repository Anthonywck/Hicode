/**
 * Prompt 函数
 * 处理用户输入，调用 LLM，并管理工具执行
 * 参考 opencode 的实现，但保持 hicode 的编码风格
 */

import { z } from 'zod';
import { Session, SessionInfo } from './sessionClass';
import { SessionFactory, getSessionFactory } from './factory';
import { stream as streamLLM, type StreamInput } from './llm';
import { SessionProcessor } from './processor';
import { MessageRole, generateMessageID } from './message';
import { MessageWithParts, UserMessage } from './message-v2';
import { Part } from './message-v2';
import { VSCodeSessionStorage } from './storage';
import { ProviderManager } from '../api/provider/providerManager';
import { Agent } from '../agent/agent';
import { ToolRegistry } from '../tool/registry';
import { createLogger } from '../utils/logger';
import * as vscode from 'vscode';
import { getExtensionContext } from '../extension';
import type { ModelConfig, ProviderInfo } from '../api/types';
import type { AgentConfig } from '../agent/types';
import type { ModelMessage, Tool } from 'ai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tool, jsonSchema } from 'ai';
import { ProviderTransform } from '../api/provider/transform';

const log = createLogger('session.prompt');

/**
 * 加载提示文件内容
 * 参考 opencode 的实现方式，使用文件系统读取 .txt 文件
 * 使用 VS Code 扩展上下文来获取正确的文件路径
 */
async function loadPromptFile(filename: string): Promise<string> {
  try {
    // 获取扩展上下文（如果可用）
    const extensionPath = vscode.extensions.getExtension('hicode.hicode-ai-integration')?.extensionPath;
    
    if (extensionPath) {
      // 在生产环境中，从扩展安装目录读取
      const filePath = join(extensionPath, 'dist', 'session', 'prompt', filename);
      try {
        const content = readFileSync(filePath, 'utf-8');
        log.debug('成功加载提示文件（扩展路径）', { filename, path: filePath });
        return content;
      } catch {
        // 继续尝试其他路径
      }
    }
    
    // 在开发环境中，尝试从源目录读取
    const currentDir = __dirname;
    const possiblePaths = [
      join(currentDir, 'prompt', filename), // dist/session/prompt/plan.txt
      join(currentDir, '..', 'session', 'prompt', filename), // dist/session/../session/prompt/plan.txt
      join(currentDir, '..', '..', 'src', 'session', 'prompt', filename), // dist/session/../../src/session/prompt/plan.txt
    ];
    
    for (const filePath of possiblePaths) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        log.debug('成功加载提示文件', { filename, path: filePath });
        return content;
      } catch {
        // 继续尝试下一个路径
        continue;
      }
    }
    
    // 如果所有路径都失败，记录警告并返回空字符串
    log.warn('无法加载提示文件，使用空内容', { filename, extensionPath, triedPaths: possiblePaths });
    return '';
  } catch (error) {
    log.error('加载提示文件时发生错误', { filename, error });
    return '';
  }
}

// 加载提示文件（参考 opencode 的实现）
// 注意：这些是异步加载的，但在模块初始化时我们需要同步值
// 所以我们需要在首次使用时加载，或者使用同步方式
let PROMPT_PLAN_CACHE: string | null = null;
let BUILD_SWITCH_CACHE: string | null = null;
let MAX_STEPS_CACHE: string | null = null;

function getPromptPlan(): string {
  if (PROMPT_PLAN_CACHE === null) {
    PROMPT_PLAN_CACHE = loadPromptFileSync('plan.txt');
  }
  return PROMPT_PLAN_CACHE;
}

function getBuildSwitch(): string {
  if (BUILD_SWITCH_CACHE === null) {
    BUILD_SWITCH_CACHE = loadPromptFileSync('build-switch.txt');
  }
  return BUILD_SWITCH_CACHE;
}

function getMaxSteps(): string {
  if (MAX_STEPS_CACHE === null) {
    MAX_STEPS_CACHE = loadPromptFileSync('max-steps.txt');
  }
  return MAX_STEPS_CACHE;
}

/**
 * 同步加载提示文件
 */
function loadPromptFileSync(filename: string): string {
  try {
    // 获取扩展上下文（如果可用）
    const extensionPath = vscode.extensions.getExtension('hicode.hicode-ai-integration')?.extensionPath;
    
    if (extensionPath) {
      // 在生产环境中，从扩展安装目录读取
      const filePath = join(extensionPath, 'dist', 'session', 'prompt', filename);
      try {
        const content = readFileSync(filePath, 'utf-8');
        log.debug('成功加载提示文件（扩展路径）', { filename, path: filePath });
        return content;
      } catch {
        // 继续尝试其他路径
      }
    }
    
    // 在开发环境中，尝试从源目录读取
    const currentDir = __dirname;
    const possiblePaths = [
      join(currentDir, 'prompt', filename), // dist/session/prompt/plan.txt
      join(currentDir, '..', 'session', 'prompt', filename), // dist/session/../session/prompt/plan.txt
      join(currentDir, '..', '..', 'src', 'session', 'prompt', filename), // dist/session/../../src/session/prompt/plan.txt
    ];
    
    for (const filePath of possiblePaths) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        log.debug('成功加载提示文件', { filename, path: filePath });
        return content;
      } catch {
        // 继续尝试下一个路径
        continue;
      }
    }
    
    // 如果所有路径都失败，记录警告并返回空字符串
    log.warn('无法加载提示文件，使用空内容', { filename, extensionPath, triedPaths: possiblePaths });
    return '';
  } catch (error) {
    log.error('加载提示文件时发生错误', { filename, error });
    return '';
  }
}

// 导出常量（延迟加载）
const PROMPT_PLAN = getPromptPlan();
const BUILD_SWITCH = getBuildSwitch();
const MAX_STEPS = getMaxSteps();

/**
 * Prompt 输入参数
 */
export const PromptInput = z.object({
  sessionID: z.string(),
  messageID: z.string().optional(),
  model: z.object({
    providerID: z.string(),
    modelID: z.string(),
  }).optional(),
  agent: z.string().optional(),
  parts: z.array(z.discriminatedUnion('type', [
    z.object({
      type: z.literal('text'),
      text: z.string(),
    }),
    z.object({
      type: z.literal('file'),
      url: z.string(),
      filename: z.string().optional(),
    }),
  ])),
  system: z.string().optional(),
  onTextChunk: z.function().args(z.string()).returns(z.void()).optional(),
  onToolCallUpdate: z.function().args(z.any()).returns(z.void()).optional(),
});

export type PromptInput = z.infer<typeof PromptInput>;

/**
 * 主 prompt 函数
 * 处理用户输入，创建用户消息，然后调用主循环
 * 参考 opencode 的实现
 */
export async function prompt(input: PromptInput): Promise<MessageWithParts> {
  log.info('prompt 开始', { sessionID: input.sessionID });

  // 获取扩展上下文
  const context = await getExtensionContext();
  const factory = getSessionFactory(context);
  const storage = new VSCodeSessionStorage(context);

  // 获取会话
  const session = await factory.getOrCreateSession(input.sessionID);

  // 获取模型配置（通过 ConfigManager 获取）
  const { getConfigManager, getAPIClient } = await import('../extension');
  const configManager = await getConfigManager();
  const apiClient = await getAPIClient();
  
  let modelConfig: ModelConfig;
  let providerInfo: ProviderInfo;
  
  if (input.model) {
    // 使用指定的模型
    modelConfig = await configManager.models.getModel(input.model.providerID, input.model.modelID);
    providerInfo = await configManager.models.getProvider(input.model.providerID);
  } else {
    // 使用当前模型
    const currentModelId = apiClient.getCurrentModel();
    if (!currentModelId) {
      throw new Error('未选择模型，请先选择模型');
    }
    
    // 解析模型ID (格式: providerID/modelID)
    const [providerID, modelID] = currentModelId.includes('/')
      ? currentModelId.split('/', 2)
      : ['openai', currentModelId];
    
    modelConfig = await configManager.models.getModel(providerID, modelID);
    providerInfo = await configManager.models.getProvider(providerID);
  }

  // 获取 Agent 配置
  const agentName = input.agent || Agent.defaultAgent().name;
  const agentConfig = Agent.get(agentName);
  if (!agentConfig) {
    throw new Error(`Agent ${agentName} 不存在`);
  }

  // 创建用户消息
  const userMessage = await session.createUserMessage({
    agent: agentName,
    model: {
      providerID: modelConfig.providerID,
      modelID: modelConfig.modelID,
    },
    system: input.system,
    parts: input.parts,
  });

  // 如果设置了 noReply，直接返回用户消息
  // 注意：当前 PromptInput 没有 noReply 字段，但保留此逻辑以便将来扩展
  // if (input.noReply === true) {
  //   return userMessage;
  // }

  // 调用主循环
  return await loop({
    sessionID: input.sessionID,
    session,
    modelConfig,
    providerInfo,
    agentConfig,
    onTextChunk: input.onTextChunk,
    onToolCallUpdate: input.onToolCallUpdate,
    currentUserMessage: userMessage, // 传递刚创建的用户消息
  });
}

/**
 * 主循环输入参数
 */
interface LoopInput {
  sessionID: string;
  session: Session;
  modelConfig: ModelConfig;
  providerInfo: ProviderInfo;
  agentConfig: AgentConfig;
  onTextChunk?: (chunk: string) => void;
  onToolCallUpdate?: (update: any) => void;
  /** 当前用户消息（如果刚创建，用于避免存储延迟问题） */
  currentUserMessage?: UserMessage;
}

/**
 * 主循环函数
 * 处理工具调用和响应的主循环
 * 参考 opencode 的实现
 */
async function loop(input: LoopInput): Promise<MessageWithParts> {
  log.info('loop 开始', { sessionID: input.sessionID });

  // 获取语言模型实例
  const providerManager = ProviderManager.getInstance();
  const languageModel = await providerManager.getLanguageModel(input.modelConfig, input.providerInfo);

  // 获取存储
  const context = await getExtensionContext();
  const storage = new VSCodeSessionStorage(context);

  // 获取工具注册表
  const { getToolRegistry } = await import('../tool/registry');
  const toolRegistry = getToolRegistry();

  let step = 0;
  const maxSteps = input.agentConfig.steps ?? Infinity;

  while (true) {
    step++;
    log.info('loop 步骤', { step, sessionID: input.sessionID });

    // 获取消息流
    const allMessages: MessageWithParts[] = [];
    for await (const msg of input.session.getMessages()) {
      allMessages.push(msg);
    }

    // 查找最后一条用户消息和最后一条助手消息
    let lastUser: MessageWithParts | undefined;
    let lastAssistant: MessageWithParts | undefined;
    let lastFinished: MessageWithParts | undefined;

    // 从后往前查找
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const msg = allMessages[i];
      const msgRole = (msg as any).info?.role || (msg as any).role; // 兼容两种格式
      if (!lastUser && msgRole === MessageRole.User) {
        lastUser = msg;
      }
      if (!lastAssistant && msgRole === MessageRole.Assistant) {
        lastAssistant = msg;
      }
      if (!lastFinished && msgRole === MessageRole.Assistant && ((msg as any).info?.finish || (msg as any).finish)) {
        lastFinished = msg;
      }
      if (lastUser && lastFinished) {
        break;
      }
    }

    // 如果从存储中找不到用户消息，使用传入的当前用户消息（避免存储延迟问题）
    if (!lastUser && input.currentUserMessage) {
      // 尝试从存储中获取完整的消息（包含 parts）
      const fullMessage = await storage.getMessageWithParts(input.sessionID, input.currentUserMessage.id);
      if (fullMessage) {
        lastUser = fullMessage;
        log.debug('使用传入的用户消息（从存储获取）', { messageID: input.currentUserMessage.id });
      } else {
        // 如果存储中还没有，等待一小段时间后重试
        // 这通常发生在消息刚创建但还没有完全保存到存储时
        await new Promise(resolve => setTimeout(resolve, 100));
        const retryMessage = await storage.getMessageWithParts(input.sessionID, input.currentUserMessage.id);
        if (retryMessage) {
          lastUser = retryMessage;
          log.debug('使用传入的用户消息（重试后从存储获取）', { messageID: input.currentUserMessage.id });
        } else {
          // 如果仍然找不到，记录警告但继续处理
          // 这种情况下，消息流应该会在下一次迭代中包含该消息
          log.warn('无法从存储获取用户消息，将在下次迭代中重试', { messageID: input.currentUserMessage.id });
        }
      }
    }

    // 检查是否应该退出循环
    if (!lastUser) {
      // 如果仍然找不到用户消息，尝试使用传入的当前用户消息ID直接从存储获取
      if (input.currentUserMessage) {
        log.debug('从消息流中未找到用户消息，尝试从存储直接获取', { 
          messageID: input.currentUserMessage.id,
          allMessagesCount: allMessages.length 
        });
        // 等待一小段时间，确保消息已保存
        await new Promise(resolve => setTimeout(resolve, 100));
        const directMessage = await storage.getMessageWithParts(input.sessionID, input.currentUserMessage.id);
        if (directMessage) {
          lastUser = directMessage;
          log.debug('成功从存储获取用户消息', { messageID: input.currentUserMessage.id });
        } else {
          // 如果仍然找不到，记录警告并继续（可能在下次迭代中找到）
          log.warn('无法从存储获取用户消息，将在下次迭代中重试', { 
            messageID: input.currentUserMessage.id,
            sessionID: input.sessionID 
          });
        }
      }
      
      // 如果仍然找不到，抛出错误
      if (!lastUser) {
        throw new Error('No user message found in stream. This should never happen.');
      }
    }

    const lastAssistantFinish = lastAssistant && lastAssistant.role === MessageRole.Assistant
      ? (lastAssistant as any).finish as string | undefined
      : undefined;

    if (
      lastAssistant &&
      lastAssistantFinish &&
      !['tool-calls', 'unknown'].includes(lastAssistantFinish) &&
      lastUser.id < lastAssistant.id
    ) {
      log.info('退出循环：助手消息已完成', {
        sessionID: input.sessionID,
        finish: lastAssistantFinish,
      });
      break;
    }

    // 检查最大步数
    if (step === 1) {
      // 确保标题（如果需要）
      // TODO: 实现 ensureTitle
    }

    if (step === maxSteps) {
      log.info('达到最大步数限制', { step, sessionID: input.sessionID });
      // 添加最大步数提醒
      if (lastUser) {
        await input.session.addTextPart(lastUser.id, MAX_STEPS);
      }
    }

    // 构建消息历史（转换为 ModelMessage 格式）
    const messages: ModelMessage[] = [];
    for (const msg of allMessages) {
      // MessageWithParts 的结构是 { info: MessageInfo, parts: Part[] }
      const msgRole = (msg as any).info?.role || (msg as any).role;
      const msgParts = (msg as any).parts || [];
      
      if (msgRole === MessageRole.User) {
        const textParts = msgParts.filter((p: any) => p.type === 'text');
        if (textParts.length > 0) {
          messages.push({
            role: 'user',
            content: (textParts[0] as any).text,
          });
        }
      } else if (msgRole === MessageRole.Assistant) {
        const textParts = msgParts.filter((p: any) => p.type === 'text');
        // 检查工具部分：可能是 'tool' (message-v2) 或 'tool-call' (message.ts)
        const toolParts = msgParts.filter((p: any) => {
          const partType = p.type;
          return partType === 'tool' || partType === 'tool-call';
        });

        if (textParts.length > 0) {
          messages.push({
            role: 'assistant',
            content: (textParts[0] as any).text,
          });
        }

        // 添加工具调用结果（只添加已完成或出错的）
        for (const toolPart of toolParts) {
          const tp = toolPart as any;
          // 支持两种格式：message-v2 的 'tool' 和 message.ts 的 'tool-call'
          const callID = tp.callID || tp.toolCallId;
          const state = tp.state || tp.state;
          const status = state?.status;
          
          // if (status === 'completed' || status === 'error') {
          //   const output = state?.output ?? '';
          //   const error = state?.error ?? '';
          //   const contentText = output || error;
          //   // AI SDK 要求 tool 消息的 content 必须是数组格式
          //   messages.push({
          //     role: 'tool',
          //     toolCallId: callID,
          //     content: [
          //       {
          //         type: 'text',
          //         text: contentText,
          //       },
          //     ],
          //   } as any);
          if (status === 'completed' || status === 'error') {
            const output = state?.output ?? '';
            const error = state?.error ?? '';
            const contentText = output || error;
            
            // 获取工具名称：支持两种格式
            const toolName = tp.toolName || tp.tool;
            
            // AI SDK 要求 tool 消息的 content 必须是 tool-result 格式的数组
            messages.push({
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: callID,
                  toolName: toolName || 'unknown',
                  output: {
                    type: 'text',
                    value: contentText,
                  },
                },
              ],
            } as any);
          }
        }
      }
    }

    // 插入提醒
    await insertReminders({
      messages,
      agent: input.agentConfig,
      session: input.session,
      lastUser,
      lastAssistant,
      isLastStep: step === maxSteps,
    });

    // 创建处理器
    // 注意：userMessageParts 需要是 Part[] 类型（来自 message-v2）
    // 但 lastUser.parts 可能是 message.ts 的 Part 类型
    // 这里进行类型转换
    const lastUserParts = (lastUser as any).parts || [];
    const processor = new SessionProcessor({
      sessionID: input.sessionID,
      userMessage: lastUser as any,
      userMessageParts: lastUserParts as Part[],
      model: input.modelConfig,
      agent: input.agentConfig,
      toolRegistry,
      languageModel,
      provider: input.providerInfo,
      messages,
      abort: new AbortController().signal,
      storage,
    });

    // 设置回调
    if (input.onTextChunk) {
      processor.onTextChunk = input.onTextChunk;
    }
    if (input.onToolCallUpdate) {
      processor.onToolCallUpdate = input.onToolCallUpdate;
    }

    // 解析工具
    const tools = await resolveTools({
      agent: input.agentConfig,
      model: input.modelConfig,
      session: input.session.info,
      processor,
      messages: allMessages,
      toolRegistry,
    });

    // 将工具传递给处理器（如果需要）
    // 注意：工具执行逻辑在 SessionProcessor 中，这里只是提供工具定义
    // 实际的工具调用在 processor.process() 中通过 LLM 流处理

    // 处理流
    let result: 'continue' | 'stop';
    try {
      result = await processor.process();
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      log.error('processor.process() 失败', { error: errorObj, sessionID: input.sessionID, step });
      // 即使处理失败，也尝试获取已创建的助手消息
      // 这样用户至少能看到错误信息
      // 注意：processor 可能已经创建了助手消息，即使处理失败
      // 设置为 stop 以退出循环，然后在循环外尝试获取助手消息
      result = 'stop';
    }

    // 循环控制逻辑
    if (result === 'stop') {
      log.info('退出循环：processor 返回 stop', { sessionID: input.sessionID, step });
      break;
    }

    if (result === 'continue') {
      log.info('继续循环：有工具调用', { sessionID: input.sessionID, step });
      continue;
    }

    // 默认继续
    continue;
  }

  // 获取最后的助手消息
  const assistantMessages: MessageWithParts[] = [];
  for await (const msg of input.session.getMessages()) {
    // MessageWithParts 的结构是 { info: MessageInfo, parts: Part[] }
    // 需要从 info 中获取 role
    const msgRole = (msg as any).info?.role || (msg as any).role;
    if (msgRole === MessageRole.Assistant) {
      assistantMessages.push(msg);
    }
  }

  if (assistantMessages.length === 0) {
    // 如果找不到助手消息，尝试获取最后一条消息（可能是用户消息或错误消息）
    log.warn('未找到助手消息，尝试获取最后一条消息', { 
      sessionID: input.sessionID,
      step 
    });
    
    // 重新获取所有消息
    const allMessages: MessageWithParts[] = [];
    for await (const msg of input.session.getMessages()) {
      allMessages.push(msg);
    }
    
    if (allMessages.length > 0) {
      const lastMessage = allMessages[allMessages.length - 1];
      const lastMsgRole = (lastMessage as any).info?.role || (lastMessage as any).role;
      const messageID = (lastMessage as any).info?.id || (lastMessage as any).id;
      
      // 如果最后一条是用户消息，说明助手消息创建失败
      if (lastMsgRole === MessageRole.User) {
        log.error('助手消息创建失败，返回用户消息', { 
          sessionID: input.sessionID,
          messageID 
        });
        // 返回用户消息，这样至少不会崩溃
        return lastMessage;
      }
      
      // 返回最后一条消息（可能是部分创建的助手消息）
      log.warn('返回最后一条消息', { 
        sessionID: input.sessionID,
        messageID,
        role: lastMsgRole
      });
      return lastMessage;
    }
    
    // 如果完全没有消息，返回用户消息（如果可用）
    if (input.currentUserMessage) {
      const userMsg = await storage.getMessageWithParts(input.sessionID, input.currentUserMessage.id);
      if (userMsg) {
        log.warn('返回用户消息（没有助手消息）', { 
          sessionID: input.sessionID,
          messageID: input.currentUserMessage.id
        });
        return userMsg;
      }
    }
    
    throw new Error('无法获取助手消息：会话中没有消息');
  }

  // 返回最新的助手消息
  const assistantMessage = assistantMessages[assistantMessages.length - 1];
  const messageID = (assistantMessage as any).info?.id || (assistantMessage as any).id;
  log.info('loop 完成', { sessionID: input.sessionID, messageID, steps: step });
  return assistantMessage;
}

/**
 * 解析工具
 * 将工具注册表中的工具转换为 AI SDK 的 Tool 格式
 * 参考 opencode 的实现
 */
async function resolveTools(input: {
  agent: AgentConfig;
  model: ModelConfig;
  session: SessionInfo;
  processor: SessionProcessor;
  messages: MessageWithParts[];
  toolRegistry: ToolRegistry;
}): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};

  // 获取所有工具
  const toolInfos = await input.toolRegistry.tools(input.agent);

  // 转换为 AI SDK Tool 格式
  for (const toolInfo of toolInfos) {
    try {
      // 转换 Zod schema 为 JSON schema
      let jsonSchemaObj: any;
      if (typeof (z as any).toJSONSchema === 'function') {
        jsonSchemaObj = (z as any).toJSONSchema(toolInfo.parameters);
      } else {
        // 回退到手动转换
        const { zodToJsonSchemaClean } = await import('../utils/zod-schema-utils');
        jsonSchemaObj = zodToJsonSchemaClean(toolInfo.parameters, {
          removeRefs: true,
          removeTitles: false,
        });
      }

      // 通过 ProviderTransform 进行模型特定的转换
      jsonSchemaObj = ProviderTransform.schema(input.model, jsonSchemaObj);

      // 转换为 AI SDK Tool
      // 注意：AI SDK 会调用 execute 函数，我们需要在这里实际执行工具
      // 这样才能让 AI SDK 的 tool-result 事件包含正确的结果
      const toolId = toolInfo.id; // 保存到局部变量，避免闭包问题
      tools[toolId] = tool({
        id: toolId as any,
        description: toolInfo.description,
        inputSchema: jsonSchema(jsonSchemaObj) as any,
        execute: async (args: any) => {
          // 实际执行工具，返回结果给 AI SDK
          // 这样 AI SDK 的 tool-result 事件会包含正确的结果
          if (!input.processor || !input.toolRegistry) {
            return { output: '', title: '', metadata: {} };
          }
          
          const currentToolInfo = input.toolRegistry.get(toolId);
          if (!currentToolInfo) {
            return { output: `工具 ${toolId} 不存在`, title: '', metadata: {} };
          }
          
          try {
            // 初始化工具
            const initialized = await currentToolInfo.init({
              agent: input.agent,
            });
            
            // 创建执行上下文（简化版，因为 execute 函数中没有 toolCallId）
            const context = {
              sessionID: input.session.id,
              messageID: '', // execute 函数中没有 messageID
              agent: input.agent.name,
              abort: new AbortController().signal,
              callID: '', // execute 函数中没有 callID
              extra: {},
              messages: [],
              metadata: async () => {},
              ask: async () => Promise.resolve(),
            };
            
            // 执行工具
            const result = await initialized.execute(args, context);
            
            // 格式化输出
            let outputText: string;
            if (typeof result === 'string') {
              outputText = result;
            } else if (result && typeof result === 'object') {
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
            
            return {
              output: outputText,
              title: (result as any)?.title || '',
              metadata: (result as any)?.metadata || {},
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              output: `工具执行失败: ${errorMessage}`,
              title: '',
              metadata: {},
            };
          }
        },
      });
    } catch (error) {
      log.error('解析工具失败', {
        toolId: toolInfo.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // 继续处理其他工具
    }
  }

  // 获取 MCP 工具（如果可用）
  try {
    const { getMcpTools } = await import('../mcp/tools');
    const mcpTools = await getMcpTools();
    Object.assign(tools, mcpTools);
  } catch (error) {
    log.debug('无法加载 MCP 工具', { error: error instanceof Error ? error.message : String(error) });
  }

  return tools;
}

/**
 * 插入提醒（参考 opencode）
 */
async function insertReminders(input: {
  messages: ModelMessage[];
  agent: AgentConfig;
  session: Session;
  lastUser?: MessageWithParts;
  lastAssistant?: MessageWithParts;
  isLastStep: boolean;
}) {
  const userMessage = input.lastUser;
  if (!userMessage) return;

  // 如果是 plan 模式，插入 plan 提醒
  if (input.agent.name === 'plan') {
    await input.session.addTextPart(userMessage.id, PROMPT_PLAN);
    return;
  }

  // 如果之前是 plan 模式，现在切换到 build 模式，插入切换提醒
  const wasPlan = input.messages.some((msg) => 
    msg.role === 'assistant' && 
    (msg as any).agent === 'plan'
  );
  
  if (wasPlan && input.agent.name === 'build') {
    await input.session.addTextPart(userMessage.id, BUILD_SWITCH);
    return;
  }

  // 如果是最后一步，插入最大步数提醒
  if (input.isLastStep) {
    await input.session.addTextPart(userMessage.id, MAX_STEPS);
  }
}