/**
 * Message Module
 * Exports message handling functionality
 */

// 业务消息处理（AI 聊天相关）
export {
  MessageHandler,
  IMessageHandler,
  MessageHandlerConfig,
  SendMessageOptions,
  StreamCallbacks
} from './messageHandler';

// Markdown 渲染器
export {
  MarkdownRenderer,
  IMarkdownRenderer,
  MarkdownRenderOptions,
  CodeBlock,
  createMarkdownRenderer
} from './markdownRenderer';

// Webview 消息路由和处理器
export {
  routeWebviewMessage,
  sendMessageToWebview,
  WebviewMessage
} from './webviewMessageRouter';

export {
  handleAskQuestion,
  handleNewChat,
  handleGetModels,
  handleChangeModel,
  handleChangeMode,
  handleAddModel,
  handleEditModel,
  handleDeleteModel,
  handleGetSettings,
  handleGetHistory,
  handleWebviewReady,
  handleConsoleLog
} from './webviewMessageHandler';
