/**
 * 选择动作悬浮按钮组件
 * 当用户在编辑器中选中代码时，使用 CodeLens 在代码上方显示悬浮按钮（Add to Chat, Quick Edit）
 * 
 * 实现原理：
 * 1. 监听编辑器选择变化事件
 * 2. 使用 VS Code CodeLens Provider API 在选中代码上方显示可点击按钮
 * 3. CodeLens 会在代码上方显示，类似 Cursor 的悬浮按钮效果
 */

import * as vscode from 'vscode';
import * as os from 'os';

/**
 * 获取快捷键显示文本（根据操作系统）
 */
function getShortcutText(ctrlKey: string, macKey: string): string {
  const platform = os.platform();
  if (platform === 'darwin') {
    return macKey;
  }
  return ctrlKey;
}

/**
 * 选择动作 CodeLens 提供器
 */
class SelectionCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private currentSelection: {
    uri: vscode.Uri;
    startLine: number;
    endLine: number;
  } | null = null;

  /**
   * 设置当前选择
   */
  setSelection(uri: vscode.Uri, startLine: number, endLine: number): void {
    this.currentSelection = { uri, startLine, endLine };
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * 清除选择
   */
  clearSelection(): void {
    this.currentSelection = null;
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * 提供 CodeLens
   */
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    // 如果没有选择或文档不匹配，返回空数组
    if (
      !this.currentSelection ||
      document.uri.toString() !== this.currentSelection.uri.toString()
    ) {
      return [];
    }

    const { startLine, endLine } = this.currentSelection;

    // CodeLens 显示在指定行的上方，所以我们显示在选中代码的第一行
    const range = new vscode.Range(startLine, 0, startLine, 0);

    const addToChatShortcut = getShortcutText('Ctrl+L', 'Cmd+L');
    const quickEditShortcut = getShortcutText('Ctrl+K', 'Cmd+K');

    return [
      new vscode.CodeLens(range, {
        title: `$(comment-add) Add to Chat (${addToChatShortcut})`,
        command: 'hicode.addSelectionToChat',
        tooltip: `Add Selection to Chat (${addToChatShortcut})`
      }),
      new vscode.CodeLens(range, {
        title: `$(edit) Quick Edit (${quickEditShortcut})`,
        command: 'hicode.quickEdit',
        tooltip: `Quick Edit Selection (${quickEditShortcut})`
      })
    ];
  }
}

/**
 * 选择动作悬浮按钮管理器
 * 负责管理 CodeLens 的显示和隐藏
 */
export class SelectionActionWidget implements vscode.Disposable {
  private codeLensProvider: SelectionCodeLensProvider;
  private codeLensRegistration: vscode.Disposable | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    // 创建 CodeLens 提供器
    this.codeLensProvider = new SelectionCodeLensProvider();

    // 监听选择变化
    const selectionDisposable = vscode.window.onDidChangeTextEditorSelection(
      (event) => {
        this.handleSelectionChange(event);
      }
    );
    this.disposables.push(selectionDisposable);

    // 监听编辑器切换
    const editorDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
      this.codeLensProvider.clearSelection();
    });
    this.disposables.push(editorDisposable);

    console.log('[SelectionActionWidget] CodeLens provider created');
  }

  /**
   * 注册 CodeLens 提供器
   */
  register(context: vscode.ExtensionContext): void {
    // 注册 CodeLens 提供器
    this.codeLensRegistration = vscode.languages.registerCodeLensProvider(
      { scheme: 'file' },
      this.codeLensProvider
    );
    context.subscriptions.push(this.codeLensRegistration);

    console.log('[SelectionActionWidget] CodeLens provider registered');
  }

  /**
   * 处理选择变化
   */
  private handleSelectionChange(
    event: vscode.TextEditorSelectionChangeEvent
  ): void {
    const editor = event.textEditor;
    const selection = editor.selection;

    if (selection.isEmpty) {
      // 清除 CodeLens
      this.codeLensProvider.clearSelection();
      console.log('[SelectionActionWidget] Selection cleared');
    } else {
      // 显示 CodeLens
      const startLine = selection.start.line;
      const endLine = selection.end.line;
      this.codeLensProvider.setSelection(editor.document.uri, startLine, endLine);
      console.log('[SelectionActionWidget] Selection detected, CodeLens shown', {
        startLine,
        endLine,
        uri: editor.document.uri.toString()
      });
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.codeLensRegistration) {
      this.codeLensRegistration.dispose();
      this.codeLensRegistration = null;
    }
    this.codeLensProvider.clearSelection();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
