/**
 * 命令处理器实现
 * 所有命令的具体业务逻辑
 */

import * as vscode from 'vscode';
import {
  getInlineChatProvider,
  getContextManager,
  getSessionManager,
  getAPIClient,
  getConfigManager,
  getCompletionProvider,
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
    const sessionManager = await getSessionManager();
    const apiClient = await getAPIClient();
    const chatProvider = getChatWebviewProvider();

    // 获取当前模型
    const currentModel = apiClient.getCurrentModel();
    if (!currentModel) {
      vscode.window.showWarningMessage('未选择模型，请先配置模型');
      return;
    }

    // 创建新会话（使用新的 SessionManager API）
    const session = await sessionManager.create();

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

/**
 * 将选中的代码添加到聊天
 * 从悬浮按钮触发，将当前选中的代码添加到资源列表
 */
export async function addSelectionToChatHandler(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showWarningMessage('请先选择要添加的代码');
      return;
    }

    const document = editor.document;
    const selection = editor.selection;
    const filePath = document.uri.fsPath;
    const languageId = document.languageId;

    // 获取起始和结束行号
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    // 获取整行内容
    const startLineStart = new vscode.Position(startLine, 0);
    const endLineEnd = document.lineAt(endLine).range.end;
    const fullRange = new vscode.Range(startLineStart, endLineEnd);
    const selectedCode = document.getText(fullRange);

    // 发送添加资源事件到前端
    const provider = getChatWebviewProvider();
    if (provider) {
      provider.postMessage({
        message: MessageType.HICODE_ADD_SELECTION_TO_RESOURCES_B2F,
        data: {
          selectCode: selectedCode,
          language: languageId,
          languageId: languageId,
          filePath: filePath,
          startLine: startLine + 1,
          endLine: endLine + 1
        }
      });

      // 取消选中（清除选择）
      editor.selection = new vscode.Selection(selection.start, selection.start);

      // 聚焦到聊天视图
      await vscode.commands.executeCommand('hicode-ai-chat.focus');
      
      logger.debug('代码已添加到资源列表', {
        filePath,
        languageId,
        startLine: startLine + 1,
        endLine: endLine + 1
      }, 'CommandHandlers');
    } else {
      vscode.window.showWarningMessage('聊天界面未初始化，请先打开聊天界面');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`添加代码到聊天失败: ${error}`);
    logger.error('添加代码到聊天失败', error, 'CommandHandlers');
  }
}

/**
 * 快速编辑选中的代码
 * 从悬浮按钮触发，对选中的代码进行快速编辑
 */
export async function quickEditHandler(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showWarningMessage('请先选择要编辑的代码');
      return;
    }

    // 打开聊天界面并聚焦
    await vscode.commands.executeCommand('hicode-ai-chat.focus');

    // 获取选中代码信息
    const document = editor.document;
    const selection = editor.selection;
    const filePath = document.uri.fsPath;
    const languageId = document.languageId;

    const startLine = selection.start.line;
    const endLine = selection.end.line;

    const startLineStart = new vscode.Position(startLine, 0);
    const endLineEnd = document.lineAt(endLine).range.end;
    const fullRange = new vscode.Range(startLineStart, endLineEnd);
    const selectedCode = document.getText(fullRange);

    // 发送快速编辑请求到前端
    const provider = getChatWebviewProvider();
    if (provider) {
      provider.postMessage({
        message: MessageType.HICODE_SELECTION_CHANGE,
        data: {
          selectCode: selectedCode,
          language: languageId,
          languageId: languageId,
          filePath: filePath,
          startLine: startLine + 1,
          endLine: endLine + 1,
          quickEdit: true // 标记为快速编辑模式
        }
      });

      // 可以在这里自动填充一个编辑提示词
      // 例如："请帮我优化/重构以下代码："
      logger.debug('快速编辑已触发', {
        filePath,
        languageId,
        startLine: startLine + 1,
        endLine: endLine + 1
      }, 'CommandHandlers');
    } else {
      vscode.window.showWarningMessage('聊天界面未初始化，请先打开聊天界面');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`快速编辑失败: ${error}`);
    logger.error('快速编辑失败', error, 'CommandHandlers');
  }
}

/**
 * 测试选择按钮显示（调试用）
 */
export async function testSelectionButtonsHandler(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    const hasSelection = editor && !editor.selection.isEmpty;

    vscode.window.showInformationMessage(
      `测试按钮状态: ${hasSelection ? '有选择' : '无选择'}`,
      { modal: false }
    );

    // 尝试手动触发按钮显示
    if (hasSelection) {
      // 导入 SelectionActionWidget 并手动触发
      const { SelectionActionWidget } = await import('../utils/selectionActionWidget');
      // 这里我们需要访问全局实例，但为了测试，我们直接显示信息
      vscode.window.showInformationMessage(
        `选中了 ${editor.selection.end.line - editor.selection.start.line + 1} 行代码`,
        { modal: false }
      );
    }

    console.log('[Test] Selection buttons test', {
      hasEditor: !!editor,
      hasSelection: hasSelection,
      selection: editor?.selection
    });
  } catch (error) {
    vscode.window.showErrorMessage(`测试失败: ${error}`);
    logger.error('测试选择按钮失败', error, 'CommandHandlers');
  }
}