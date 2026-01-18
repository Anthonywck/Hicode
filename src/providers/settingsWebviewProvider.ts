/**
 * 设置页面 Webview 提供器
 * 
 * 负责加载和管理设置页面的 Webview 面板
 * 参考 hicode 项目的实现，保持一致的加载机制和路径结构
 * 
 * 功能：
 * 1. 创建 Webview 面板并加载设置页面
 * 2. 处理 HTML 资源路径转换
 * 3. 插入 CSP 安全策略
 * 4. 监听和处理来自设置页面的消息
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';
import { routeWebviewMessage } from '../message/webviewMessageRouter';
import { getConfigManager, getAPIClient } from '../extension';
import * as MessageType from '../utils/messageType';
import { generateUUID } from '../utils/tools';

/**
 * 设置页面 Webview 提供器
 */
export class SettingsWebviewProvider {
  /** 当前打开的设置面板实例 */
  private static _panel: vscode.WebviewPanel | undefined;

  /**
   * 打开设置页面 Webview
   * 
   * 创建或显示设置页面面板，加载 media/settings/index.html
   * 如果面板已存在，则直接显示；否则创建新面板
   * 
   * @param context VS Code 扩展上下文
   */
  public static openSettingsWebview(context: vscode.ExtensionContext): void {
    // 如果面板已存在且未关闭，直接显示并发送初始化数据
    if (this._panel) {
      this._panel.reveal();
      logger.debug('设置页面已存在，直接显示', {}, 'SettingsWebviewProvider');
      // 重新发送初始化数据，确保数据同步
      setTimeout(async () => {
        try {
          await this._sendInitialData(this._panel!.webview);
          logger.debug('设置页面数据已重新同步', {}, 'SettingsWebviewProvider');
        } catch (error) {
          logger.error('重新同步设置页面数据失败', error, 'SettingsWebviewProvider');
        }
      }, 300);
      return;
    }

    try {
      // 创建 Webview 面板
      // 使用与 hicode 项目一致的配置
      const panel = vscode.window.createWebviewPanel(
        'hicode-settings', // 面板类型 ID
        'HiCode 设置', // 面板标题
        vscode.ViewColumn.One, // 显示在第一个编辑器组
        {
          // 启用脚本执行（前端 Vue 应用需要）
          enableScripts: true,
          // 限制资源加载路径（只允许 media/settings 目录）
          localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'media', 'settings'))
          ],
          // 保持面板状态（当面板隐藏时不销毁）
          retainContextWhenHidden: true
        }
      );

      // 保存面板实例
      this._panel = panel;

      // 监听面板关闭事件，清理引用
      panel.onDidDispose(
        () => {
          this._panel = undefined;
          logger.debug('设置页面已关闭', {}, 'SettingsWebviewProvider');
        },
        null,
        context.subscriptions
      );

      // 加载并设置 HTML 内容
      const html = this._loadAndProcessHtml(context, panel);
      panel.webview.html = html;

      // 监听来自设置页面的消息
      // 使用统一的消息路由处理器
      panel.webview.onDidReceiveMessage(
        message => {
          routeWebviewMessage(message, panel.webview);
        },
        null,
        context.subscriptions
      );

      // 页面加载完成后，主动发送初始化数据
      // 延迟一小段时间确保前端Vue应用已经mounted并准备好接收消息
      // 参考hicode项目的实现方式，确保数据同步
      setTimeout(async () => {
        try {
          await this._sendInitialData(panel.webview);
          logger.debug('设置页面初始化数据已发送', {}, 'SettingsWebviewProvider');
        } catch (error) {
          logger.error('发送设置页面初始化数据失败', error, 'SettingsWebviewProvider');
        }
      }, 500); // 延迟500ms，确保前端Vue应用已完全加载

      logger.info('设置页面已打开', {}, 'SettingsWebviewProvider');
    } catch (error) {
      logger.error('打开设置页面失败', error, 'SettingsWebviewProvider');
      vscode.window.showErrorMessage(`打开设置页面失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 加载并处理 HTML 文件
   * 
   * 步骤：
   * 1. 读取 media/settings/index.html 文件
   * 2. 插入 CSP（内容安全策略）meta 标签
   * 3. 转换所有资源路径为 Webview URI
   * 
   * @param context VS Code 扩展上下文
   * @param panel Webview 面板实例
   * @returns 处理后的 HTML 字符串
   */
  private static _loadAndProcessHtml(
    context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel
  ): string {
    // 构建 HTML 文件路径（与 hicode 项目路径一致）
    const htmlPath = path.join(context.extensionPath, 'media', 'settings', 'index.html');

    logger.debug('加载设置页面 HTML', { path: htmlPath }, 'SettingsWebviewProvider');

    // 检查文件是否存在
    if (!fs.existsSync(htmlPath)) {
      logger.error('设置页面 HTML 文件不存在', { path: htmlPath }, 'SettingsWebviewProvider');
      return this._getErrorHtml('设置页面文件未找到');
    }

    try {
      // 读取 HTML 文件内容
      let html = fs.readFileSync(htmlPath, 'utf8');
      logger.debug('HTML 文件加载成功', { length: html.length }, 'SettingsWebviewProvider');

      // 步骤 1: 插入 CSP meta 标签
      // CSP（内容安全策略）用于限制 Webview 中可以加载的资源
      // 允许脚本执行、样式加载等，但限制外部资源
      const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} https: data:; script-src 'unsafe-eval' 'unsafe-inline' ${panel.webview.cspSource}; style-src 'unsafe-inline' ${panel.webview.cspSource}; font-src ${panel.webview.cspSource};">`;
      html = html.replace(/<head(.*?)>/i, `<head$1>\n    ${cspMeta}`);

      // 步骤 2: 转换资源路径为 Webview URI
      // 处理 src 和 href 属性中的相对路径
      html = this._convertResourcePaths(context, panel, html);

      logger.debug('HTML 处理完成', {}, 'SettingsWebviewProvider');
      return html;
    } catch (error) {
      logger.error('加载设置页面 HTML 失败', error, 'SettingsWebviewProvider');
      return this._getErrorHtml(`加载设置页面失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 转换资源路径为 Webview URI
   * 
   * 处理以下类型的资源路径：
   * 1. src="..." 和 href="..." 属性
   * 2. url(...) CSS 函数中的路径
   * 
   * 将相对路径转换为 Webview 可访问的 URI
   * 
   * @param context VS Code 扩展上下文
   * @param panel Webview 面板实例
   * @param html 原始 HTML 内容
   * @returns 处理后的 HTML 内容
   */
  private static _convertResourcePaths(
    context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel,
    html: string
  ): string {
    const mediaPath = vscode.Uri.joinPath(
      vscode.Uri.file(context.extensionPath),
      'media',
      'settings'
    );
    const assetsPath = vscode.Uri.joinPath(mediaPath, 'assets');
    const assetsUri = panel.webview.asWebviewUri(assetsPath).toString();
    const mediaUri = panel.webview.asWebviewUri(mediaPath).toString();

    // 辅助函数：将相对路径转换为 Webview URI
    const fixResource = (orig: string): string => {
      // 跳过已经是完整 URL 或 data URI 的路径
      if (orig.startsWith('http') || orig.startsWith('data:') || orig.startsWith('vscode-webview:')) {
        return orig;
      }

      // 处理 /assets/ 路径
      if (orig.startsWith('/assets/')) {
        const fileName = orig.replace('/assets/', '');
        return `${assetsUri}/${fileName}`;
      }

      // 处理 /favicon.ico 等根路径资源
      if (orig.startsWith('/') && !orig.startsWith('//')) {
        const fileName = orig.substring(1);
        return `${mediaUri}/${fileName}`;
      }

      // 其他相对路径
      return `${mediaUri}/${orig}`;
    };

    // 处理 src 和 href 属性
    // 匹配 src="..." 或 href="..." 中的相对路径
    html = html.replace(
      /(src|href)="(?!http|data:)([^"]+)"/g,
      (match, attr, val) => `${attr}="${fixResource(val)}"`
    );
    html = html.replace(
      /(src|href)='(?!http|data:)([^']+)'/g,
      (match, attr, val) => `${attr}='${fixResource(val)}'`
    );

    // 处理 CSS 中的 url() 函数
    // 匹配 url('...')、url("...") 和 url(...) 三种格式
    html = html.replace(/url\((['"]?)([^'"\)]+)\1\)/g, (match, quote, val) => {
      // 跳过已经是完整 URL 的路径
      if (val.startsWith('http') || val.startsWith('data:')) {
        return match;
      }
      // 转换为 Webview URI
      return `url('${fixResource(val)}')`;
    });

    // 移除开发模式的脚本标签（包含 /src/ 路径的）
    html = html.replace(/<script[^>]*src=["'][^"']*\/src\/[^"']*["'][^>]*><\/script>/gi, '');

    return html;
  }

  /**
   * 发送初始化数据到设置页面
   * 
   * 当设置页面加载完成后，主动发送prompts、specifications和models等初始化数据
   * 参考hicode项目的实现方式，确保数据同步
   * 
   * @param webview Webview实例
   */
  private static async _sendInitialData(webview: vscode.Webview): Promise<void> {
    try {
      const configManager = await getConfigManager();
      const apiClient = await getAPIClient();

      // 获取所有模型配置
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
      
      // 获取当前使用的模型
      const currentModel = apiClient.getCurrentModel();

      // 发送初始化数据，格式与handleGetSettings保持一致
      // 注意：前端期望的字段名是 modelOptions 而不是 models，currModel 而不是 currentModel
      webview.postMessage({
        token: generateUUID(),
        message: MessageType.HICODE_GET_SETTINGS_B2F_RES,
        data: {
          modelOptions: modelsWithKeys, // 前端期望的字段名
          models: modelsWithKeys, // 兼容字段
          currModel: currentModel, // 前端期望的字段名
          currentModel: currentModel, // 兼容字段
          prompts: userPrompts,
          userPrompt: userPrompts, // 兼容旧字段名
          specifications
        }
      });

      logger.debug('设置页面初始化数据发送成功', {
        modelsCount: modelsWithKeys.length,
        promptsCount: userPrompts.length,
        specificationsCount: specifications.length
      }, 'SettingsWebviewProvider');
    } catch (error) {
      logger.error('发送设置页面初始化数据失败', error, 'SettingsWebviewProvider');
      throw error;
      }
    }

  /**
   * 向设置页面发送消息
   * 
   * 用于从扩展端主动向设置页面推送数据
   * 
   * @param message 要发送的消息对象
   */
  public static sendMessage(message: any): void {
    if (this._panel && this._panel.webview) {
      try {
        logger.debug('向设置页面发送消息', { message }, 'SettingsWebviewProvider');
        this._panel.webview.postMessage(message);
      } catch (error) {
        logger.error('向设置页面发送消息失败', error, 'SettingsWebviewProvider');
      }
    } else {
      logger.warn('设置页面未打开，无法发送消息', {}, 'SettingsWebviewProvider');
    }
  }

  /**
   * 生成错误提示页面
   * 
   * 当无法加载设置页面时显示友好的错误提示
   * 
   * @param message 错误消息
   * @returns HTML 字符串
   */
  private static _getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>错误</title>
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
    <h2>⚠️ 无法加载设置页面</h2>
    
    <div class="error-message">
      ${message}
    </div>
    
    <div class="instructions">
      <h3>📋 解决步骤：</h3>
      <ol>
        <li>确保前端项目已编译：<code>npm run build</code></li>
        <li>将编译后的文件复制到：<code>media/settings/</code></li>
        <li>确保存在文件：<code>media/settings/index.html</code></li>
        <li>重新加载扩展：按 <code>Ctrl+R</code> 或 <code>Cmd+R</code></li>
      </ol>
      
      <p><strong>期望的文件结构：</strong></p>
      <pre><code>media/settings/
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

