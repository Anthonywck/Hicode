/**
 * Webview 消息路由分发器
 * 
 * 负责将来自 Webview 的消息路由到对应的处理器
 * 这是前后端交互的核心入口，所有来自 Webview 的消息都会经过这里
 * 
 * 设计模式：
 * - 使用消息类型常量进行路由分发
 * - 统一错误处理
 * - 统一日志记录
 */

import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import * as MessageType from '../utils/messageType';
import {
  handleAskQuestion,
  handleNewChat,
  handleGetModels,
  handleChangeModel,
  handleChangeMode,
  handleChangeAgentMode,
  handleAddModel,
  handleEditModel,
  handleDeleteModel,
  handleGetSettings,
  handleGetHistory,
  handleWebviewReady,
  handleConsoleLog,
  handleAddUserPrompt,
  handleEditUserPrompt,
  handleDeleteUserPrompt,
  handleAddSpecification,
  handleEditSpecification,
  handleDeleteSpecification,
  handleClearSelection,
  handleInsertCode
} from './webviewMessageHandler';

/**
 * 消息对象接口
 */
export interface WebviewMessage {
  /** 消息类型（对应 MessageType 中的常量） */
  message?: string;
  /** 命令类型（兼容旧格式） */
  command?: string;
  /** 请求 token，用于匹配请求和响应 */
  token?: string;
  /** 消息数据 */
  data?: any;
}

/**
 * 处理来自 Webview 的消息
 * 
 * 这是消息路由的入口函数，所有来自 Webview 的消息都会经过这里
 * 根据消息类型（message 或 command 字段）路由到对应的处理器
 * 
 * @param message 接收到的消息对象
 * @param webview Webview 实例，用于发送响应
 */
export function routeWebviewMessage(
  message: WebviewMessage,
  webview: vscode.Webview
): void {
  // 记录收到的消息（调试用）
  logger.debug('收到 Webview 消息', { message }, 'WebviewMessageRouter');

  try {
    // 获取消息类型（优先使用 message 字段，兼容 command 字段）
    const messageType = message.message || message.command;

    if (!messageType) {
      logger.warn('收到无类型消息', { message }, 'WebviewMessageRouter');
      return;
    }

    // 根据消息类型路由到对应的处理器
    switch (messageType) {
      // ========== 聊天相关消息 ==========
      case MessageType.HICODE_ASK_QUESTION_F2B_REQ:
        handleAskQuestion(message, webview).catch(error => {
          logger.error('处理聊天消息失败', error, 'WebviewMessageRouter');
        });
        break;

      case MessageType.HICODE_NEW_CHAT_F2B_REQ:
        handleNewChat(message, webview).catch(error => {
          logger.error('处理新建对话失败', error, 'WebviewMessageRouter');
        });
        break;

      // ========== 模型配置相关消息 ==========
      case MessageType.HICODE_GET_MODELS_F2B_REQ:
        handleGetModels(message, webview).catch(error => {
          logger.error('处理获取模型列表失败', error, 'WebviewMessageRouter');
        });
        break;

      case MessageType.HICODE_CHANGE_MODEL_F2B_REQ:
        handleChangeModel(message, webview).catch(error => {
          logger.error('处理切换模型失败', error, 'WebviewMessageRouter');
        });
        break;

      case MessageType.HICODE_CHANGE_MODE_F2B_REQ:
        handleChangeMode(message, webview).catch(error => {
          logger.error('处理切换聊天模式失败', error, 'WebviewMessageRouter');
        });
        break;

      case MessageType.HICODE_CHANGE_AGENT_MODE_F2B_REQ:
        handleChangeAgentMode(message, webview).catch(error => {
          logger.error('处理切换 Agent 模式失败', error, 'WebviewMessageRouter');
        });
        break;

      case MessageType.HICODE_ADD_MODEL_F2B_REQ:
        handleAddModel(message, webview).catch(error => {
          logger.error('处理新增模型配置失败', error, 'WebviewMessageRouter');
        });
        break;

      case MessageType.HICODE_EDIT_MODEL_F2B_REQ:
        handleEditModel(message, webview).catch(error => {
          logger.error('处理编辑模型配置失败', error, 'WebviewMessageRouter');
        });
        break;

      case MessageType.HICODE_DELETE_MODEL_F2B_REQ:
        handleDeleteModel(message, webview).catch(error => {
          logger.error('处理删除模型配置失败', error, 'WebviewMessageRouter');
        });
        break;

      // ========== 设置相关消息 ==========
      case MessageType.HICODE_GET_SETTINGS_F2B_REQ:
        handleGetSettings(message, webview).catch(error => {
          logger.error('处理获取设置失败', error, 'WebviewMessageRouter');
        });
        break;

      // ========== 用户提示词相关消息 ==========
      case MessageType.HICODE_ADD_USER_PROMPT_F2B_REQ:
        handleAddUserPrompt(message, webview).catch(error => {
          logger.error('处理新增用户提示词失败', error, 'WebviewMessageRouter');
        });
        break;

      case MessageType.HICODE_EDIT_USER_PROMPT_F2B_REQ:
        handleEditUserPrompt(message, webview).catch(error => {
          logger.error('处理编辑用户提示词失败', error, 'WebviewMessageRouter');
        });
        break;

      case MessageType.HICODE_DELETE_USER_PROMPT_F2B_REQ:
        handleDeleteUserPrompt(message, webview).catch(error => {
          logger.error('处理删除用户提示词失败', error, 'WebviewMessageRouter');
        });
        break;

      // ========== 产品级规范相关消息 ==========
      case MessageType.HICODE_ADD_SPECIFICATION_F2B_REQ:
        handleAddSpecification(message, webview).catch(error => {
          logger.error('处理新增产品级规范失败', error, 'WebviewMessageRouter');
        });
        break;

      case MessageType.HICODE_EDIT_SPECIFICATION_F2B_REQ:
        handleEditSpecification(message, webview).catch(error => {
          logger.error('处理编辑产品级规范失败', error, 'WebviewMessageRouter');
        });
        break;

      case MessageType.HICODE_DELETE_SPECIFICATION_F2B_REQ:
        handleDeleteSpecification(message, webview).catch(error => {
          logger.error('处理删除产品级规范失败', error, 'WebviewMessageRouter');
        });
        break;

      // ========== 历史记录相关消息 ==========
      case MessageType.HICODE_GET_HISTORY_F2B_REQ:
        handleGetHistory(message, webview).catch(error => {
          logger.error('处理获取历史记录失败', error, 'WebviewMessageRouter');
        });
        break;

      // ========== 代码选择相关消息 ==========
      case MessageType.HICODE_CLEAR_SELECTION:
        // 兼容旧的 clearSelected 命令
        handleClearSelection(message, webview).catch(error => {
          logger.error('处理清除代码选择失败', error, 'WebviewMessageRouter');
        });
        break;

      // ========== 代码操作相关消息 ==========
      case MessageType.HICODE_INSERT_CODE_F2B_REQ:
        logger.info('路由到插入代码处理器', { messageType, message }, 'WebviewMessageRouter');
        handleInsertCode(message, webview).catch(error => {
          logger.error('处理插入代码失败', error, 'WebviewMessageRouter');
        });
        break;

      // ========== 系统消息 ==========
      case MessageType.HICODE_WEBVIEW_READY:
      case 'ready':
      case 'webviewReady':
        // 兼容多种格式的 ready 消息
        handleWebviewReady(message, webview).catch(error => {
          logger.error('处理 Webview 准备就绪失败', error, 'WebviewMessageRouter');
        });
        break;

      case MessageType.HICODE_CONSOLE_LOG:
      case 'log':
        // 处理控制台日志
        handleConsoleLog(message, webview);
        break;

      // ========== 兼容旧格式的消息 ==========
      case 'sendMessage':
        // 兼容旧的 sendMessage 命令
        handleAskQuestion(
          {
            ...message,
            message: MessageType.HICODE_ASK_QUESTION_F2B_REQ,
            data: message.data
          },
          webview
        ).catch(error => {
          logger.error('处理发送消息失败', error, 'WebviewMessageRouter');
        });
        break;

      case 'error':
        // 处理来自 Webview 的错误报告
        logger.error('Webview 报告错误', message.data , 'WebviewMessageRouter');
        vscode.window.showErrorMessage(
          `聊天界面错误: ${message.data || '未知错误'}`
        );
        break;

      default:
        // 未知消息类型
        logger.warn('未知的消息类型', { messageType, message }, 'WebviewMessageRouter');
        break;
    }
  } catch (error) {
    // 统一错误处理
    logger.error('路由消息时发生错误', error, 'WebviewMessageRouter');
    
    // 获取消息类型用于错误响应
    const messageType = message.message || message.command;
    
    // 发送错误响应到 Webview
    webview.postMessage({
      token: message.token,
      message: MessageType.HICODE_ERROR_B2F,
      data: {
        error: error instanceof Error ? error.message : String(error),
        originalMessage: messageType
      }
    });
  }
}

/**
 * 向 Webview 发送消息
 * 
 * 这是向后端发送消息的统一接口
 * 
 * @param webview Webview 实例
 * @param message 要发送的消息对象
 */
export function sendMessageToWebview(
  webview: vscode.Webview,
  message: WebviewMessage
): void {
  try {
    logger.debug('向 Webview 发送消息', { message }, 'WebviewMessageRouter');
    webview.postMessage(message);
  } catch (error) {
    logger.error('发送消息到 Webview 失败', error, 'WebviewMessageRouter');
  }
}

