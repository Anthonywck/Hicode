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
import { getConfigManager, getAPIClient, getHistoryManager, getContextManager, getChatWebviewProvider } from '../extension';
import { MessageHandler } from './messageHandler';
import { generateUUID } from '../utils/tools';
import { SettingsWebviewProvider } from '../providers/settingsWebviewProvider';

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
    const { sessionId, chatId } = data || {};

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

    // 获取 API 客户端、历史记录管理器和上下文管理器
    const apiClient = await getAPIClient();
    const historyManager = await getHistoryManager();
    const contextManager = await getContextManager();
    const configManager = await getConfigManager();

    // 创建消息处理器
    const messageHandler = new MessageHandler(
      apiClient,
      contextManager,
      historyManager,
      {
        enableStreaming: true,
        includeContext: true
      }
    );

    // 累积响应内容
    let accumulatedContent = '';

    // 发送流式响应
    await messageHandler.handleSendStreamMessage(
      content.trim(),
      {
        // 接收到数据块时的回调
        onChunk: (chunk: string) => {
          // 确保chunk是有效的字符串，避免undefined
          const textChunk = chunk || '';
          accumulatedContent += textChunk;
          // 发送流式数据到前端
          // 前端期望的格式：{ chatId, text }
          webview.postMessage({
            token: token || generateUUID(),
            message: MessageType.HICODE_ASK_QUESTION_B2F_RES,
            data: {
              chatId: chatId || sessionId,
              text: textChunk  // 前端期望使用 text 字段，而不是 content
            }
          });
        },
        // 流结束时的回调
        onEnd: () => {
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
        includeContext: true
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
    const historyManager = await getHistoryManager();
    const apiClient = await getAPIClient();

    // 获取当前模型
    const currentModel = apiClient.getCurrentModel();
    if (!currentModel) {
      throw new Error('未选择模型，请先配置模型');
    }

    // 创建新会话（这会自动更新currentSessionId）
    const session = historyManager.createSession(currentModel);

    // 生成新的convId（用于前端标识）
    const newConvId = generateUUID();

    // 发送新会话系统消息（统一使用HICODE_NEW_CONVERSATION）
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_NEW_CONVERSATION,
      data: {
        convId: newConvId,
        sessionId: session.id,
        timestamp: new Date().toISOString()
      }
    });

    logger.debug('新建对话成功', { sessionId: session.id, convId: newConvId }, 'WebviewMessageHandler');
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

    // 步骤2: 获取所有模型配置
    const models = configManager.models.getModelConfigs();
    
    // 步骤3: 为每个模型获取API密钥（从SecretStorage中读取）
    const modelsWithKeys = await Promise.all(
      models.map(async (model: any) => {
        const apiKey = await configManager.models.getApiKey(model.modelId);
        return {
          ...model,
          apiKey: apiKey || ''
        };
      })
    );
    
    // 步骤4: 获取当前使用的模型（modelId）
    const currentModelId = apiClient.getCurrentModel();
    
    // 步骤5: 将modelId转换为modelName（前端期望的格式）
    // 参考hicode项目，前端使用modelName作为currModel的值
    let currModel = '';
    if (currentModelId) {
      const currentModelConfig = models.find((m: any) => m.modelId === currentModelId);
      currModel = currentModelConfig?.modelName || currentModelId;
    } else if (modelsWithKeys.length > 0) {
      // 如果没有当前模型，使用第一个模型的modelName
      currModel = modelsWithKeys[0].modelName || modelsWithKeys[0].modelId;
    }

    // 步骤6: 发送响应，使用前端期望的字段名
    // 注意：前端期望的字段名是 modelOptions 和 currModel（modelName格式）
    webview.postMessage({
      token: message.token || generateUUID(),
      message: MessageType.HICODE_GET_MODELS_B2F_RES,
      data: {
        modelOptions: modelsWithKeys, // 前端期望的字段名
        models: modelsWithKeys, // 兼容字段
        currModel: currModel, // 前端期望的字段名（modelName格式）
        currentModel: currModel // 兼容字段
      }
    });

    logger.debug('获取模型列表成功', { 
      count: modelsWithKeys.length, 
      currModel,
      currentModelId,
      modelIds: modelsWithKeys.map((m: any) => m.modelId),
      modelNames: modelsWithKeys.map((m: any) => m.modelName)
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

    // 添加模型配置
    await configManager.models.addModelConfig(data);

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

    // 更新模型配置
    await configManager.models.updateModelConfig(data.modelId, data);

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
          return {
            ...model,
            apiKey: apiKey || ''
          };
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
        return {
          ...model,
          apiKey: apiKey || ''
        };
      })
    );
    
    // 获取用户提示词列表
    const userPrompts = configManager.prompts.getPromptConfigs();
    
    // 获取产品级规范列表
    const specifications = configManager.specifications.getSpecificationConfigs();

    // 获取当前聊天模式
    const chatMode = configManager.getChatMode();

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
        mode: chatMode // 兼容字段
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
    const historyManager = await getHistoryManager();

    // 获取所有会话
    const sessions = historyManager.getAllSessions();

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
        return {
          ...model,
          apiKey: apiKey || ''
        };
      })
    );
    
    // 获取用户提示词列表
    const userPrompts = configManager.prompts.getPromptConfigs();
    
    // 获取产品级规范列表
    const specifications = configManager.specifications.getSpecificationConfigs();
    
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




