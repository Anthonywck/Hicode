/**
 * 聊天 Webview 提供器
 * 负责在活动栏中显示聊天界面
 * 
 * 功能：
 * 1. 加载 Vue 编译后的静态页面
 * 2. 处理 Webview 和扩展之间的消息通信
 * 3. 管理 Webview 的生命周期
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { routeWebviewMessage, sendMessageToWebview } from '../message/webviewMessageRouter';
import { logger } from '../utils/logger';
import * as MessageType from '../utils/messageType';

/**
 * 聊天 Webview 视图提供器
 */
export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  /** 视图类型 ID，用于在 package.json 中注册 */
  public static readonly viewType = 'hicode-ai-chat';

  /** Webview 实例 */
  private webview: vscode.Webview | undefined;

  /**
   * 构造函数
   * @param _extensionUri 扩展的根目录 URI
   */
  constructor(private readonly _extensionUri: vscode.Uri) {}

  /**
   * 解析 Webview 视图
   * 当视图首次显示时被调用
   * 
   * @param webviewView Webview 视图实例
   * @param context 视图上下文
   * @param _token 取消令牌
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    // 配置 Webview 选项
    webviewView.webview.options = {
      // 允许脚本执行
      enableScripts: true,
      // 限制资源加载的本地路径（只允许 media/chatPage 目录）
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'media', 'chatPage')
      ]
    };

    this.webview = webviewView.webview;

    // 设置 HTML 内容
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // 监听来自 Webview 的消息
    // 使用统一的消息路由处理器
    webviewView.webview.onDidReceiveMessage(
      message => {
        routeWebviewMessage(message, webviewView.webview);
      },
      null,
      []
    );

    // 发送初始数据到 Webview（延迟发送，等待 Webview 准备就绪）
    // 初始数据将在 Webview 发送 ready 消息后通过 handleWebviewReady 发送

    logger.info('ChatWebviewProvider: Webview resolved', {}, 'ChatWebviewProvider');
  }

  /**
   * 生成 Webview 的 HTML 内容
   * 读取 media/chatPage/index.html 并处理资源路径
   * @param webview Webview 实例
   * @returns HTML 字符串
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // 构建 HTML 文件路径
    const chatPagePath = path.join(
      this._extensionUri.fsPath,
      'media',
      'chatPage',
      'index.html'
    );

    logger.debug('加载 HTML 文件', { path: chatPagePath }, 'ChatWebviewProvider');

    // 检查文件是否存在
    if (!fs.existsSync(chatPagePath)) {
      logger.error('HTML 文件不存在', { path: chatPagePath }, 'ChatWebviewProvider');
      return this._getErrorHtml('Chat page not found');
    }

    try {
      // 读取 HTML 文件
      let html = fs.readFileSync(chatPagePath, 'utf8');
      logger.debug('HTML 文件加载成功', { length: html.length }, 'ChatWebviewProvider');

      // 转换资源路径为 Webview URI
      html = this._convertPathsToWebviewUris(html, webview);
      logger.debug('资源路径转换完成', {}, 'ChatWebviewProvider');

      return html;
    } catch (error) {
      logger.error('加载 HTML 文件失败', error, 'ChatWebviewProvider');
      return this._getErrorHtml(`Failed to load chat page: ${error}`);
    }
  }

  /**
   * 转换 HTML 中的资源路径为 Webview URI
   * 处理 Vue 编译后的绝对路径（/js/..., /css/...）
   * 
   * @param html 原始 HTML 内容
   * @param webview Webview 实例
   * @returns 处理后的 HTML
   */
  private _convertPathsToWebviewUris(html: string, webview: vscode.Webview): string {
    const mediaPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'chatPage');

    // 获取 js 和 css 目录的 Webview URI
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'js')).toString();
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'css')).toString();

    logger.debug('资源 URI', { jsUri, cssUri }, 'ChatWebviewProvider');

    // 替换 /js/ 路径
    // 例如：src="/js/app.js" -> src="vscode-webview://xxx/js/app.js"
    html = html.replace(/src="\/js\//g, `src="${jsUri}/`);
    html = html.replace(/src='\/js\//g, `src='${jsUri}/`);

    // 替换 /css/ 路径
    // 例如：href="/css/app.css" -> href="vscode-webview://xxx/css/app.css"
    html = html.replace(/href="\/css\//g, `href="${cssUri}/`);
    html = html.replace(/href='\/css\//g, `href='${cssUri}/`);

    return html;
  }

  /**
   * 向 Webview 发送消息（使用统一的消息发送接口）
   * @param message 消息对象
   */
  public postMessage(message: any): void {
    if (this.webview) {
      sendMessageToWebview(this.webview, message);
    } else {
      logger.warn('无法发送消息，Webview 未初始化', {}, 'ChatWebviewProvider');
    }
  }


  /**
   * 显示 Webview（聚焦到视图）
   */
  public show(): void {
    // WebviewView 不支持 show 方法
    // 需要通过命令打开侧边栏
    vscode.commands.executeCommand('workbench.view.extension.hicode-ai-sidebar');
  }

  /**
   * 生成错误提示页面
   * @param message 错误消息
   * @returns HTML 字符串
   */
  private _getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .error-container {
      max-width: 600px;
      margin: 40px auto;
      padding: 24px;
      background-color: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      border-radius: 4px;
    }
    h2 {
      margin-top: 0;
      color: var(--vscode-errorForeground);
    }
    .error-message {
      margin: 16px 0;
      padding: 12px;
      background-color: var(--vscode-editor-background);
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      word-break: break-all;
    }
    .instructions {
      margin-top: 24px;
      padding: 16px;
      background-color: var(--vscode-editor-background);
      border-radius: 4px;
    }
    .instructions h3 {
      margin-top: 0;
    }
    .instructions ol {
      margin: 8px 0;
      padding-left: 24px;
    }
    .instructions li {
      margin: 8px 0;
    }
    code {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', Courier, monospace;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <h2>⚠️ 无法加载聊天界面</h2>
    
    <div class="error-message">
      ${message}
    </div>
    
    <div class="instructions">
      <h3>📋 解决步骤：</h3>
      <ol>
        <li>确保 Vue 项目已编译：<code>npm run build</code></li>
        <li>将编译后的文件复制到：<code>media/chatPage/</code></li>
        <li>确保存在文件：<code>media/chatPage/index.html</code></li>
        <li>重新加载扩展：按 <code>Ctrl+R</code> 或 <code>Cmd+R</code></li>
      </ol>
      
      <p><strong>期望的文件结构：</strong></p>
      <pre><code>media/chatPage/
├── index.html
├── js/
│   ├── app.js
│   ├── vendors.js
│   └── ...
└── css/
    ├── app.css
    ├── vendors.css
    └── ...</code></pre>
    </div>
  </div>
</body>
</html>`;
  }
}
