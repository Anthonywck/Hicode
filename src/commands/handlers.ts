/**
 * 命令处理器实现
 * 所有命令的具体业务逻辑
 */

import * as vscode from 'vscode';
import {
  getInlineChatProvider,
  getContextManager,
  getHistoryManager,
  getAPIClient,
  getConfigManager,
  getCompletionProvider,
  getAgentSystem,
  getChatWebviewProvider
} from '../index';
import { logger } from '../utils/logger';
import * as MessageType from '../utils/messageType';

// 全局扩展上下文，在 extension.ts 中设置
let extensionContext: vscode.ExtensionContext | null = null;

/**
 * 设置扩展上下文（由 extension.ts 调用）
 * @param context VS Code 扩展上下文
 */
export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

/**
 * 获取扩展上下文
 * @returns VS Code 扩展上下文
 */
export function getExtensionContext(): vscode.ExtensionContext {
  if (!extensionContext) {
    throw new Error('Extension context not set. Call setExtensionContext() first.');
  }
  return extensionContext;
}

/**
 * 显示内联聊天
 */
export async function showInlineChatHandler(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先打开一个文件');
      return;
    }

    vscode.window.showInformationMessage('HiCode: 内联聊天 - 功能开发中');
    console.log('Show inline chat command triggered');
    
    // TODO: 实现内联聊天功能
    // const provider = await getInlineChatProvider();
    // await provider.showInlineChat(editor, editor.selection);
  } catch (error) {
    vscode.window.showErrorMessage(`显示内联聊天失败: ${error}`);
    console.error('Error in showInlineChatHandler:', error);
  }
}

/**
 * 快速重构
 */
export async function quickRefactorHandler(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showWarningMessage('请先选择要重构的代码');
      return;
    }

    vscode.window.showInformationMessage('HiCode: 快速重构 - 功能开发中');
    console.log('Quick refactor command triggered');
    
    // TODO: 实现快速重构功能
  } catch (error) {
    vscode.window.showErrorMessage(`快速重构失败: ${error}`);
    console.error('Error in quickRefactorHandler:', error);
  }
}

/**
 * 生成测试
 */
export async function quickTestHandler(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showWarningMessage('请先选择要生成测试的代码');
      return;
    }

    vscode.window.showInformationMessage('HiCode: 生成测试 - 功能开发中');
    console.log('Quick test command triggered');
    
    // TODO: 实现生成测试功能
  } catch (error) {
    vscode.window.showErrorMessage(`生成测试失败: ${error}`);
    console.error('Error in quickTestHandler:', error);
  }
}

/**
 * 解释代码
 */
export async function quickExplainHandler(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showWarningMessage('请先选择要解释的代码');
      return;
    }

    vscode.window.showInformationMessage('HiCode: 解释代码 - 功能开发中');
    console.log('Quick explain command triggered');
    
    // TODO: 实现解释代码功能
  } catch (error) {
    vscode.window.showErrorMessage(`解释代码失败: ${error}`);
    console.error('Error in quickExplainHandler:', error);
  }
}

/**
 * 生成文档
 */
export async function quickDocHandler(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showWarningMessage('请先选择要生成文档的代码');
      return;
    }

    vscode.window.showInformationMessage('HiCode: 生成文档 - 功能开发中');
    console.log('Quick doc command triggered');
    
    // TODO: 实现生成文档功能
  } catch (error) {
    vscode.window.showErrorMessage(`生成文档失败: ${error}`);
    console.error('Error in quickDocHandler:', error);
  }
}

/**
 * 修复代码
 */
export async function quickFixHandler(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showWarningMessage('请先选择要修复的代码');
      return;
    }

    vscode.window.showInformationMessage('HiCode: 修复代码 - 功能开发中');
    console.log('Quick fix command triggered');
    
    // TODO: 实现修复代码功能
  } catch (error) {
    vscode.window.showErrorMessage(`修复代码失败: ${error}`);
    console.error('Error in quickFixHandler:', error);
  }
}

/**
 * 优化代码
 */
export async function quickOptimizeHandler(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showWarningMessage('请先选择要优化的代码');
      return;
    }

    vscode.window.showInformationMessage('HiCode: 优化代码 - 功能开发中');
    console.log('Quick optimize command triggered');
    
    // TODO: 实现优化代码功能
  } catch (error) {
    vscode.window.showErrorMessage(`优化代码失败: ${error}`);
    console.error('Error in quickOptimizeHandler:', error);
  }
}

/**
 * 打开聊天
 */
export async function openChatHandler(): Promise<void> {
  try {
    // 执行命令聚焦到聊天视图
    await vscode.commands.executeCommand('hicode-ai-chat.focus');
    console.log('Open chat command triggered - chat view focused');
  } catch (error) {
    vscode.window.showErrorMessage(`打开聊天失败: ${error}`);
    console.error('Error in openChatHandler:', error);
  }
}

/**
 * 新建对话
 */
export async function newConversationHandler(): Promise<void> {
  try {
    const historyManager = await getHistoryManager();
    const apiClient = await getAPIClient();
    const chatProvider = getChatWebviewProvider();

    // 获取当前模型
    const currentModel = apiClient.getCurrentModel();
    if (!currentModel) {
      vscode.window.showWarningMessage('未选择模型，请先配置模型');
      return;
    }

    // 创建新会话（这会自动更新currentSessionId并清空当前会话的消息）
    const session = historyManager.createSession(currentModel);

    // 生成新的convId（用于前端标识）
    const { generateUUID } = await import('../utils/tools');
    const newConvId = generateUUID();

    // 发送新会话系统消息给前端
    if (chatProvider) {
      chatProvider.postMessage({
        message: MessageType.HICODE_NEW_CONVERSATION,
        data: {
          convId: newConvId,
          sessionId: session.id,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.debug('新建对话成功', { sessionId: session.id, convId: newConvId }, 'CommandHandlers');
  } catch (error) {
    vscode.window.showErrorMessage(`新建对话失败: ${error}`);
    logger.error('新建对话失败', error, 'CommandHandlers');
  }
}

/**
 * 显示历史记录
 */
export async function showHistoryHandler(): Promise<void> {
  try {
    vscode.window.showInformationMessage('HiCode: 显示历史记录 - 功能开发中');
    console.log('Show history command triggered');
    
    // TODO: 实现显示历史记录功能
  } catch (error) {
    vscode.window.showErrorMessage(`显示历史记录失败: ${error}`);
    console.error('Error in showHistoryHandler:', error);
  }
}

/**
 * 切换模型
 */
export async function switchModelHandler(): Promise<void> {
  try {
    vscode.window.showInformationMessage('HiCode: 切换模型 - 功能开发中');
    console.log('Switch model command triggered');
    
    // TODO: 实现切换模型功能
  } catch (error) {
    vscode.window.showErrorMessage(`切换模型失败: ${error}`);
    console.error('Error in switchModelHandler:', error);
  }
}

/**
 * 配置模型
 * 打开设置页面进行模型配置
 */
export async function configureModelsHandler(): Promise<void> {
  try {
    const context = getExtensionContext();
    // 动态导入 SettingsWebviewProvider 以避免循环依赖
    const { SettingsWebviewProvider } = await import('../providers/settingsWebviewProvider');
    SettingsWebviewProvider.openSettingsWebview(context);
    console.log('Configure models command triggered - settings page opened');
  } catch (error) {
    vscode.window.showErrorMessage(`配置模型失败: ${error}`);
    console.error('Error in configureModelsHandler:', error);
  }
}

/**
 * 打开设置页面
 * 用于打开 HiCode 的设置页面
 */
export async function openSettingsHandler(): Promise<void> {
  try {
    const context = getExtensionContext();
    // 动态导入 SettingsWebviewProvider 以避免循环依赖
    const { SettingsWebviewProvider } = await import('../providers/settingsWebviewProvider');
    SettingsWebviewProvider.openSettingsWebview(context);
    console.log('Open settings command triggered - settings page opened');
  } catch (error) {
    vscode.window.showErrorMessage(`打开设置页面失败: ${error}`);
    console.error('Error in openSettingsHandler:', error);
  }
}

/**
 * 触发代码补全
 */
export async function triggerCompletionHandler(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先打开一个文件');
      return;
    }

    vscode.window.showInformationMessage('HiCode: 触发补全 - 功能开发中');
    console.log('Trigger completion command triggered');
    
    // TODO: 实现触发补全功能
  } catch (error) {
    vscode.window.showErrorMessage(`触发补全失败: ${error}`);
    console.error('Error in triggerCompletionHandler:', error);
  }
}

/**
 * 撤销 Agent 操作
 */
export async function undoAgentActionHandler(): Promise<void> {
  try {
    vscode.window.showInformationMessage('HiCode: 撤销 Agent 操作 - 功能开发中');
    console.log('Undo agent action command triggered');
    
    // TODO: 实现撤销 Agent 操作功能
  } catch (error) {
    vscode.window.showErrorMessage(`撤销操作失败: ${error}`);
    console.error('Error in undoAgentActionHandler:', error);
  }
}
