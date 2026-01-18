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

    // 监听 webview 可见性变化
    // 当 webview 首次变为可见时，确保 HTML 内容已正确设置
    // 这可以解决首次加载时页面空白的问题
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        // 当 webview 变为可见时，确保 HTML 内容已设置
        // 如果 HTML 为空或只包含错误页面，重新设置
        const currentHtml = webviewView.webview.html || '';
        if (!currentHtml || currentHtml.includes('无法加载聊天界面')) {
          logger.debug('Webview 变为可见，设置 HTML 内容', {}, 'ChatWebviewProvider');
          webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        }
      }
    });

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

      // 插入 CSP meta 标签（必需，否则资源无法加载）
      // 注意：font-src 需要包含 data: 以支持内联的 iconfont 字体文件
      const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; script-src 'unsafe-eval' 'unsafe-inline' ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource}; font-src ${webview.cspSource} data:;">`;
      html = html.replace(/<head(.*?)>/i, `<head$1>\n    ${cspMeta}`);

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
   * 处理 Vue 编译后的绝对路径（/assets/..., /js/..., /css/...）
   * 
   * @param html 原始 HTML 内容
   * @param webview Webview 实例
   * @returns 处理后的 HTML
   */
  private _convertPathsToWebviewUris(html: string, webview: vscode.Webview): string {
    const mediaPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'chatPage');
    const mediaUri = webview.asWebviewUri(mediaPath).toString();

    logger.debug('资源 URI', { mediaUri }, 'ChatWebviewProvider');

    // 辅助函数：将相对路径转换为 Webview URI
    const fixResource = (orig: string): string => {
      // 跳过已经是完整 URL 或 data URI 的路径
      if (orig.startsWith('http') || orig.startsWith('data:') || orig.startsWith('vscode-webview:')) {
        return orig;
      }

      // 处理 /assets/ 路径（Vue 3 + Vite 编译后的资源路径）
      if (orig.startsWith('/assets/')) {
        const fileName = orig.replace('/assets/', '');
        return `${mediaUri}/assets/${fileName}`;
      }

      // 处理 /js/ 路径（兼容旧格式）
      if (orig.startsWith('/js/')) {
        const fileName = orig.replace('/js/', '');
        return `${mediaUri}/js/${fileName}`;
      }

      // 处理 /css/ 路径（兼容旧格式）
      if (orig.startsWith('/css/')) {
        const fileName = orig.replace('/css/', '');
        return `${mediaUri}/css/${fileName}`;
      }

      // 处理 /favicon.ico 等根路径资源
      if (orig.startsWith('/') && !orig.startsWith('//')) {
        const fileName = orig.substring(1);
        return `${mediaUri}/${fileName}`;
      }

      // 其他相对路径
      return `${mediaUri}/${orig}`;
    };

    // 处理 src 属性中的路径
    html = html.replace(/(src)="([^"]+)"/g, (match, attr, val) => {
      return `${attr}="${fixResource(val)}"`;
    });
    html = html.replace(/(src)='([^']+)'/g, (match, attr, val) => {
      return `${attr}='${fixResource(val)}'`;
    });

    // 处理 href 属性中的路径
    html = html.replace(/(href)="([^"]+)"/g, (match, attr, val) => {
      return `${attr}="${fixResource(val)}"`;
    });
    html = html.replace(/(href)='([^']+)'/g, (match, attr, val) => {
      return `${attr}='${fixResource(val)}'`;
    });

    // 处理 CSS 中的 url() 函数
    html = html.replace(/url\((['"]?)([^'"\)]+)\1\)/g, (match, quote, val) => {
      // 跳过已经是完整 URL 的路径
      if (val.startsWith('http') || val.startsWith('data:')) {
        return match;
      }
      // 转换为 Webview URI
      return `url('${fixResource(val)}')`;
    });

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
