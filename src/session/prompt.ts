/**
 * Prompt 函数
 * 处理用户输入，调用 LLM，并管理工具执行
 * 参考 opencode 的实现，但保持 hicode 的编码风格
 */

import { z } from 'zod';
import { Session } from './sessionClass';
import { SessionFactory, getSessionFactory } from './factory';
import { stream as streamLLM, type StreamInput } from './llm';
import { SessionProcessor } from './processor';
import { MessageWithParts, MessageRole, generateMessageID } from './message';
import { VSCodeSessionStorage } from './storage';
import { ProviderManager } from '../api/provider/providerManager';
import { Agent } from '../agent/agent';
import { ToolRegistry } from '../tool/registry';
import { createLogger } from '../utils/logger';
import * as vscode from 'vscode';
import { getExtensionContext } from '../extension';
import type { ModelConfig, ProviderInfo } from '../api/types';
import type { AgentConfig } from '../agent/types';
import type { ModelMessage } from 'ai';
import { readFileSync } from 'fs';
import { join } from 'path';

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
 * 处理用户输入，调用 LLM，并返回助手消息
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
  const agentName = input.agent || 'build';
  const agentConfig = Agent.get(agentName);
  if (!agentConfig) {
    throw new Error(`Agent ${agentName} 不存在`);
  }

  // 获取语言模型实例（需要 model 和 provider 两个参数）
  const providerManager = ProviderManager.getInstance();
  const languageModel = await providerManager.getLanguageModel(modelConfig, providerInfo);

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

  // Agent 调用循环（参考 opencode 的实现）
  // 当有工具调用时，需要继续处理工具结果，直到完成或达到最大步数
  let step = 0;
  const maxSteps = agentConfig.steps || 10; // 使用 agent 配置的步数，防止无限循环
  
  while (step < maxSteps) {
    step++;
    log.info('agent 循环步骤', { step, sessionID: input.sessionID });
    
    // 获取最新的消息历史
    const allMessages: MessageWithParts[] = [];
    for await (const msg of session.getMessages()) {
      allMessages.push(msg);
    }
    
    // 查找最后一条用户消息和最后一条助手消息
    let lastUser: MessageWithParts | undefined;
    let lastAssistant: MessageWithParts | undefined;
    let lastFinished: MessageWithParts | undefined;
    
    // 从后往前查找（最新的消息在前）
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const msg = allMessages[i];
      if (!lastUser && msg.role === MessageRole.User) {
        lastUser = msg;
      }
      if (!lastAssistant && msg.role === MessageRole.Assistant) {
        lastAssistant = msg;
      }
      if (!lastFinished && msg.role === MessageRole.Assistant && (msg as any).finish) {
        lastFinished = msg;
      }
      // 如果找到了用户消息和已完成的助手消息，可以停止查找
      if (lastUser && lastFinished) {
        break;
      }
    }
    
    // 检查是否应该退出循环
    // 如果有已完成的助手消息，且 finish 不是 "tool-calls" 或 "unknown"，且用户消息ID小于助手消息ID，则退出
    const lastAssistantFinish = lastAssistant && lastAssistant.role === MessageRole.Assistant 
      ? (lastAssistant as any).finish as string | undefined
      : undefined;
    
    if (
      lastAssistant &&
      lastAssistantFinish &&
      !['tool-calls', 'unknown'].includes(lastAssistantFinish) &&
      lastUser &&
      lastUser.id < lastAssistant.id
    ) {
      log.info('退出循环：助手消息已完成', { 
        sessionID: input.sessionID, 
        finish: lastAssistantFinish,
        userMessageID: lastUser.id,
        assistantMessageID: lastAssistant.id
      });
      break;
    }
    
    // 检查是否是最大步数
    if (step === maxSteps) {
      log.info('达到最大步数限制', { step, sessionID: input.sessionID });
      // 添加最大步数提醒
      if (lastUser) {
        await session.addTextPart(lastUser.id, MAX_STEPS);
      }
      break;
    }
    
    // 构建消息历史
    const messages: ModelMessage[] = [];
    for await (const msg of session.getMessages()) {
      // 转换为 ModelMessage
      if (msg.role === MessageRole.User) {
        const textParts = msg.parts.filter(p => p.type === 'text');
        if (textParts.length > 0) {
          messages.push({
            role: 'user',
            content: (textParts[0] as any).text,
          });
        }
      } else if (msg.role === MessageRole.Assistant) {
        const textParts = msg.parts.filter(p => p.type === 'text');
        const toolParts = msg.parts.filter(p => p.type === 'tool-call');
        
        // 如果有文本部分，添加文本消息
        if (textParts.length > 0) {
          messages.push({
            role: 'assistant',
            content: (textParts[0] as any).text,
          });
        }
        
        // 如果有工具调用，添加工具调用消息（AI SDK 格式）
        for (const toolPart of toolParts) {
          const tp = toolPart as any;
          messages.push({
            role: 'tool',
            toolCallId: tp.toolCallId,
            toolName: tp.toolName,
            content: tp.result ? JSON.stringify(tp.result) : (tp.error || ''),
          } as any);
        }
      }
    }
    
    // 插入提醒（参考 opencode）
    await insertReminders({
      messages,
      agent: agentConfig,
      session,
      lastUser,
      lastAssistant,
      isLastStep: step === maxSteps,
    });
    
    // 创建处理器
    const processor = new SessionProcessor({
      sessionID: session.info.id,
      userMessage: userMessage as any,
      model: modelConfig,
      agent: agentConfig,
      toolRegistry: new ToolRegistry(),
      languageModel,
      provider: providerInfo,
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
    
    // 如果这是第一次循环，或者上一轮有工具调用（finish 是 "tool-calls" 或 "unknown"），需要继续处理
    const shouldContinue = step === 1 || (lastAssistantFinish === 'tool-calls' || lastAssistantFinish === 'unknown');
      
    if (shouldContinue) {
      // 如果不是第一次循环，且上一轮有工具调用，需要重置 processor 以便创建新的助手消息
      if (step > 1) {
        processor.reset();
      }
      
      // 处理流
      const result = await processor.process();
      
      if (result === 'stop') {
        // 处理完成，退出循环
        log.info('退出循环：processor 返回 stop', { sessionID: input.sessionID, step });
        break;
      }
      
      if (result === 'continue') {
        // 有工具调用，继续处理
        // 下次循环时，buildStreamInput 会自动获取包含工具结果的最新消息历史
        log.info('继续循环：有工具调用', { sessionID: input.sessionID, step });
        continue;
      }
    } else {
      // 没有未完成的助手消息，退出循环
      log.info('退出循环：没有未完成的助手消息', { sessionID: input.sessionID, step });
      break;
    }
  }
  
  // 获取最后的助手消息
  const assistantMessages: MessageWithParts[] = [];
  for await (const msg of session.getMessages()) {
    if (msg.role === MessageRole.Assistant) {
      assistantMessages.push(msg);
    }
  }
  
  if (assistantMessages.length === 0) {
    throw new Error('无法获取助手消息');
  }
  
  // 返回最新的助手消息
  const assistantMessage = assistantMessages[0];
  log.info('prompt 完成', { sessionID: input.sessionID, messageID: assistantMessage.id, steps: step });
  return assistantMessage;
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