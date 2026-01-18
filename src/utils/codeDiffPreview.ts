/**
 * 代码差异预览工具
 * 
 * 实现代码对比效果：
 * - 红色背景显示被删除的内容（在上方，带删除线）
 * - 绿色背景显示新插入的内容（在下方）
 * - CodeLens 按钮支持点击操作
 */

import * as vscode from 'vscode';
import { logger } from './logger';

/**
 * 代码差异预览会话
 */
interface DiffPreviewSession {
  /** 会话 ID */
  id: string;
  /** 编辑器实例 */
  editor: vscode.TextEditor;
  /** 文档 URI */
  documentUri: vscode.Uri;
  /** 原始内容 */
  originalContent: string;
  /** 新内容 */
  newContent: string;
  /** 原始插入位置 */
  insertPosition: vscode.Position;
  /** 删除内容的行范围（红色区域） */
  deletedLinesRange: { start: number; end: number };
  /** 新内容的行范围（绿色区域） */
  insertedLinesRange: { start: number; end: number };
  /** 删除内容装饰器 */
  deletedDecoration: vscode.TextEditorDecorationType;
  /** 插入内容装饰器 */
  insertedDecoration: vscode.TextEditorDecorationType;
}

/**
 * CodeLens 提供器
 */
class DiffCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  
  private targetUri: vscode.Uri | null = null;
  private targetLine: number = 0;

  setTarget(uri: vscode.Uri, line: number): void {
    this.targetUri = uri;
    this.targetLine = line;
    this._onDidChangeCodeLenses.fire();
  }

  clearTarget(): void {
    this.targetUri = null;
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.targetUri || document.uri.toString() !== this.targetUri.toString()) {
      return [];
    }

    // 目标行：如果超出文档范围，使用最后一行
    // CodeLens 显示在指定行的上方，所以要显示在某行下面，需要指定下一行
    let line = this.targetLine;
    if (line >= document.lineCount) {
      // 如果目标行超出范围，说明是文件末尾，使用最后一行
      line = document.lineCount - 1;
    }


    
    const range = new vscode.Range(line, 0, line, 0);
    
    return [
      new vscode.CodeLens(range, {
        title: '✓ 保留修改 (Ctrl+Shift+Y)',
        command: 'hicode.confirmCodeChange',
        tooltip: '确认并保留代码修改'
      }),
      new vscode.CodeLens(range, {
        title: '✗ 撤销修改 (Ctrl+Shift+N)',
        command: 'hicode.cancelCodeChange',
        tooltip: '撤销代码修改，恢复原始内容'
      })
    ];
  }
}

/**
 * 代码差异预览管理器
 */
class CodeDiffPreviewManager {
  /** 当前活动的预览会话 */
  private activeSession: DiffPreviewSession | null = null;
  
  /** CodeLens 提供器 */
  private codeLensProvider: DiffCodeLensProvider;
  
  /** CodeLens 注册 */
  private codeLensRegistration: vscode.Disposable | null = null;
  
  /** 文档变化监听器 */
  private documentChangeListener: vscode.Disposable | null = null;
  
  /** 是否正在执行内部编辑 */
  private isInternalEdit: boolean = false;

  constructor() {
    this.codeLensProvider = new DiffCodeLensProvider();
  }

  /**
   * 初始化（注册 CodeLens 和监听器）
   */
  initialize(context: vscode.ExtensionContext): void {
    // 注册 CodeLens 提供器
    this.codeLensRegistration = vscode.languages.registerCodeLensProvider(
      { scheme: 'file' },
      this.codeLensProvider
    );
    context.subscriptions.push(this.codeLensRegistration);
    
    // 监听文档变化，当用户手动编辑时清理装饰器
    this.documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      this.onDocumentChange(event);
    });
    context.subscriptions.push(this.documentChangeListener);
    
    logger.info('CodeLens 提供器和文档监听器已注册', {}, 'CodeDiffPreview');
  }

  /**
   * 处理文档变化
   */
  private onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    // 如果是内部编辑，忽略
    if (this.isInternalEdit) {
      return;
    }
    
    // 如果没有活动会话，忽略
    if (!this.activeSession) {
      return;
    }
    
    // 如果不是当前会话的文档，忽略
    if (event.document.uri.toString() !== this.activeSession.documentUri.toString()) {
      return;
    }
    
    // 用户手动编辑了文档，清理装饰器
    logger.info('检测到用户手动编辑，清理装饰器', {}, 'CodeDiffPreview');
    this.clearDecorations();
  }

  /**
   * 清理装饰器（不执行编辑操作）
   */
  private clearDecorations(): void {
    if (this.activeSession) {
      this.activeSession.deletedDecoration.dispose();
      this.activeSession.insertedDecoration.dispose();
      this.codeLensProvider.clearTarget();
      this.activeSession = null;
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `diff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 显示代码差异预览
   */
  async showDiffPreview(
    editor: vscode.TextEditor,
    originalRange: vscode.Range,
    newContent: string
  ): Promise<string> {
    // 如果有活动会话，先清理
    if (this.activeSession) {
      this.clearDecorations();
    }

    const sessionId = this.generateId();
    const document = editor.document;
    
    // 获取原始内容
    const originalContent = document.getText(originalRange);
    const insertPosition = originalRange.start;
    
    // 准备要插入的内容
    let contentToInsert = '';
    let deletedLinesCount = 0;
    
    // 如果有原始内容，先添加删除的内容（红色显示）
    if (originalContent) {
      const deletedLines = originalContent.split('\n');
      deletedLinesCount = deletedLines.length;
      contentToInsert = originalContent + '\n';
    }
    
    // 添加新内容
    contentToInsert += newContent;
    
    // 标记为内部编辑
    this.isInternalEdit = true;
    
    // 执行替换操作
    await editor.edit((editBuilder) => {
      if (originalRange.isEmpty) {
        editBuilder.insert(insertPosition, newContent);
      } else {
        editBuilder.replace(originalRange, contentToInsert);
      }
    });
    
    // 取消内部编辑标记
    this.isInternalEdit = false;

    // 计算删除内容的行范围（红色）
    const deletedStartLine = insertPosition.line;
    const deletedEndLine = deletedStartLine + deletedLinesCount - 1;
    
    // 计算新内容的行范围（绿色）
    const insertedStartLine = originalContent ? deletedEndLine + 1 : insertPosition.line;
    const newLines = newContent.split('\n');
    const insertedEndLine = insertedStartLine + newLines.length - 1;

    // 创建装饰器
    const deletedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 80, 80, 0.25)',
      isWholeLine: true,
      overviewRulerColor: 'rgba(255, 0, 0, 0.7)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      textDecoration: 'line-through',
      opacity: '0.6',
    });

    const insertedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(80, 200, 80, 0.25)',
      isWholeLine: true,
      overviewRulerColor: 'rgba(0, 255, 0, 0.7)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });

    // 应用删除内容装饰器（红色）
    if (originalContent && deletedLinesCount > 0) {
      const deletedRanges: vscode.DecorationOptions[] = [];
      for (let line = deletedStartLine; line <= deletedEndLine; line++) {
        if (line < editor.document.lineCount) {
          deletedRanges.push({
            range: new vscode.Range(line, 0, line, editor.document.lineAt(line).text.length)
          });
        }
      }
      editor.setDecorations(deletedDecoration, deletedRanges);
    }

    // 应用插入内容装饰器（绿色）
    const insertedRanges: vscode.DecorationOptions[] = [];
    for (let line = insertedStartLine; line <= insertedEndLine; line++) {
      if (line < editor.document.lineCount) {
        insertedRanges.push({
          range: new vscode.Range(line, 0, line, editor.document.lineAt(line).text.length)
        });
      }
    }
    editor.setDecorations(insertedDecoration, insertedRanges);

    // 设置 CodeLens 目标（在绿色区域最后一行的下一行显示，这样按钮会显示在最后一行下面）
    this.codeLensProvider.setTarget(document.uri, insertedEndLine + 1);

    // 保存会话
    this.activeSession = {
      id: sessionId,
      editor,
      documentUri: document.uri,
      originalContent,
      newContent,
      insertPosition,
      deletedLinesRange: { start: deletedStartLine, end: deletedEndLine },
      insertedLinesRange: { start: insertedStartLine, end: insertedEndLine },
      deletedDecoration,
      insertedDecoration,
    };

    // 滚动到预览位置
    editor.revealRange(
      new vscode.Range(insertedStartLine, 0, insertedEndLine, 0),
      vscode.TextEditorRevealType.InCenter
    );

    logger.info('代码差异预览已显示', { 
      sessionId, 
      deletedLines: originalContent ? `${deletedStartLine}-${deletedEndLine}` : 'none',
      insertedLines: `${insertedStartLine}-${insertedEndLine}`,
    }, 'CodeDiffPreview');

    return sessionId;
  }

  /**
   * 确认修改（保留新内容，删除红色区域）
   */
  async confirmPreview(): Promise<boolean> {
    if (!this.activeSession) {
      logger.warn('没有活动的预览会话', {}, 'CodeDiffPreview');
      return false;
    }

    const session = this.activeSession;

    try {
      // 清理装饰器和 CodeLens
      session.deletedDecoration.dispose();
      session.insertedDecoration.dispose();
      this.codeLensProvider.clearTarget();
      
      const editor = session.editor;
      
      // 如果有删除的内容（红色区域），需要删除它
      if (session.originalContent && session.deletedLinesRange.start <= session.deletedLinesRange.end) {
        // 标记为内部编辑
        this.isInternalEdit = true;
        
        await editor.edit((editBuilder) => {
          // 删除红色区域的行（包括换行符）
          const deleteRange = new vscode.Range(
            new vscode.Position(session.deletedLinesRange.start, 0),
            new vscode.Position(session.deletedLinesRange.end + 1, 0)
          );
          editBuilder.delete(deleteRange);
        });
        
        this.isInternalEdit = false;
      }

      // 清理会话
      this.activeSession = null;

      // 格式化新插入的代码
      const formatStartLine = session.insertPosition.line;
      const newLines = session.newContent.split('\n');
      const formatEndLine = formatStartLine + newLines.length - 1;
      
      if (formatEndLine < editor.document.lineCount) {
        try {
          const formatRange = new vscode.Range(
            new vscode.Position(formatStartLine, 0),
            new vscode.Position(formatEndLine, editor.document.lineAt(formatEndLine).text.length)
          );
          editor.selection = new vscode.Selection(formatRange.start, formatRange.end);
          await vscode.commands.executeCommand('editor.action.formatSelection');
          
          // 取消选中
          const newEndPosition = editor.selection.end;
          editor.selection = new vscode.Selection(newEndPosition, newEndPosition);
        } catch (formatError) {
          logger.warn('代码格式化失败', formatError, 'CodeDiffPreview');
        }
      }

      logger.info('代码修改已确认', { sessionId: session.id }, 'CodeDiffPreview');
      vscode.window.showInformationMessage('✓ 代码修改已保留');
      return true;
    } catch (error) {
      logger.error('确认预览失败', error, 'CodeDiffPreview');
      this.isInternalEdit = false;
      return false;
    }
  }

  /**
   * 取消预览（撤销修改，恢复原始内容）
   */
  async cancelPreview(): Promise<boolean> {
    if (!this.activeSession) {
      logger.warn('没有活动的预览会话', {}, 'CodeDiffPreview');
      return false;
    }

    const session = this.activeSession;

    try {
      // 清理装饰器和 CodeLens
      session.deletedDecoration.dispose();
      session.insertedDecoration.dispose();
      this.codeLensProvider.clearTarget();

      const editor = session.editor;
      
      // 计算完整的预览范围（红色 + 绿色）
      const startLine = session.originalContent 
        ? session.deletedLinesRange.start 
        : session.insertedLinesRange.start;
      const endLine = session.insertedLinesRange.end;
      
      const deleteRange = new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
      );
      
      // 标记为内部编辑
      this.isInternalEdit = true;
      
      await editor.edit((editBuilder) => {
        editBuilder.replace(deleteRange, session.originalContent);
      });
      
      this.isInternalEdit = false;

      // 清理会话
      this.activeSession = null;

      logger.info('代码修改已撤销', { sessionId: session.id }, 'CodeDiffPreview');
      vscode.window.showInformationMessage('✗ 代码修改已撤销');
      return true;
    } catch (error) {
      logger.error('取消预览失败', error, 'CodeDiffPreview');
      this.isInternalEdit = false;
      return false;
    }
  }

  /**
   * 检查是否有活动的预览会话
   */
  hasActiveSession(): boolean {
    return this.activeSession !== null;
  }

  /**
   * 获取当前活动会话
   */
  getActiveSession(): DiffPreviewSession | null {
    return this.activeSession;
  }

  /**
   * 清理所有资源
   */
  dispose(): void {
    this.clearDecorations();
    if (this.codeLensRegistration) {
      this.codeLensRegistration.dispose();
    }
    if (this.documentChangeListener) {
      this.documentChangeListener.dispose();
    }
  }
}

// 导出单例实例
export const codeDiffPreview = new CodeDiffPreviewManager();

/**
 * 注册代码差异预览相关命令
 * @param context 扩展上下文
 */
export function registerDiffPreviewCommands(context: vscode.ExtensionContext): void {
  // 初始化 CodeLens 和监听器
  codeDiffPreview.initialize(context);

  // 注册确认修改命令
  const confirmCommand = vscode.commands.registerCommand('hicode.confirmCodeChange', async () => {
    await codeDiffPreview.confirmPreview();
  });

  // 注册撤销修改命令
  const cancelCommand = vscode.commands.registerCommand('hicode.cancelCodeChange', async () => {
    await codeDiffPreview.cancelPreview();
  });

  context.subscriptions.push(confirmCommand, cancelCommand);
  
  logger.info('代码差异预览命令已注册', {}, 'CodeDiffPreview');
}
