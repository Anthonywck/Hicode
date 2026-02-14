/**
 * Webview 消息处理器
 * 
 * 处理来自 Webview 的各种消息请求，包括：
 * - 聊天消息处理
 * - 模型配置管理
 * - 设置管理
 * - 历史记录管理
 * 
 * 本文件负责具体的业务逻辑处理，消息路由由 webviewMessageRouter.ts 负责
 */

import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import * as MessageType from '../utils/messageType';
import { getConfigManager, getAPIClient, getContextManager, getChatWebviewProvider, getExtensionContext } from '../extension';
import { MessageHandler } from './messageHandler';
import { generateUUID } from '../utils/tools';
import { SettingsWebviewProvider } from '../providers/settingsWebviewProvider';
import { getSessionFactory } from '../session/factory';
import { Session } from '../session/sessionClass';
import { MessageWithParts, ToolCallPart, TextPart } from '../session/message';

/**
 * 获取默认 API URL
 */
function getDefaultApiUrl(providerID: string): string {
  const urls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    zhipuai: 'https://open.bigmodel.cn/api/paas/v4',
    deepseek: 'https://api.deepseek.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1',
  };
  return urls[providerID] || 'https://api.openai.com/v1';
}

/**
 * 获取 SDK 包名
 */
function getSDKForProvider(providerID: string): string {
  const sdkMap: Record<string, string> = {
    openai: '@ai-sdk/openai',
    zhipuai: '@ai-sdk/openai-compatible',
    deepseek: '@ai-sdk/openai-compatible',
    anthropic: '@ai-sdk/anthropic',
    google: '@ai-sdk/google',
  };
  return sdkMap[providerID] || '@ai-sdk/openai-compatible';
}

/**
 * 将前端使用的 providerID 映射到 models.dev 中的 providerID
 * models.dev 可能使用不同的 ID（如 "zai" 而不是 "zhipuai"）
 */
function mapProviderIDToModelsDev(providerID: string): string {
  const mapping: Record<string, string> = {
    zhipuai: 'zai', // models.dev 中使用 "zai" 作为智谱AI的ID
    deepseek: 'deepseek',
    openai: 'openai',
    anthropic: 'anthropic',
    google: 'google',
    qwen: 'qwen',
    custom: 'custom',
  };
  return mapping[providerID] || providerID;
}

/**
 * 处理发送聊天消息请求
 * @param message 消息对象，包含 token、data 等字段
 * @param webview Webview 实例，用于发送响应
 */
export async function handleAskQuestion(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到聊天消息请求', { message }, 'WebviewMessageHandler');

  try {
    const { token, data } = message;
    // 兼容不同的字段名：content 或 message
    const content = data?.content || data?.message;
    const { sessionId, chatId, resources } = data || {};

    // 验证消息内容
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      logger.warn('无效的聊天消息内容', { data }, 'WebviewMessageHandler');
      webview.postMessage({
        token: token || generateUUID(),
        message: MessageType.HICODE_ERROR_B2F,
        data: {
          error: '消息内容不能为空',
          chatId
        }
      });
      return;
    }

    // 获取 API 客户端和上下文管理器
    const apiClient = await getAPIClient();
    const contextManager = await getContextManager();

    // 创建消息处理器
    const messageHandler = new MessageHandler(
      apiClient,
      contextManager,
      {
        enableStreaming: true,
        includeContext: true
      }
    );

    // 累积响应内容
    let accumulatedContent = '';
    let currentSession: Session | null = null;
    let lastMessageId: string | null = null;

// 发送流式响应
    console.log(`[HICODE DEBUG] WebviewMessageHandler开始发送流式响应 - chatId: ${chatId}, sessionId: ${sessionId}`);
    await messageHandler.handleSendStreamMessage(
      content.trim(),
      {
        // 接收到数据块时的回调
        onChunk: (chunk: string) => {
          // 确保chunk是有效的字符串，避免undefined
          const textChunk = chunk || '';
          if (!textChunk) {
            return; // 跳过空块
          }
          accumulatedContent += textChunk;
          
          // 调试日志（不仅在开发模式下）
          console.log(`[HICODE DEBUG] 发送流式数据块到前端 - 长度: ${textChunk.length}, 累积长度: ${accumulatedContent.length}, chatId: ${chatId || sessionId}`);
          logger.debug('发送流式数据块到前端', { 
            chunkLength: textChunk.length, 
            accumulatedLength: accumulatedContent.length,
            chatId: chatId || sessionId,
            preview: textChunk.substring(0, 50)
          }, 'WebviewMessageHandler');
          
          // 立即发送流式数据到前端，实现真正的流式效果
          // 前端期望的格式：{ chatId, text }
          webview.postMessage({
            token: token || generateUUID(),
            message: MessageType.HICODE_ASK_QUESTION_B2F_RES,
            data: {
              chatId: chatId || sessionId,
              text: textChunk  // 前端期望使用 text 字段，每次只发送增量
            }
          });
        },
        // 流结束时的回调
        onEnd: async () => {
          console.log(`[HICODE DEBUG] 流式响应结束 - 总长度: ${accumulatedContent.length}`);
          
          // 发送工具调用状态更新（如果有）
          if (currentSession && lastMessageId) {
            await sendToolCallUpdates(webview, currentSession, lastMessageId, chatId || sessionId, token);
          }

          // 发送完成标志
          // 前端期望的格式：{ chatId, text: '[DONE]' }
          webview.postMessage({
            token: token || generateUUID(),
            message: MessageType.HICODE_ASK_QUESTION_B2F_RES,
            data: {
              chatId: chatId || sessionId,
              text: '[DONE]'  // 前端期望使用 text 字段，完成标志为 '[DONE]'
            }
          });
          logger.debug('聊天消息处理完成', { chatId, contentLength: accumulatedContent.length }, 'WebviewMessageHandler');
        },
        // 发生错误时的回调
        onError: (error: Error) => {
          console.error(`[HICODE DEBUG] 处理聊天消息时发生错误:`, error);
          logger.error('处理聊天消息时发生错误：', error, 'WebviewMessageHandler');
          webview.postMessage({
            token: token || generateUUID(),
            message: MessageType.HICODE_ERROR_B2F,
            data: {
              error: error.message || '处理消息时发生未知错误',
              chatId: chatId || sessionId
            }
          });
        }
      },
      {
        sessionId,
        stream: true,
        includeContext: true,
        resources: resources || []  // 传递 resources 参数
      }
    );
  } catch (error) {
    logger.error('处理聊天消息请求失败', error, 'WebviewMessageHandler');
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

/**
 * 处理新建对话请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleNewChat(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到新建对话请求', { message }, 'WebviewMessageHandler');

  try {
    const apiClient = await getAPIClient();
    const context = await getExtensionContext();
    const sessionFactory = getSessionFactory(context);

    // 获取当前模型
    const currentModel = apiClient.getCurrentModel();
    if (!currentModel) {
      throw new Error('未选择模型，请先配置模型');
    }

    // 创建新会话（使用新的 Session 系统）
    const session = await sessionFactory.createSession(`对话 ${new Date().toLocaleString()}`);

    // 生成新的convId（用于前端标识）
    const newConvId = generateUUID();

    // 发送新会话系统消息（统一使用HICODE_NEW_CONVERSATION）
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_NEW_CONVERSATION,
      data: {
        convId: newConvId,
        sessionId: session.info.id,
        timestamp: new Date().toISOString()
      }
    });

    logger.debug('新建对话成功', { sessionId: session.info.id, convId: newConvId }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('新建对话失败', error, 'WebviewMessageHandler');
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

/**
 * 发送工具调用状态更新到前端
 */
async function sendToolCallUpdates(
  webview: vscode.Webview,
  session: Session,
  messageId: string,
  chatId: string,
  token?: string
): Promise<void> {
  try {
    const parts = await session.getParts(messageId);
    
    for (const part of parts) {
      if (part.type === 'tool-call') {
        const toolPart = part as ToolCallPart;
        
        // 发送工具调用状态更新
        // 注意：hicode 的 ToolCallPart 结构较简单，只有 toolCallId, toolName, args, result, error
        const status = toolPart.error ? 'error' : (toolPart.result !== undefined ? 'completed' : 'running');
        webview.postMessage({
          token: token || generateUUID(),
          message: MessageType.HICODE_TOOL_CALL_UPDATE_B2F,
          data: {
            chatId,
            toolCall: {
              id: toolPart.toolCallId,
              tool: toolPart.toolName,
              status: status,
              input: toolPart.args || {},
              output: toolPart.result,
              error: toolPart.error,
            }
          }
        });
      }
    }
  } catch (error) {
    logger.error('发送工具调用更新失败', error, 'WebviewMessageHandler');
  }
}

/**
 * 处理获取模型列表请求
 * 
 * 参考hicode项目的实现，确保返回的数据格式与前端期望一致
 * 前端期望的字段名：modelOptions（模型列表）、currModel（当前模型）
 * 
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleGetModels(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到获取模型列表请求', { message }, 'WebviewMessageHandler');

  try {
    // 步骤1: 获取配置管理器和API客户端
    const configManager = await getConfigManager();
    const apiClient = await getAPIClient();

    // 步骤2: 获取所有用户配置的模型（只返回有API key的）
    const models = configManager.models.getModelConfigs();
    
    // 步骤3: 为每个模型获取API密钥（从SecretStorage中读取），并过滤掉没有API key的模型
    const modelsWithKeys = await Promise.all(
      models.map(async (model: any) => {
        const apiKey = await configManager.models.getApiKey(model.modelId);
        // 只返回有API key的模型（用户配置的）
        if (!apiKey) {
          return null;
        }
        const modelWithKey = {
          ...model,
          apiKey: apiKey
        };
        // 将token单位转换为K单位显示给前端
        return processModelDataForDisplay(modelWithKey);
      })
    );
    
    // 过滤掉 null 值（没有API key的模型）
    const validModels = modelsWithKeys.filter((m): m is any => m !== null);
    
    // 步骤4: 获取当前使用的模型（modelId）
    let currentModelId = apiClient.getCurrentModel();
    
    // 步骤5: 如果没有当前模型，但有可用模型，自动选择第一个
    if (!currentModelId && validModels.length > 0) {
      const firstModel = validModels[0];
      currentModelId = firstModel.modelId;
      try {
        // 通过 configManager 设置当前模型
        await configManager.models.setCurrentModel(currentModelId);
        logger.debug('自动选择第一个模型', { modelId: currentModelId }, 'WebviewMessageHandler');
      } catch (error) {
        logger.warn('自动选择模型失败', error, 'WebviewMessageHandler');
      }
    }
    
    // 步骤6: 将modelId转换为modelName（前端期望的格式）
    // 参考hicode项目，前端使用modelName作为currModel的值
    let currModel = '';
    if (currentModelId) {
      const currentModelConfig = models.find((m: any) => m.modelId === currentModelId);
      currModel = currentModelConfig?.modelName || currentModelId;
    } else if (validModels.length > 0) {
      // 如果没有当前模型，使用第一个模型的modelName
      currModel = validModels[0].modelName || validModels[0].modelId;
    }

    // 步骤6: 发送响应，使用前端期望的字段名
    // 注意：前端期望的字段名是 modelOptions 和 currModel（modelName格式）
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_GET_MODELS_B2F_RES,
      data: {
        modelOptions: validModels, // 前端期望的字段名（只包含有API key的模型）
        models: validModels, // 兼容字段
        currModel: currModel, // 前端期望的字段名（modelName格式）
        currentModel: currModel // 兼容字段
      }
    });

    logger.debug('获取模型列表成功', { 
      count: validModels.length, 
      currModel,
      currentModelId,
      modelIds: validModels.map((m: any) => m.modelId),
      modelNames: validModels.map((m: any) => m.modelName)
    }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('获取模型列表失败', error, 'WebviewMessageHandler');
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

/**
 * 处理切换模型请求
 * 
 * 参考hicode项目的实现，基于hcode项目中的config模块逻辑
 * 实现模型切换功能，确保：
 * 1. 支持前端传递的modelName字段（与hicode保持一致）
 * 2. 通过modelName找到对应的modelId进行切换
 * 3. 同步更新configManager和apiClient中的当前模型
 * 4. 切换成功后通知chat和settings页面更新当前模型
 * 5. 返回modelName作为currModel（前端期望的格式）
 * 
 * @param message 消息对象，包含 modelName 字段（前端传递的格式）
 * @param webview Webview 实例，用于发送响应
 */
export async function handleChangeModel(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到切换模型请求', { message }, 'WebviewMessageHandler');

  try {
    const { data } = message;
    
    // 步骤1: 获取模型名称（前端传递的格式，参考hicode项目）
    // 前端发送的是 modelName 字段，而不是 modelId
    const modelName = data?.modelName || data?.modelId;
    
    if (!modelName) {
      throw new Error('模型名称不能为空');
    }

    // 步骤2: 获取配置管理器和API客户端
    const configManager = await getConfigManager();
    const apiClient = await getAPIClient();

    // 步骤3: 通过modelName找到对应的模型配置
    // 前端使用modelName作为标识，需要找到对应的modelId
    const models = configManager.models.getModelConfigs();
    const model = models.find((m: any) => m.modelName === modelName || m.modelId === modelName);
    
    if (!model) {
      throw new Error(`模型 ${modelName} 不存在`);
    }

    // 步骤4: 使用modelId进行切换（内部使用modelId）
    // setCurrentModel方法会同时更新配置管理器和API客户端中的当前模型
    await apiClient.setCurrentModel(model.modelId);

    // 步骤5: 获取更新后的当前模型信息
    // 注意：前端期望的是modelName，所以需要返回modelName
    const currentModelId = apiClient.getCurrentModel();
    const currentModelConfig = models.find((m: any) => m.modelId === currentModelId);
    const currentModelName = currentModelConfig?.modelName || currentModelId;
    
    // 步骤6: 发送响应到请求的webview
    // 参考hicode项目，返回modelName作为currModel
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_CHANGE_MODEL_B2F_RES,
      data: {
        modelName: modelName, // 前端期望的字段名
        currModel: modelName, // 前端期望的字段名（当前模型）
        modelId: model.modelId, // 兼容字段
        currentModel: modelName, // 兼容字段
        success: true
      }
    });

    // 步骤7: 通知chat页面更新当前模型（如果chat页面已打开）
    // 参考hicode项目的实现，确保chat页面能及时更新模型选择
    const chatProvider = getChatWebviewProvider();
    if (chatProvider) {
      try {
        chatProvider.postMessage({
          token: generateUUID(),
          message: MessageType.HICODE_CHANGE_MODEL_B2F_RES,
          data: {
            modelName: modelName,
            currModel: modelName, // 前端期望的字段名
            modelId: model.modelId,
            currentModel: modelName,
            success: true
          }
        });
        logger.debug('已通知chat页面更新模型', { modelName, modelId: model.modelId }, 'WebviewMessageHandler');
      } catch (error) {
        // chat页面通知失败不影响主流程，只记录日志
        logger.warn('通知chat页面更新模型失败', error, 'WebviewMessageHandler');
      }
    }

    // 步骤8: 通知settings页面更新当前模型（如果settings页面已打开）
    // 确保settings页面显示的当前模型与实际使用的模型保持一致
    try {
      SettingsWebviewProvider.sendMessage({
        token: generateUUID(),
        message: MessageType.HICODE_CHANGE_MODEL_B2F_RES,
        data: {
          modelName: modelName,
          currModel: modelName, // 前端期望的字段名
          modelId: model.modelId,
          currentModel: modelName,
          success: true
        }
      });
      logger.debug('已通知settings页面更新模型', { modelName, modelId: model.modelId }, 'WebviewMessageHandler');
    } catch (error) {
      // settings页面通知失败不影响主流程，只记录日志
      logger.warn('通知settings页面更新模型失败', error, 'WebviewMessageHandler');
    }

    logger.info('切换模型成功', { modelName, modelId: model.modelId }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('切换模型失败', error, 'WebviewMessageHandler');
    
    // 发送错误响应
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        error: error instanceof Error ? error.message : String(error),
        modelName: message.data?.modelName
      }
    });
  }
}

/**
 * 处理新增模型配置请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
/**
 * 辅助函数：将K单位转换为token单位（用于存储）
 */
function kToToken(k: number | undefined): number | undefined {
  if (k === undefined || k === null) return undefined;
  return Math.round(k * 1024);
}

/**
 * 辅助函数：将token单位转换为K单位（用于显示）
 */
function tokenToK(tokens: number | undefined): number | undefined {
  if (tokens === undefined || tokens === null) return undefined;
  return Math.round((tokens / 1024) * 100) / 100; // 保留2位小数
}

/**
 * 辅助函数：处理前端传来的模型数据，转换为后端存储格式
 * - 处理新的数据结构（providerID、modelID）和旧的数据结构（vendor、modelName）
 * - 将K单位的 maxContextTokens 转换为token单位
 * - maxOutputTokens 不开放给用户配置，自动设置为默认值 2K (2048 tokens)
 * - 确保 temperature 有默认值 0.6
 */
async function processModelDataForStorage(data: any): Promise<any> {
  const processed = { ...data };
  
  // 处理新的数据结构：如果提供了 providerID 和 modelID，转换为旧格式以便存储
  if (processed.providerID && processed.modelID) {
    // 新格式：使用 providerID 和 modelID
    // 转换为旧格式的 vendor 和 modelName（向后兼容）
    if (!processed.vendor) {
      processed.vendor = processed.providerID;
    }
    if (!processed.modelName) {
      processed.modelName = processed.modelID;
    }
  } else if (processed.vendor && processed.modelName) {
    // 旧格式：使用 vendor 和 modelName
    // 转换为新格式（如果不存在）
    if (!processed.providerID) {
      processed.providerID = processed.vendor;
    }
    if (!processed.modelID) {
      processed.modelID = processed.modelName;
    }
  }
  
  // 确保 modelId 格式正确（providerID/modelID 或使用旧的 modelId）
  if (!processed.modelId) {
    if (processed.providerID && processed.modelID) {
      processed.modelId = `${processed.providerID}/${processed.modelID}`;
    } else if (processed.modelName) {
      processed.modelId = processed.modelName;
    } else {
      processed.modelId = generateUUID();
    }
  }
  
  // 将K单位转换为token单位
  if (processed.maxContextTokens !== undefined && processed.maxContextTokens !== null) {
    // 如果值小于1000，可能是K单位，需要转换；否则已经是token单位
    if (processed.maxContextTokens < 1000) {
      processed.maxContextTokens = kToToken(processed.maxContextTokens) || 4096;
    }
  } else {
    // 如果没有提供，设置默认值 4K = 4096 tokens
    processed.maxContextTokens = 4096;
  }
  
  // maxOutputTokens 不开放给用户配置，始终设置为默认值 2K (2048 tokens)
  processed.maxOutputTokens = 2048;
  
  // 确保 temperature 有默认值 0.6
  if (processed.temperature === undefined || processed.temperature === null) {
    processed.temperature = 0.6;
  }
  
  // 构建完整的 ModelConfig 对象（新格式）
  const modelConfig: any = {
    modelId: processed.modelId,
    displayName: processed.displayName || processed.modelID || processed.modelName || processed.modelId,
    providerID: processed.providerID || processed.vendor || 'custom',
    modelID: processed.modelID || processed.modelName || processed.modelId,
    api: {
      id: processed.modelID || processed.modelName || processed.modelId,
      url: processed.apiBaseUrl || getDefaultApiUrl(processed.providerID || processed.vendor || 'custom'),
      npm: getSDKForProvider(processed.providerID || processed.vendor || 'custom'),
    },
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: {
        text: true,
        audio: false,
        image: processed.supportMultimodal || false,
        video: false,
        pdf: false,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
    },
    limit: {
      context: processed.maxContextTokens || 4096,
      output: processed.maxOutputTokens || 2048,
    },
    cost: {
      input: 0,
      output: 0,
      cache: { read: 0, write: 0 },
    },
    status: 'active',
    release_date: new Date().toISOString().split('T')[0],
    modelDescription: processed.modelDescription,
    apiKey: processed.apiKey,
    // 向后兼容字段
    vendor: processed.vendor || processed.providerID,
    modelName: processed.modelName || processed.modelID,
    apiBaseUrl: processed.apiBaseUrl,
    maxContextTokens: processed.maxContextTokens,
    maxOutputTokens: processed.maxOutputTokens,
    supportMultimodal: processed.supportMultimodal || false,
  };
  
  return modelConfig;
}

/**
 * 辅助函数：处理模型数据，将token单位转换为K单位（用于返回给前端）
 */
function processModelDataForDisplay(model: any): any {
  const processed = { ...model };
  
  // 将token单位转换为K单位
  if (processed.maxContextTokens !== undefined && processed.maxContextTokens !== null) {
    processed.maxContextTokens = tokenToK(processed.maxContextTokens) || 4;
  }
  
  // maxOutputTokens 不开放给用户配置，不在返回数据中显示
  
  // temperature 保持不变，直接返回
  
  return processed;
}

export async function handleAddModel(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到新增模型配置请求', { message }, 'WebviewMessageHandler');

  // 在函数作用域中保存data，以便在finally块中使用
  const { data } = message;
  
  try {
    const configManager = await getConfigManager();

    // 验证必填字段
    if (!data.modelId || !data.modelName) {
      throw new Error('模型ID和模型名称不能为空');
    }

    // 检查是否已存在相同ID的模型
    const existingModel = configManager.models.getModelConfigs().find((m: any) => m.modelId === data.modelId);
    if (existingModel) {
      throw new Error(`模型ID ${data.modelId} 已存在`);
    }

    // 处理数据：将K单位转换为token单位，设置temperature默认值
    const processedData = await processModelDataForStorage(data);

    // 添加模型配置
    await configManager.models.addModelConfig(processedData);

    // 获取更新后的模型列表
    const models = configManager.models.getModelConfigs();
    
    // 为每个模型获取API密钥
    const modelsWithKeys = await Promise.all(
      models.map(async (model: any) => {
        const apiKey = await configManager.models.getApiKey(model.modelId);
        const modelWithKey = {
          ...model,
          apiKey: apiKey || ''
        };
        // 将token单位转换为K单位显示给前端
        return processModelDataForDisplay(modelWithKey);
      })
    );

    // 获取当前使用的模型（modelId格式）
    const apiClient = await getAPIClient();
    const currentModelId = apiClient.getCurrentModel();
    
    // 将modelId转换为modelName（前端期望的格式）
    let currModel = '';
    if (currentModelId) {
      const currentModelConfig = models.find((m: any) => m.modelId === currentModelId);
      currModel = currentModelConfig?.modelName || currentModelId;
    } else if (modelsWithKeys.length > 0) {
      // 如果没有当前模型，使用第一个模型的modelName
      currModel = modelsWithKeys[0].modelName || modelsWithKeys[0].modelId;
    }

    logger.info('新增模型配置成功', { modelId: data.modelId }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('新增模型配置失败', error, 'WebviewMessageHandler');
    
    // 构建错误堆栈信息
    const errorStack = error instanceof Error && error.stack 
      ? error.stack 
      : String(error);
    
    // 发送错误消息，包含操作类型和错误堆栈信息
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        operationType: '新增模型配置', // 操作类型，用于前端显示用户友好的提示
        operation: 'addModel', // 操作标识
        error: error instanceof Error ? error.message : String(error), // 错误消息
        errorStack: errorStack, // 错误堆栈信息，用于前端日志记录
        modelId: data?.modelId // 相关数据
      }
    });
  } finally {
    // 无论成功或失败，都发送刷新消息以确保前端数据与后端保持一致
    try {
      const configManager = await getConfigManager();
      const apiClient = await getAPIClient();
      
      // 获取最新的模型列表
      const models = configManager.models.getModelConfigs();
      const modelsWithKeys = await Promise.all(
        models.map(async (model: any) => {
          const apiKey = await configManager.models.getApiKey(model.modelId);
          return {
            ...model,
            apiKey: apiKey || ''
          };
        })
      );
      
      // 获取当前使用的模型（modelId格式）
      const currentModelId = apiClient.getCurrentModel();
      
      // 将modelId转换为modelName（前端期望的格式）
      let currModel = '';
      if (currentModelId) {
        const currentModelConfig = models.find((m: any) => m.modelId === currentModelId);
        currModel = currentModelConfig?.modelName || currentModelId;
      } else if (modelsWithKeys.length > 0) {
        // 如果没有当前模型，使用第一个模型的modelName
        currModel = modelsWithKeys[0].modelName || modelsWithKeys[0].modelId;
      }
      
      // 发送刷新消息
      webview.postMessage({
        token: message.token || generateUUID(),
        message: MessageType.HICODE_REFRESH_MODELS_B2F_RES,
        data: {
          type: 'add',
          models: modelsWithKeys, // settings页面期望的字段名
          modelOptions: modelsWithKeys, // chat页面期望的字段名
          currModel: currModel, // 当前模型（modelName格式）
          currentModel: currModel // 兼容字段
        }
      });
    } catch (refreshError) {
      logger.error('发送刷新消息失败', refreshError, 'WebviewMessageHandler');
    }
  }
}

/**
 * 处理编辑模型配置请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleEditModel(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到编辑模型配置请求', { message }, 'WebviewMessageHandler');

  // 在函数作用域中保存data，以便在finally块中使用
  const { data } = message;
  
  try {
    const configManager = await getConfigManager();

    if (!data.modelId) {
      throw new Error('模型ID不能为空');
    }

    // 验证模型是否存在
    const existingModel = configManager.models.getModelConfigs().find((m: any) => m.modelId === data.modelId);
    if (!existingModel) {
      throw new Error(`模型 ${data.modelId} 不存在`);
    }

    // 处理数据：将K单位转换为token单位，设置temperature默认值
    const processedData = await processModelDataForStorage(data);

    // 更新模型配置
    await configManager.models.updateModelConfig(data.modelId, processedData);

    // 获取更新后的模型列表
    const models = configManager.models.getModelConfigs();
    
    // 为每个模型获取API密钥
    const modelsWithKeys = await Promise.all(
      models.map(async (model: any) => {
        const apiKey = await configManager.models.getApiKey(model.modelId);
        return {
          ...model,
          apiKey: apiKey || ''
        };
      })
    );

    // 获取当前使用的模型（modelId格式）
    const apiClient = await getAPIClient();
    const currentModelId = apiClient.getCurrentModel();
    
    // 将modelId转换为modelName（前端期望的格式）
    let currModel = '';
    if (currentModelId) {
      const currentModelConfig = models.find((m: any) => m.modelId === currentModelId);
      currModel = currentModelConfig?.modelName || currentModelId;
    } else if (modelsWithKeys.length > 0) {
      // 如果没有当前模型，使用第一个模型的modelName
      currModel = modelsWithKeys[0].modelName || modelsWithKeys[0].modelId;
    }

    logger.info('编辑模型配置成功', { modelId: data.modelId }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('编辑模型配置失败', error, 'WebviewMessageHandler');
    
    // 构建错误堆栈信息
    const errorStack = error instanceof Error && error.stack 
      ? error.stack 
      : String(error);
    
    // 发送错误消息，包含操作类型和错误堆栈信息
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        operationType: '编辑模型配置', // 操作类型，用于前端显示用户友好的提示
        operation: 'editModel', // 操作标识
        error: error instanceof Error ? error.message : String(error), // 错误消息
        errorStack: errorStack, // 错误堆栈信息，用于前端日志记录
        modelId: data?.modelId // 相关数据
      }
    });
  } finally {
    // 无论成功或失败，都发送刷新消息以确保前端数据与后端保持一致
    try {
      const configManager = await getConfigManager();
      const apiClient = await getAPIClient();
      
      // 获取最新的模型列表
      const models = configManager.models.getModelConfigs();
      const modelsWithKeys = await Promise.all(
        models.map(async (model: any) => {
          const apiKey = await configManager.models.getApiKey(model.modelId);
          const modelWithKey = {
            ...model,
            apiKey: apiKey || ''
          };
          // 将token单位转换为K单位显示给前端
          return processModelDataForDisplay(modelWithKey);
        })
      );
      
      // 获取当前使用的模型（modelId格式）
      const currentModelId = apiClient.getCurrentModel();
      
      // 将modelId转换为modelName（前端期望的格式）
      let currModel = '';
      if (currentModelId) {
        const currentModelConfig = models.find((m: any) => m.modelId === currentModelId);
        currModel = currentModelConfig?.modelName || currentModelId;
      } else if (modelsWithKeys.length > 0) {
        // 如果没有当前模型，使用第一个模型的modelName
        currModel = modelsWithKeys[0].modelName || modelsWithKeys[0].modelId;
      }
      
      // 发送刷新消息
      webview.postMessage({
        token: message.token || generateUUID(),
        message: MessageType.HICODE_REFRESH_MODELS_B2F_RES,
        data: {
          type: 'edit',
          models: modelsWithKeys, // settings页面期望的字段名
          modelOptions: modelsWithKeys, // chat页面期望的字段名
          currModel: currModel, // 当前模型（modelName格式）
          currentModel: currModel // 兼容字段
        }
      });
    } catch (refreshError) {
      logger.error('发送刷新消息失败', refreshError, 'WebviewMessageHandler');
    }
  }
}

/**
 * 处理删除模型配置请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleDeleteModel(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到删除模型配置请求', { message }, 'WebviewMessageHandler');

  // 在函数作用域中保存data，以便在finally块中使用
  const { data } = message;
  
  try {
    const configManager = await getConfigManager();
    const apiClient = await getAPIClient();

    if (!data.modelId) {
      throw new Error('模型ID不能为空');
    }

    // 检查是否是当前使用的模型
    const currentModel = apiClient.getCurrentModel();
    if (currentModel === data.modelId) {
      // 如果还有其他模型，切换到第一个
      const allModels = configManager.models.getModelConfigs();
      const otherModels = allModels.filter((m: any) => m.modelId !== data.modelId);
      if (otherModels.length > 0) {
        await apiClient.setCurrentModel(otherModels[0].modelId);
      } else {
        await apiClient.setCurrentModel('');
      }
    }

    // 删除模型配置
    await configManager.models.deleteModelConfig(data.modelId);

    // 获取更新后的模型列表
    const models = configManager.models.getModelConfigs();
    
    // 为每个模型获取API密钥
    const modelsWithKeys = await Promise.all(
      models.map(async (model: any) => {
        const apiKey = await configManager.models.getApiKey(model.modelId);
        return {
          ...model,
          apiKey: apiKey || ''
        };
      })
    );

    logger.info('删除模型配置成功', { modelId: data.modelId }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('删除模型配置失败', error, 'WebviewMessageHandler');
    
    // 构建错误堆栈信息
    const errorStack = error instanceof Error && error.stack 
      ? error.stack 
      : String(error);
    
    // 发送错误消息，包含操作类型和错误堆栈信息
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        operationType: '删除模型配置', // 操作类型，用于前端显示用户友好的提示
        operation: 'deleteModel', // 操作标识
        error: error instanceof Error ? error.message : String(error), // 错误消息
        errorStack: errorStack, // 错误堆栈信息，用于前端日志记录
        modelId: data?.modelId // 相关数据
      }
    });
  } finally {
    // 无论成功或失败，都发送刷新消息以确保前端数据与后端保持一致
    try {
      const configManager = await getConfigManager();
      const apiClient = await getAPIClient();
      
      // 获取最新的模型列表
      const models = configManager.models.getModelConfigs();
      const modelsWithKeys = await Promise.all(
        models.map(async (model: any) => {
          const apiKey = await configManager.models.getApiKey(model.modelId);
          const modelWithKey = {
            ...model,
            apiKey: apiKey || ''
          };
          // 将token单位转换为K单位显示给前端
          return processModelDataForDisplay(modelWithKey);
        })
      );
      
      // 获取当前使用的模型（删除后可能已切换，modelId格式）
      const currentModelIdAfterDelete = apiClient.getCurrentModel();
      
      // 将modelId转换为modelName（前端期望的格式）
      let currModelAfterDelete = '';
      if (currentModelIdAfterDelete) {
        const currentModelConfig = models.find((m: any) => m.modelId === currentModelIdAfterDelete);
        currModelAfterDelete = currentModelConfig?.modelName || currentModelIdAfterDelete;
      } else if (modelsWithKeys.length > 0) {
        // 如果没有当前模型，使用第一个模型的modelName
        currModelAfterDelete = modelsWithKeys[0].modelName || modelsWithKeys[0].modelId;
      }
      
      // 发送刷新消息
      webview.postMessage({
        token: message.token || generateUUID(),
        message: MessageType.HICODE_REFRESH_MODELS_B2F_RES,
        data: {
          type: 'delete',
          models: modelsWithKeys, // settings页面期望的字段名
          modelOptions: modelsWithKeys, // chat页面期望的字段名
          currModel: currModelAfterDelete, // 当前模型（modelName格式）
          currentModel: currModelAfterDelete // 兼容字段
        }
      });
    } catch (refreshError) {
      logger.error('发送刷新消息失败', refreshError, 'WebviewMessageHandler');
    }
  }
}

/**
 * 处理获取设置请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleGetSettings(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到获取设置请求', { message }, 'WebviewMessageHandler');

  try {
    const configManager = await getConfigManager();

    // 获取所有设置
    const models = configManager.models.getModelConfigs();
    
    // 为每个模型获取API密钥
    const modelsWithKeys = await Promise.all(
      models.map(async (model: any) => {
        const apiKey = await configManager.models.getApiKey(model.modelId);
        const modelWithKey = {
          ...model,
          apiKey: apiKey || ''
        };
        // 将token单位转换为K单位显示给前端
        return processModelDataForDisplay(modelWithKey);
      })
    );
    
    // 获取用户提示词列表
    const userPrompts = configManager.prompts.getPromptConfigs();
    
    // 获取产品级规范列表
    const specifications = configManager.specifications.getSpecificationConfigs();

    // 获取当前聊天模式
    const chatMode = configManager.getChatMode();

    // 获取当前 Agent 模式
    const agentMode = configManager.getAgentMode();

    // 获取当前使用的模型（modelId格式）
    const apiClient = await getAPIClient();
    const currentModelId = apiClient.getCurrentModel();
    
    // 将modelId转换为modelName（前端期望的格式）
    // 参考hicode项目，前端使用modelName作为currModel的值
    let currModel = '';
    if (currentModelId) {
      const currentModelConfig = models.find((m: any) => m.modelId === currentModelId);
      currModel = currentModelConfig?.modelName || currentModelId;
    } else if (modelsWithKeys.length > 0) {
      // 如果没有当前模型，使用第一个模型的modelName
      currModel = modelsWithKeys[0].modelName || modelsWithKeys[0].modelId;
    }
    
    // 发送响应，统一使用 prompts 字段以兼容不同数据结构
    // 注意：前端期望的字段名是 modelOptions 而不是 models，currModel 而不是 currentModel
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_GET_SETTINGS_B2F_RES,
      data: {
        modelOptions: modelsWithKeys, // 前端期望的字段名
        models: modelsWithKeys, // 兼容字段
        currModel: currModel, // 前端期望的字段名（modelName格式）
        currentModel: currModel, // 兼容字段
        prompts: userPrompts,
        userPrompt: userPrompts, // 兼容旧字段名
        specifications,
        chatMode: chatMode, // 当前聊天模式
        mode: chatMode, // 兼容字段
        agentMode: agentMode, // 当前 Agent 模式
      }
    });

    logger.debug('获取设置成功', { 
      modelsCount: modelsWithKeys.length, 
      promptsCount: userPrompts.length,
      specificationsCount: specifications.length 
    }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('获取设置失败', error, 'WebviewMessageHandler');
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

/**
 * 处理切换聊天模式请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleChangeMode(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到切换聊天模式请求', { message }, 'WebviewMessageHandler');

  try {
    const { data } = message;
    
    // 获取模式（前端传递的格式）
    const mode = data?.mode || data?.chatMode;
    
    if (!mode) {
      throw new Error('聊天模式不能为空');
    }

    // 验证模式值
    if (mode !== 'chat' && mode !== 'agent') {
      throw new Error('聊天模式必须是 "chat" 或 "agent"');
    }

    // 获取配置管理器
    const configManager = await getConfigManager();

    // 设置聊天模式
    await configManager.setChatMode(mode);

    // 获取更新后的当前模式
    const currentMode = configManager.getChatMode();
    
    // 发送响应到请求的webview
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_CHANGE_MODE_B2F_RES,
      data: {
        mode: currentMode,
        chatMode: currentMode, // 兼容字段
        success: true
      }
    });

    // 通知chat页面更新模式（如果chat页面已打开）
    const chatProvider = getChatWebviewProvider();
    if (chatProvider) {
      try {
        chatProvider.postMessage({
          token: generateUUID(),
          message: MessageType.HICODE_CHANGE_MODE_B2F_RES,
          data: {
            mode: currentMode,
            chatMode: currentMode,
            success: true
          }
        });
        logger.debug('已通知chat页面更新模式', { mode: currentMode }, 'WebviewMessageHandler');
      } catch (error) {
        // chat页面通知失败不影响主流程，只记录日志
        logger.warn('通知chat页面更新模式失败', error, 'WebviewMessageHandler');
      }
    }

    // 通知settings页面更新模式（如果settings页面已打开）
    try {
      SettingsWebviewProvider.sendMessage({
        token: generateUUID(),
        message: MessageType.HICODE_CHANGE_MODE_B2F_RES,
        data: {
          mode: currentMode,
          chatMode: currentMode,
          success: true
        }
      });
      logger.debug('已通知settings页面更新模式', { mode: currentMode }, 'WebviewMessageHandler');
    } catch (error) {
      // settings页面通知失败不影响主流程，只记录日志
      logger.warn('通知settings页面更新模式失败', error, 'WebviewMessageHandler');
    }

    logger.info('切换聊天模式成功', { mode: currentMode }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('切换聊天模式失败', error, 'WebviewMessageHandler');
    
    // 发送错误响应
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        operationType: '切换聊天模式',
        operation: 'changeMode',
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

/**
 * 处理切换 Agent 模式请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleChangeAgentMode(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到切换 Agent 模式请求', { message }, 'WebviewMessageHandler');

  try {
    const { data } = message;
    
    // 获取模式（前端传递的格式）
    const mode = data?.mode || data?.agentMode;
    
    if (!mode) {
      throw new Error('Agent 模式不能为空');
    }

    // 验证模式值
    if (mode !== 'chat' && mode !== 'agent') {
      throw new Error('Agent 模式必须是 "chat" 或 "agent"');
    }

    // 获取配置管理器
    const configManager = await getConfigManager();

    // 设置 Agent 模式
    await configManager.setAgentMode(mode);

    // 获取更新后的当前模式
    const currentMode = configManager.getAgentMode();
    
    // 发送响应到请求的webview
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_CHANGE_AGENT_MODE_B2F_RES,
      data: {
        mode: currentMode,
        agentMode: currentMode, // 兼容字段
        success: true
      }
    });

    // 通知chat页面更新模式（如果chat页面已打开）
    const chatProvider = getChatWebviewProvider();
    if (chatProvider) {
      try {
        chatProvider.postMessage({
          token: generateUUID(),
          message: MessageType.HICODE_CHANGE_AGENT_MODE_B2F_RES,
          data: {
            mode: currentMode,
            agentMode: currentMode,
            success: true
          }
        });
        logger.debug('已通知chat页面更新 Agent 模式', { mode: currentMode }, 'WebviewMessageHandler');
      } catch (error) {
        // chat页面通知失败不影响主流程，只记录日志
        logger.warn('通知chat页面更新 Agent 模式失败', error, 'WebviewMessageHandler');
      }
    }

    // 通知settings页面更新模式（如果settings页面已打开）
    try {
      SettingsWebviewProvider.sendMessage({
        token: generateUUID(),
        message: MessageType.HICODE_CHANGE_AGENT_MODE_B2F_RES,
        data: {
          mode: currentMode,
          agentMode: currentMode,
          success: true
        }
      });
      logger.debug('已通知settings页面更新 Agent 模式', { mode: currentMode }, 'WebviewMessageHandler');
    } catch (error) {
      // settings页面通知失败不影响主流程，只记录日志
      logger.warn('通知settings页面更新 Agent 模式失败', error, 'WebviewMessageHandler');
    }

    logger.info('切换 Agent 模式成功', { mode: currentMode }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('切换 Agent 模式失败', error, 'WebviewMessageHandler');
    
    // 发送错误响应
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        error: error instanceof Error ? error.message : String(error),
        mode: message.data?.mode
      }
    });
  }
}

/**
 * 处理获取历史记录请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleGetHistory(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到获取历史记录请求', { message }, 'WebviewMessageHandler');

  try {
    const context = await getExtensionContext();
    const { getSessionManager } = await import('../session/session');
    const sessionManager = getSessionManager(context);

    // 获取所有会话（使用新的 Session 系统）
    const sessionsList = await sessionManager.getAllSessions();

    // 转换为前端期望的格式
    const sessions = sessionsList.map((session: Session) => ({
      id: session.info.id,
      title: session.info.title,
      createdAt: new Date(session.info.created),
      updatedAt: new Date(session.info.updated),
      model: '', // 新系统中模型信息在消息中
      messages: [] // 消息需要单独获取
    }));

    // 发送响应
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_GET_HISTORY_B2F_RES,
      data: {
        sessions
      }
    });

    logger.debug('获取历史记录成功', { sessionsCount: sessions.length }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('获取历史记录失败', error, 'WebviewMessageHandler');
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

/**
 * 处理 Webview 准备就绪通知
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleWebviewReady(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.info('Webview 已准备就绪', { message }, 'WebviewMessageHandler');

  try {
    // 发送初始数据
    const configManager = await getConfigManager();
    const apiClient = await getAPIClient();

    const models = configManager.models.getModelConfigs();
    
    // 为每个模型获取API密钥
    const modelsWithKeys = await Promise.all(
      models.map(async (model: any) => {
        const apiKey = await configManager.models.getApiKey(model.modelId);
        const modelWithKey = {
          ...model,
          apiKey: apiKey || ''
        };
        // 将token单位转换为K单位显示给前端
        return processModelDataForDisplay(modelWithKey);
      })
    );
    
    // 获取用户提示词列表
    const userPrompts = configManager.prompts.getPromptConfigs();
    
    // 获取产品级规范列表
    const specifications = configManager.specifications.getSpecificationConfigs();

    // 获取当前聊天模式
    const chatMode = configManager.getChatMode();

    // 获取当前 Agent 模式
    const agentMode = configManager.getAgentMode();

    // 获取当前使用的模型（modelId格式）
    const currentModelId = apiClient.getCurrentModel();
    
    // 将modelId转换为modelName（前端期望的格式）
    // 参考hicode项目，前端使用modelName作为currModel的值
    let currModel = '';
    if (currentModelId) {
      const currentModelConfig = models.find((m: any) => m.modelId === currentModelId);
      currModel = currentModelConfig?.modelName || currentModelId;
    } else if (modelsWithKeys.length > 0) {
      // 如果没有当前模型，使用第一个模型的modelName
      currModel = modelsWithKeys[0].modelName || modelsWithKeys[0].modelId;
    }

    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_GET_SETTINGS_B2F_RES,
      data: {
        modelOptions: modelsWithKeys, // 前端期望的字段名
        models: modelsWithKeys, // 兼容字段
        currModel: currModel, // 前端期望的字段名（modelName格式）
        currentModel: currModel, // 兼容字段
        prompts: userPrompts,
        userPrompt: userPrompts, // 兼容旧字段名
        specifications,
        chatMode: chatMode, // 当前聊天模式
        mode: chatMode, // 兼容字段
        agentMode: agentMode, // 当前 Agent 模式
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('处理 Webview 准备就绪通知失败', error, 'WebviewMessageHandler');
  }
}

/**
 * 处理控制台日志
 * @param message 消息对象
 * @param webview Webview 实例
 */
export function handleConsoleLog(
  message: any,
  webview: vscode.Webview
): void {
  const { data } = message;
  logger.debug('Webview 控制台日志', { data }, 'WebviewMessageHandler');
}

/**
 * 处理新增用户提示词请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleAddUserPrompt(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到新增用户提示词请求', { message }, 'WebviewMessageHandler');

  // 在函数作用域中保存data，以便在catch块中使用
  const { data } = message;
  
  try {
    const configManager = await getConfigManager();

    // 验证必填字段
    if (!data.title || !data.prompt) {
      throw new Error('提示词标题和内容不能为空');
    }

    // 添加提示词配置
    await configManager.prompts.addPromptConfig({
      id: data.id || '', // 如果没有ID，PromptManager会自动生成
      title: data.title,
      prompt: data.prompt,
      promptType: data.promptType || 'common'
    });

    logger.info('新增用户提示词成功', { title: data.title }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('新增用户提示词失败', error, 'WebviewMessageHandler');
    
    // 构建错误堆栈信息
    const errorStack = error instanceof Error && error.stack 
      ? error.stack 
      : String(error);
    
    // 发送错误消息，包含操作类型和错误堆栈信息
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        operationType: '新增用户提示词', // 操作类型，用于前端显示用户友好的提示
        operation: 'addUserPrompt', // 操作标识
        error: error instanceof Error ? error.message : String(error), // 错误消息
        errorStack: errorStack, // 错误堆栈信息，用于前端日志记录
        promptId: data?.id // 相关数据
      }
    });
  } finally {
    // 无论成功或失败，都发送刷新消息以确保前端数据与后端保持一致
    try {
      const configManager = await getConfigManager();
      const updatedPrompts = configManager.prompts.getPromptConfigs();
      
      // 发送刷新消息，统一使用 prompts 字段以兼容不同数据结构
      webview.postMessage({
        token: message.token || generateUUID(),
        message: MessageType.HICODE_REFRESH_USER_PROMPTS_B2F_RES,
        data: {
          type: 'add',
          prompts: updatedPrompts,
          userPrompt: updatedPrompts // 兼容旧字段名
        }
      });
    } catch (refreshError) {
      logger.error('发送刷新消息失败', refreshError, 'WebviewMessageHandler');
    }
  }
}

/**
 * 处理编辑用户提示词请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleEditUserPrompt(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到编辑用户提示词请求', { message }, 'WebviewMessageHandler');

  // 在函数作用域中保存data，以便在catch块中使用
  const { data } = message;
  
  try {
    const configManager = await getConfigManager();

    if (!data.id) {
      throw new Error('提示词ID不能为空');
    }

    // 验证提示词是否存在
    const existingPrompt = configManager.prompts.getPromptConfigById(data.id);
    if (!existingPrompt) {
      throw new Error(`提示词 ${data.id} 不存在`);
    }

    // 更新提示词配置
    await configManager.prompts.updatePromptConfig(data.id, {
      title: data.title,
      prompt: data.prompt,
      promptType: data.promptType
    });

    logger.info('编辑用户提示词成功', { id: data.id }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('编辑用户提示词失败', error, 'WebviewMessageHandler');
    
    // 构建错误堆栈信息
    const errorStack = error instanceof Error && error.stack 
      ? error.stack 
      : String(error);
    
    // 发送错误消息，包含操作类型和错误堆栈信息
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        operationType: '编辑用户提示词', // 操作类型，用于前端显示用户友好的提示
        operation: 'editUserPrompt', // 操作标识
        error: error instanceof Error ? error.message : String(error), // 错误消息
        errorStack: errorStack, // 错误堆栈信息，用于前端日志记录
        promptId: data?.id // 相关数据
      }
    });
  } finally {
    // 无论成功或失败，都发送刷新消息以确保前端数据与后端保持一致
    try {
      const configManager = await getConfigManager();
      const updatedPrompts = configManager.prompts.getPromptConfigs();
      
      // 发送刷新消息，统一使用 prompts 字段以兼容不同数据结构
      webview.postMessage({
        token: message.token || generateUUID(),
        message: MessageType.HICODE_REFRESH_USER_PROMPTS_B2F_RES,
        data: {
          type: 'edit',
          prompts: updatedPrompts,
          userPrompt: updatedPrompts // 兼容旧字段名
        }
      });
    } catch (refreshError) {
      logger.error('发送刷新消息失败', refreshError, 'WebviewMessageHandler');
    }
  }
}

/**
 * 处理删除用户提示词请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleDeleteUserPrompt(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到删除用户提示词请求', { message }, 'WebviewMessageHandler');

  // 在函数作用域中保存data和targetId，以便在catch块中使用
  const { data } = message;
  const targetId = data?.id || data?.promptId;
  
  try {
    const configManager = await getConfigManager();

    // 兼容不同的数据结构：支持 id 或 promptId
    if (!targetId) {
      throw new Error('提示词ID不能为空');
    }

    // 验证提示词是否存在
    const existingPrompt = configManager.prompts.getPromptConfigById(targetId);
    if (!existingPrompt) {
      throw new Error(`提示词 ${targetId} 不存在`);
    }

    // 删除提示词配置
    await configManager.prompts.deletePromptConfig(targetId);

    logger.info('删除用户提示词成功', { id: targetId }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('删除用户提示词失败', error, 'WebviewMessageHandler');
    
    // 构建错误堆栈信息
    const errorStack = error instanceof Error && error.stack 
      ? error.stack 
      : String(error);
    
    // 发送错误消息，包含操作类型和错误堆栈信息
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        operationType: '删除用户提示词', // 操作类型，用于前端显示用户友好的提示
        operation: 'deleteUserPrompt', // 操作标识
        error: error instanceof Error ? error.message : String(error), // 错误消息
        errorStack: errorStack, // 错误堆栈信息，用于前端日志记录
        promptId: targetId // 相关数据
      }
    });
  } finally {
    // 无论成功或失败，都发送刷新消息以确保前端数据与后端保持一致
    try {
      const configManager = await getConfigManager();
      const updatedPrompts = configManager.prompts.getPromptConfigs();
      
      // 发送刷新消息，统一使用 prompts 字段以兼容不同数据结构
      webview.postMessage({
        token: message.token || generateUUID(),
        message: MessageType.HICODE_REFRESH_USER_PROMPTS_B2F_RES,
        data: {
          type: 'delete',
          prompts: updatedPrompts,
          userPrompt: updatedPrompts // 兼容旧字段名
        }
      });
    } catch (refreshError) {
      logger.error('发送刷新消息失败', refreshError, 'WebviewMessageHandler');
    }
  }
}

/**
 * 处理新增产品级规范请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleAddSpecification(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到新增产品级规范请求', { message }, 'WebviewMessageHandler');

  // 在函数作用域中保存data，以便在catch块中使用
  const { data } = message;
  
  try {
    const configManager = await getConfigManager();

    // 验证必填字段
    if (!data.name) {
      throw new Error('规范名称不能为空');
    }

    // 添加产品级规范配置
    await configManager.specifications.addSpecificationConfig({
      id: data.id || '', // 如果没有ID，SpecificationManager会自动生成
      name: data.name,
      regex: data.regex,
      action: data.action,
      content: data.content,
      state: data.state
    });

    logger.info('新增产品级规范成功', { name: data.name }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('新增产品级规范失败', error, 'WebviewMessageHandler');
    
    // 构建错误堆栈信息
    const errorStack = error instanceof Error && error.stack 
      ? error.stack 
      : String(error);
    
    // 发送错误消息，包含操作类型和错误堆栈信息
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        operationType: '新增产品级规范', // 操作类型，用于前端显示用户友好的提示
        operation: 'addSpecification', // 操作标识
        error: error instanceof Error ? error.message : String(error), // 错误消息
        errorStack: errorStack, // 错误堆栈信息，用于前端日志记录
        specificationId: data?.id // 相关数据
      }
    });
  } finally {
    // 无论成功或失败，都发送刷新消息以确保前端数据与后端保持一致
    try {
      const configManager = await getConfigManager();
      const updatedSpecifications = configManager.specifications.getSpecificationConfigs();
      
      // 发送刷新消息
      webview.postMessage({
        token: message.token || generateUUID(),
        message: MessageType.HICODE_REFRESH_SPECIFICATIONS_B2F_RES,
        data: {
          type: 'add',
          specifications: updatedSpecifications
        }
      });
    } catch (refreshError) {
      logger.error('发送刷新消息失败', refreshError, 'WebviewMessageHandler');
    }
  }
}

/**
 * 处理编辑产品级规范请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleEditSpecification(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到编辑产品级规范请求', { message }, 'WebviewMessageHandler');

  // 在函数作用域中保存data，以便在catch块中使用
  const { data } = message;
  
  try {
    const configManager = await getConfigManager();

    if (!data.id) {
      throw new Error('规范ID不能为空');
    }

    // 验证规范是否存在
    const existingSpecification = configManager.specifications.getSpecificationConfigById(data.id);
    if (!existingSpecification) {
      throw new Error(`规范 ${data.id} 不存在`);
    }

    // 更新规范配置
    await configManager.specifications.updateSpecificationConfig(data.id, {
      name: data.name,
      regex: data.regex,
      action: data.action,
      content: data.content,
      state: data.state
    });

    logger.info('编辑产品级规范成功', { id: data.id }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('编辑产品级规范失败', error, 'WebviewMessageHandler');
    
    // 构建错误堆栈信息
    const errorStack = error instanceof Error && error.stack 
      ? error.stack 
      : String(error);
    
    // 发送错误消息，包含操作类型和错误堆栈信息
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        operationType: '编辑产品级规范', // 操作类型，用于前端显示用户友好的提示
        operation: 'editSpecification', // 操作标识
        error: error instanceof Error ? error.message : String(error), // 错误消息
        errorStack: errorStack, // 错误堆栈信息，用于前端日志记录
        specificationId: data?.id // 相关数据
      }
    });
  } finally {
    // 无论成功或失败，都发送刷新消息以确保前端数据与后端保持一致
    try {
      const configManager = await getConfigManager();
      const updatedSpecifications = configManager.specifications.getSpecificationConfigs();
      
      // 发送刷新消息
      webview.postMessage({
        token: message.token || generateUUID(),
        message: MessageType.HICODE_REFRESH_SPECIFICATIONS_B2F_RES,
        data: {
          type: 'edit',
          specifications: updatedSpecifications
        }
      });
    } catch (refreshError) {
      logger.error('发送刷新消息失败', refreshError, 'WebviewMessageHandler');
    }
  }
}

/**
 * 处理清除代码选择请求
 * 
 * 当前端关闭代码展示区域时，同步取消插件端的代码选中内容
 * 将光标位置移动到选中内容的最后位置
 * 
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleClearSelection(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到清除代码选择请求', { message }, 'WebviewMessageHandler');

  try {
    // 获取当前活动的编辑器
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
      logger.debug('没有活动的编辑器，无需清除选择', {}, 'WebviewMessageHandler');
      return;
    }

    // 获取当前选择
    const selection = editor.selection;
    
    // 如果选择不为空，将光标移动到选中内容的最后位置
    if (!selection.isEmpty) {
      // 获取选中内容的结束位置
      const endPosition = selection.end;
      
      // 将光标移动到结束位置（这会清除选择）
      editor.selection = new vscode.Selection(endPosition, endPosition);
      
      // 滚动到光标位置
      editor.revealRange(new vscode.Range(endPosition, endPosition), vscode.TextEditorRevealType.InCenter);
      
      logger.debug('已清除代码选择，光标移动到结束位置', { 
        line: endPosition.line, 
        character: endPosition.character 
      }, 'WebviewMessageHandler');
    }
  } catch (error) {
    logger.error('清除代码选择失败', error, 'WebviewMessageHandler');
    // 清除选择失败不影响主流程，只记录日志
  }
}

/**
 * 处理插入代码请求
 * 
 * 在当前打开编辑器的光标位置插入代码内容
 * 如果光标选中内容，直接替换选中内容
 * 
 * @param message 消息对象，包含 content（代码内容）和 chatId
 * @param webview Webview 实例
 */
export async function handleInsertCode(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.info('收到插入代码请求', { message }, 'WebviewMessageHandler');

  try {
    const { token, data } = message;
    const content = data?.content.trim();
    const { chatId } = data || {};

    // 验证代码内容
    if (!content || typeof content !== 'string') {
      logger.warn('无效的代码内容', { data }, 'WebviewMessageHandler');
      webview.postMessage({
        token: token || generateUUID(),
        message: MessageType.HICODE_ERROR_B2F,
        data: {
          error: '代码内容不能为空',
          chatId
        }
      });
      return;
    }

    // 获取当前活动的编辑器
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
      logger.warn('没有活动的编辑器，无法插入代码', {}, 'WebviewMessageHandler');
      vscode.window.showWarningMessage('请先打开一个编辑器文件');
      return;
    }

    // 获取当前选择范围
    const selection = editor.selection;
    const originalRange = new vscode.Range(selection.start, selection.end);

    // 使用代码差异预览功能
    const { codeDiffPreview } = await import('../utils/codeDiffPreview');
    await codeDiffPreview.showDiffPreview(editor, originalRange, content);

    logger.debug('代码差异预览已显示，等待用户确认', { chatId }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('插入代码失败', error, 'WebviewMessageHandler');
    vscode.window.showErrorMessage(`插入代码失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 处理删除产品级规范请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleDeleteSpecification(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到删除产品级规范请求', { message }, 'WebviewMessageHandler');

  // 在函数作用域中保存data和targetId，以便在catch块中使用
  const { data } = message;
  const targetId = data?.id || data?.name;
  
  try {
    const configManager = await getConfigManager();
    if (!targetId) {
      throw new Error('规范ID或名称不能为空');
    }

    // 验证规范是否存在
    const existingSpecification = configManager.specifications.getSpecificationConfigById(targetId);
    if (!existingSpecification) {
      throw new Error(`规范 ${targetId} 不存在`);
    }

    // 删除规范配置
    await configManager.specifications.deleteSpecificationConfig(targetId);

    logger.info('删除产品级规范成功', { id: targetId }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('删除产品级规范失败', error, 'WebviewMessageHandler');
    
    // 构建错误堆栈信息
    const errorStack = error instanceof Error && error.stack 
      ? error.stack 
      : String(error);
    
    // 发送错误消息，包含操作类型和错误堆栈信息
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        operationType: '删除产品级规范', // 操作类型，用于前端显示用户友好的提示
        operation: 'deleteSpecification', // 操作标识
        error: error instanceof Error ? error.message : String(error), // 错误消息
        errorStack: errorStack, // 错误堆栈信息，用于前端日志记录
        specificationId: targetId // 相关数据
      }
    });
  } finally {
    // 无论成功或失败，都发送刷新消息以确保前端数据与后端保持一致
    try {
      const configManager = await getConfigManager();
      const updatedSpecifications = configManager.specifications.getSpecificationConfigs();
      
      // 发送刷新消息
      webview.postMessage({
        token: message.token || generateUUID(),
        message: MessageType.HICODE_REFRESH_SPECIFICATIONS_B2F_RES,
        data: {
          type: 'delete',
          specifications: updatedSpecifications
        }
      });
    } catch (refreshError) {
      logger.error('发送刷新消息失败', refreshError, 'WebviewMessageHandler');
    }
  }
}

/**
 * 处理获取 Provider 列表请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleGetProviders(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到获取 Provider 列表请求', { message }, 'WebviewMessageHandler');

  try {
    const configManager = await getConfigManager();
    
    // 确保 ModelManager 已初始化
    if (configManager.models && typeof (configManager.models as any).initialize === 'function') {
      await (configManager.models as any).initialize();
    }

    // 从 ModelsDev 获取所有可用的 Provider（从 models.dev 获取）
    const { ModelsDev } = await import('../config/modelsDev');
    const { getExtensionContext } = await import('../extension');
    const extensionContext = await getExtensionContext();
    
    // 获取所有 providers
    const allProviders = await ModelsDev.get(extensionContext);
    const availableProviderIDs = Object.keys(allProviders);
    
    logger.debug('从 models.dev 获取到的 Provider IDs', { 
      availableProviderIDs,
      count: availableProviderIDs.length
    }, 'WebviewMessageHandler');
    
    // 转换为前端需要的格式，包含所有可用的 Provider
    const providerList = availableProviderIDs.map((providerID: string) => {
      const provider = allProviders[providerID];
      return {
        id: providerID,
        name: provider.name || providerID,
        source: 'api' as const,
      };
    });

    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_GET_PROVIDERS_B2F_RES,
      data: {
        providers: providerList,
      },
    });

    logger.debug('获取 Provider 列表成功', { count: providerList.length }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('获取 Provider 列表失败', error, 'WebviewMessageHandler');
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/**
 * 处理获取 Provider 模型列表请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handleGetProviderModels(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到获取 Provider 模型列表请求', { message }, 'WebviewMessageHandler');

  try {
    const { data } = message;
    const providerID = data?.providerID;

    if (!providerID) {
      throw new Error('Provider ID 不能为空');
    }

    const configManager = await getConfigManager();
    
    // 确保 ModelManager 已初始化（这会加载 models.dev 数据）
    if (configManager.models && typeof (configManager.models as any).initialize === 'function') {
      await (configManager.models as any).initialize();
    }

    // 从 ModelsDev 获取该提供商的模型列表（从 models.dev 获取）
    const { ModelsDev } = await import('../config/modelsDev');
    const { getExtensionContext } = await import('../extension');
    const extensionContext = await getExtensionContext();
    
    // 映射 providerID 到 models.dev 中使用的 ID
    const modelsDevProviderID = mapProviderIDToModelsDev(providerID);
    logger.debug('获取模型列表', { 
      frontendProviderID: providerID, 
      modelsDevProviderID: modelsDevProviderID 
    }, 'WebviewMessageHandler');
    
    // 获取所有 providers（类似 opencode 的做法）
    const allProviders = await ModelsDev.get(extensionContext);
    const availableProviderIDs = Object.keys(allProviders);
    logger.debug('可用的 Provider IDs', { 
      availableProviderIDs,
      requestedProviderID: modelsDevProviderID,
      isAvailable: availableProviderIDs.includes(modelsDevProviderID)
    }, 'WebviewMessageHandler');
    
    // 直接从 allProviders 中获取指定 provider 的模型列表（类似 opencode 的 database[providerID]）
    const provider = allProviders[modelsDevProviderID];
    if (!provider) {
      logger.warn(`Provider ${modelsDevProviderID} not found in models.dev`, {
        availableProviders: availableProviderIDs,
        requestedProvider: modelsDevProviderID
      }, 'WebviewMessageHandler');
      
      // 返回空列表
      webview.postMessage({
        token: message.token || generateUUID(),
        message: MessageType.HICODE_GET_PROVIDER_MODELS_B2F_RES,
        data: {
          providerID,
          models: [],
        },
      });
      return;
    }
    
    // 获取该 provider 的所有模型
    const models = Object.values(provider.models || {});
    logger.debug('获取到的模型列表', { 
      providerID: modelsDevProviderID, 
      providerName: provider.name,
      modelCount: models.length,
      modelIds: models.map(m => m.id)
    }, 'WebviewMessageHandler');
    
    // 转换为前端需要的格式
    const modelList = models.map((model: any) => ({
      id: model.id,
      name: model.name,
      capabilities: {
        temperature: model.temperature || false,
        reasoning: model.reasoning || false,
        multimodal:
          model.modalities?.input?.includes('image') ||
          model.modalities?.input?.includes('video') ||
          model.modalities?.input?.includes('audio') ||
          false,
      },
      limits: {
        context: model.limit?.context || 0,
        output: model.limit?.output || 0,
      },
    }));

    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_GET_PROVIDER_MODELS_B2F_RES,
      data: {
        providerID,
        models: modelList,
      },
    });

    logger.debug('获取 Provider 模型列表成功', { 
      providerID, 
      modelsDevProviderID,
      count: modelList.length,
      modelNames: modelList.map(m => m.name)
    }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('获取 Provider 模型列表失败', error, 'WebviewMessageHandler');
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/**
 * 处理权限响应请求
 * @param message 消息对象
 * @param webview Webview 实例
 */
export async function handlePermissionResponse(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  logger.debug('收到权限响应请求', { message }, 'WebviewMessageHandler');

  try {
    const { requestID, response, message: feedbackMessage } = message.data || {};

    if (!requestID || !response) {
      throw new Error('缺少必要的参数：requestID 或 response');
    }

    // 获取权限管理器
    const { getPermissionManager } = await import('../permission/permission');
    const context = await getExtensionContext();
    const permissionManager = getPermissionManager(context);

    // 处理权限响应
    await permissionManager.respond(requestID, response, feedbackMessage);

    logger.debug('权限响应处理成功', { requestID, response }, 'WebviewMessageHandler');
  } catch (error) {
    logger.error('处理权限响应失败', error, 'WebviewMessageHandler');
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
