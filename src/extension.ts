/**
 * HiCode AI Integration - 扩展入口文件
 * 
 * 本文件作为 VS Code 扩展的主入口，负责：
 * 1. 扩展的激活和停用
 * 2. 初始化各个子系统
 * 3. 注册命令和提供器
 * 4. 管理扩展生命周期
 */

import * as vscode from 'vscode';
import { PerformanceTimer, createLazyModule, LazyModule } from './utils/performance';
import { commandManager } from './commands';
import { ChatWebviewProvider } from './providers/chatWebviewProvider';
import * as MessageType from './utils/messageType';
import { registerDiffPreviewCommands } from './utils/codeDiffPreview';
import { SelectionActionWidget } from './utils/selectionActionWidget';

/** 扩展版本号 */
export const version = '0.1.0';

// ========== 懒加载模块定义 ==========
// 这些模块在首次使用时才会被加载，以提高激活速度

/** API 客户端模块 */
let apiClientModule: LazyModule<any> | null = null;

/** 上下文管理器模块 */
let contextManagerModule: LazyModule<any> | null = null;

/** 会话管理器模块 */
let sessionManagerModule: LazyModule<any> | null = null;

/** 内联聊天提供器模块 */
let inlineChatProviderModule: LazyModule<any> | null = null;

/** 意图路由器模块 */
let intentRouterModule: LazyModule<any> | null = null;

/** 配置管理器模块 */
let configManagerModule: LazyModule<any> | null = null;

/** 代码补全提供器模块 */
let completionProviderModule: LazyModule<any> | null = null;

/** Prompt 管理器模块 */
let promptManagerModule: LazyModule<any> | null = null;

// ========== 全局单例实例 ==========
// 这些实例在首次使用时创建，之后复用

/** API 客户端实例 */
let apiClientInstance: any = null;

/** Prompt 管理器实例 */
let promptManagerInstance: any = null;

/** 上下文管理器实例 */
let contextManagerInstance: any = null;

/** 会话管理器实例 */
let sessionManagerInstance: any = null;

/** 内联聊天提供器实例 */
let inlineChatProviderInstance: any = null;

/** 意图路由器实例 */
let intentRouterInstance: any = null;

/** 配置管理器实例 */
let configManagerInstance: any = null;

/** 代码补全提供器实例 */
let completionProviderInstance: any = null;

/** 聊天 Webview 提供器实例 */
let chatWebviewProvider: ChatWebviewProvider | null = null;

/** 选择动作悬浮按钮实例 */
let selectionActionWidget: SelectionActionWidget | null = null;

/** 扩展上下文实例 */
let extensionContext: vscode.ExtensionContext | null = null;

/**
 * 获取扩展上下文
 */
export async function getExtensionContext(): Promise<vscode.ExtensionContext> {
  if (!extensionContext) {
    throw new Error('Extension context not available. Extension may not be activated.');
  }
  return extensionContext;
}

/**
 * 扩展激活函数
 * 当扩展首次被激活时调用
 * 
 * 设计目标：
 * - 激活时间 < 1 秒（需求: 6.1）
 * - 采用懒加载策略，延迟加载重型模块
 * - 优先注册命令，确保用户可以立即使用
 * 
 * @param context VS Code 扩展上下文
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const timer = new PerformanceTimer();
  
  // Store the extension context globally
  extensionContext = context;
  
  try {
    console.log('HiCode AI Integration: Starting activation...');
    timer.mark('start');

    // ========== 第一阶段：初始化懒加载模块 ==========
    // 初始化懒加载模块（不会立即加载，只是准备好加载器）
    initializeLazyModules();
    timer.mark('lazy-modules-initialized');

    // ========== 第一阶段（续）：初始化新系统 ==========
    // 初始化 Agent、Tool、MCP 等新系统
    await initializeNewSystems();
    timer.mark('new-systems-initialized');

    // ========== 第二阶段：初始化命令系统 ==========
    // 命令系统是最轻量的，优先初始化以确保用户可以立即使用命令
    initializeCommandSystem(context);
    timer.mark('commands-initialized');

    // ========== 第三阶段：注册提供器 ==========
    // 提供器采用懒加载，只在首次使用时才加载实际模块
    registerProviders(context);
    timer.mark('providers-registered');

    // ========== 第四阶段：注册 Webview 视图 ==========
    // 注册聊天 Webview 到活动栏
    registerChatWebview(context);
    timer.mark('webview-registered');

    // ========== 第四阶段（续）：注册编辑器选择变化监听 ==========
    // 监听编辑器选择变化，发送代码选择事件到前端
    registerSelectionChangeListener(context);
    timer.mark('selection-listener-registered');

    // ========== 第四阶段（续）：注册代码差异预览命令 ==========
    // 注册代码差异预览的确认/撤销命令
    registerDiffPreviewCommands(context);
    timer.mark('diff-preview-commands-registered');

    // ========== 第四阶段（续）：注册选择动作悬浮按钮 ==========
    // 注册编辑器选择变化时的悬浮按钮
    registerSelectionActionWidget(context);
    timer.mark('selection-action-widget-registered');

    // ========== 第五阶段：加载配置 ==========
    // 加载最小必要配置，其他配置在需要时再加载
    await loadMinimalConfiguration(context);
    timer.mark('config-loaded');

    // ========== 激活完成 ==========
    const duration = timer.getDuration();
    const stats = commandManager.getStats();
    
    console.log(`✓ HiCode AI Integration activated successfully in ${duration}ms`);
    console.log(`✓ Registered ${stats.active}/${stats.total} commands`);
    console.log(`✓ Commands by category:`, stats.byCategory);

    // ========== 第六阶段：自动显示聊天页面 ==========
    // 延迟显示，确保所有初始化完成
    setTimeout(async () => {
      try {
        // 先显示侧边栏容器
        await vscode.commands.executeCommand('workbench.view.extension.hicode-ai-sidebar');
        // 然后聚焦到聊天视图
        await vscode.commands.executeCommand('hicode-ai-chat.focus');
        console.log('✓ Chat webview automatically displayed');
      } catch (error) {
        // 如果自动显示失败，只记录日志，不阻止扩展激活
        console.warn('Failed to auto-display chat webview:', error);
      }
    }, 500); // 延迟500ms，确保webview注册完成

    // 性能警告
    if (duration > 1000) {
      console.warn(`⚠ Activation took ${duration}ms, exceeding 1 second target`);
      console.warn('Performance marks:', timer.getMarks());
    }

    // 验证激活时间要求（需求: 6.1）
    if (!timer.isWithinLimit(1000)) {
      console.warn('⚠ Activation time exceeded 1 second limit (Requirement 6.1)');
    }

  } catch (error) {
    console.error('✗ Failed to activate HiCode AI Integration:', error);
    vscode.window.showErrorMessage(
      `HiCode AI Integration 激活失败: ${error}`
    );
    throw error;
  }
}

/**
 * 初始化命令系统
 * 
 * 命令系统是扩展的核心功能之一，需要优先初始化
 * 采用集中式管理，所有命令配置在 commands 模块中定义
 * 
 * @param context VS Code 扩展上下文
 */
function initializeCommandSystem(context: vscode.ExtensionContext): void {
  console.log('Initializing command system...');
  
  // 初始化命令管理器
  commandManager.initialize(context);
  
  // 设置扩展上下文到命令处理器（用于需要 context 的命令）
  // 使用动态导入避免循环依赖
  import('./commands/handlers').then(handlers => {
    handlers.setExtensionContext(context);
  });
  
  // 批量注册所有预定义的命令
  // 命令配置在 src/commands/registry.ts 中集中管理
  const disposables = commandManager.registerAllCommands();
  
  console.log(`✓ Command system initialized with ${disposables.length} commands`);
}

/**
 * 注册提供器
 * 
 * 提供器包括：
 * - 代码补全提供器（Completion Provider）
 * - 内联聊天提供器（Inline Chat Provider）
 * - 其他语言特性提供器
 * 
 * 注意：提供器的实际实现采用懒加载，只在首次触发时才加载
 * 
 * @param context VS Code 扩展上下文
 */
function registerProviders(context: vscode.ExtensionContext): void {
  console.log('Registering providers...');
  
  // TODO: 注册代码补全提供器
  // 需求: 1.5 - AI 代码补全
  // const completionProvider = vscode.languages.registerCompletionItemProvider(
  //   { scheme: 'file', language: '*' },
  //   {
  //     async provideCompletionItems(document, position, token, context) {
  //       // 懒加载补全提供器
  //       const provider = await getCompletionProvider();
  //       return provider.provideCompletionItems(document, position, token, context);
  //     }
  //   },
  //   '.' // 触发字符
  // );
  // context.subscriptions.push(completionProvider);

  // TODO: 注册内联聊天提供器
  // 需求: 9.1 - 内联聊天功能
  // const inlineChatProvider = vscode.languages.registerInlineCompletionItemProvider(
  //   { scheme: 'file', language: '*' },
  //   {
  //     async provideInlineCompletionItems(document, position, context, token) {
  //       // 懒加载内联聊天提供器
  //       const provider = await getInlineChatProvider();
  //       return provider.provideInlineCompletionItems(document, position, context, token);
  //     }
  //   }
  // );
  // context.subscriptions.push(inlineChatProvider);

  console.log('✓ Providers registered (placeholder)');
}

/**
 * 注册聊天 Webview 视图
 * 
 * 在活动栏中注册聊天界面，加载 Vue 编译后的静态页面
 * 
 * @param context VS Code 扩展上下文
 */
function registerChatWebview(context: vscode.ExtensionContext): void {
  console.log('Registering chat webview...');

  // 防止重复注册
  if (chatWebviewProvider) {
    console.log('Chat webview already registered, skipping...');
    return;
  }

  try {
    // 创建 Webview 提供器
    chatWebviewProvider = new ChatWebviewProvider(context.extensionUri);

    // 注册 Webview 视图提供器
    const webviewDisposable = vscode.window.registerWebviewViewProvider(
      ChatWebviewProvider.viewType,
      chatWebviewProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true // 保持 Webview 状态
        }
      }
    );

    // 添加到订阅列表
    context.subscriptions.push(webviewDisposable);

    console.log('✓ Chat webview registered');
  } catch (error) {
    console.error('Failed to register chat webview:', error);
    
    // 如果是重复注册错误，只记录警告而不显示错误消息
    if (error instanceof Error && error.message.includes('already registered')) {
      console.warn('Chat webview was already registered, this is expected in some scenarios');
    } else {
      vscode.window.showErrorMessage(`注册聊天界面失败: ${error}`);
    }
  }
}

/**
 * 获取聊天 Webview 提供器实例
 * @returns ChatWebviewProvider 实例或 null
 */
export function getChatWebviewProvider(): ChatWebviewProvider | null {
  return chatWebviewProvider;
}

/**
 * 注册选择动作悬浮按钮
 * 
 * 当用户在编辑器中选中代码时，显示悬浮按钮（Add to Chat, Quick Edit）
 * 
 * @param context VS Code 扩展上下文
 */
function registerSelectionActionWidget(context: vscode.ExtensionContext): void {
  console.log('Registering selection action widget...');

  try {
    // 创建选择动作悬浮按钮实例
    selectionActionWidget = new SelectionActionWidget();

    // 注册 CodeLens 提供器
    selectionActionWidget.register(context);

    // 添加到订阅列表
    context.subscriptions.push(selectionActionWidget);

    console.log('✓ Selection action widget registered');

    // 延迟测试按钮显示（用于调试）
    setTimeout(() => {
      const editor = vscode.window.activeTextEditor;
      if (editor && !editor.selection.isEmpty) {
        console.log('[Extension] Initial selection detected, CodeLens should be visible');
      } else {
        console.log('[Extension] No initial selection, CodeLens will show when code is selected');
      }
    }, 1000);
  } catch (error) {
    console.error('Failed to register selection action widget:', error);
    console.error('Error details:', error instanceof Error ? error.stack : String(error));
    // 不阻止扩展激活，只记录错误
  }
}

/**
 * 注册编辑器选择变化监听器
 * 
 * 监听编辑器中的代码选择变化，当用户选中代码时：
 * 1. 收集选中代码的信息（languageId、文件绝对路径、起始行号、结束行号、整行内容）
 * 2. 发送 HICODE_SELECTION_CHANGE 事件到前端
 * 
 * @param context VS Code 扩展上下文
 */
function registerSelectionChangeListener(context: vscode.ExtensionContext): void {
  console.log('Registering selection change listener...');

  // 监听编辑器选择变化
  const selectionChangeDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
    try {
      const editor = event.textEditor;
      const selection = editor.selection;
      const document = editor.document;

      // 如果选择为空，发送空选择事件
      if (selection.isEmpty) {
        const provider = getChatWebviewProvider();
        if (provider) {
          provider.postMessage({
            message: MessageType.HICODE_SELECTION_CHANGE,
            data: {
              selectCode: '',
              language: '',
              languageId: '',
              filePath: '',
              startLine: -1,
              endLine: -1
            }
          });
        }
        return;
      }

      // 获取文件信息
      const filePath = document.uri.fsPath; // 文件绝对路径
      const languageId = document.languageId; // 语言ID

      // 获取起始和结束行号（从0开始，但显示时通常从1开始）
      const startLine = selection.start.line;
      const endLine = selection.end.line;

      // 获取整行内容（防止用户选中内容有半行的内容导致获取代码不完整）
      // 从起始行的开始到结束行的结束
      const startLineStart = new vscode.Position(startLine, 0);
      const endLineEnd = document.lineAt(endLine).range.end;
      const fullRange = new vscode.Range(startLineStart, endLineEnd);
      const selectedCode = document.getText(fullRange);

      // 发送选择变化事件到前端
      const provider = getChatWebviewProvider();
      if (provider) {
        provider.postMessage({
          message: MessageType.HICODE_SELECTION_CHANGE,
          data: {
            selectCode: selectedCode,
            language: languageId, // 兼容旧字段名
            languageId: languageId, // 新字段名
            filePath: filePath, // 文件绝对路径
            startLine: startLine + 1, // 转换为从1开始的行号（前端显示用）
            endLine: endLine + 1 // 转换为从1开始的行号（前端显示用）
          }
        });
      }
    } catch (error) {
      console.error('处理选择变化时发生错误:', error);
    }
  });

  // 添加到订阅列表
  context.subscriptions.push(selectionChangeDisposable);

  console.log('✓ Selection change listener registered');
}

/**
 * 加载最小必要配置
 * 
 * 只加载扩展激活时必需的配置，其他配置延迟加载
 * 这样可以加快激活速度
 * 
 * @param context VS Code 扩展上下文
 */
async function loadMinimalConfiguration(context: vscode.ExtensionContext): Promise<void> {
  console.log('Loading minimal configuration...');
  
  try {
    // 读取基本配置
    const config = vscode.workspace.getConfiguration('hicode');
    
    // 日志级别
    const logLevel = config.get<string>('logLevel', 'info');
    console.log(`Log level: ${logLevel}`);
    
    // 调试模式
    const debugMode = config.get<boolean>('enableDebugMode', false);
    if (debugMode) {
      console.log('⚠ Debug mode enabled');
    }
    
    // 其他配置（如 API 密钥、模型配置等）在需要时再加载
    
    console.log('✓ Minimal configuration loaded');
  } catch (error) {
    console.error('Failed to load configuration:', error);
    // 配置加载失败不应阻止扩展激活
  }
}

/**
 * 初始化新系统
 * 
 * 初始化 Agent、Tool、MCP 等新系统
 * 这些系统在扩展激活时就需要初始化，但不会加载重型依赖
 */
async function initializeNewSystems(): Promise<void> {
  console.log('Initializing new systems...');

  // 初始化 Agent 注册表（同步初始化，轻量级）
  try {
    const { getAgentRegistry } = await import('./agent/registry');
    getAgentRegistry();
    console.log('✓ Agent Registry initialized');
  } catch (error) {
    console.warn('Failed to initialize Agent Registry:', error);
  }

  // 初始化工具注册表并注册所有builtin工具
  try {
    const { getToolRegistry, ToolRegistry } = await import('./tool/registry');
    const registry = getToolRegistry();
    
    // 注册所有builtin工具（参考opencode的实现）
    const {
      ReadTool,
      WriteTool,
      EditTool,
      BashTool,
      GrepTool,
      GlobTool,
      TaskTool,
      WebFetchTool,
      TodoWriteTool,
      TodoReadTool,
    } = await import('./tool/builtin');
    
    ToolRegistry.registerAll([
      ReadTool,
      WriteTool,
      EditTool,
      BashTool,
      GrepTool,
      GlobTool,
      TaskTool,
      WebFetchTool,
      TodoWriteTool,
      TodoReadTool,
    ]);
    
    console.log(`✓ Tool Registry initialized with ${registry.size()} tools`);
  } catch (error) {
    console.warn('Failed to initialize Tool Registry:', error);
  }

  // MCP 系统采用懒加载，在需要时再初始化
  // 这里只确保 MCP 模块可以正常导入
  try {
    await import('./mcp/index');
    console.log('✓ MCP system ready');
  } catch (error) {
    console.warn('Failed to load MCP system:', error);
  }

  console.log('✓ New systems initialized');
}

/**
 * 初始化懒加载模块
 * 
 * 这些模块不会立即加载，只是准备好加载器
 * 当首次调用对应的 getter 函数时才会真正加载
 * 
 * 需求: 1.5, 5.1, 9.1
 */
function initializeLazyModules(): void {
  console.log('Initializing lazy-loaded modules...');

  // 配置管理器 - 当需要读取配置时加载
  // 需求: 1.1
  configManagerModule = createLazyModule(async () => {
    const { ConfigManager } = await import('./config/manager');
    return ConfigManager;
  });

  // API 客户端 - 当首次调用 API 时加载
  // 需求: 1.5
  apiClientModule = createLazyModule(async () => {
    const { APIClientManager } = await import('./api/client');
    return APIClientManager;
  });

  // 上下文管理器 - 当需要分析代码上下文时加载
  // 需求: 5.1
  contextManagerModule = createLazyModule(async () => {
    const { ContextManager } = await import('./context/manager');
    return ContextManager;
  });

  // 会话管理器 - 当访问会话时加载
  sessionManagerModule = createLazyModule(async () => {
    const { getSessionManager } = await import('./session/session');
    return getSessionManager;
  });

  // 意图路由器 - 当需要检测用户意图时加载
  // 需求: 9.1
  intentRouterModule = createLazyModule(async () => {
    const { IntentRouter } = await import('./intent/router');
    return IntentRouter;
  });

  // 内联聊天提供器 - 当首次使用内联聊天时加载
  // 需求: 9.1
  inlineChatProviderModule = createLazyModule(async () => {
    const { InlineChatProvider } = await import('./providers/inline');
    return InlineChatProvider;
  });

  // 代码补全提供器 - 当触发代码补全时加载
  completionProviderModule = createLazyModule(async () => {
    const { AICompletionProvider } = await import('./providers/completionProvider');
    return AICompletionProvider;
  });

  // Prompt 管理器 - 当需要使用模板系统时加载
  // 需求: 1.5, 8.4
  promptManagerModule = createLazyModule(async () => {
    const { PromptManager } = await import('./prompts/promptManager');
    return PromptManager;
  });

  console.log('✓ Lazy-loaded modules initialized');
}

// ========== 懒加载模块的 Getter 函数 ==========
// 这些函数用于获取各个模块的单例实例
// 首次调用时会加载模块并创建实例，之后直接返回已创建的实例

/**
 * 获取 Prompt 管理器（懒加载，单例）
 * 需求: 1.5, 8.4
 */
export async function getPromptManager(): Promise<any> {
  if (!promptManagerModule) {
    throw new Error('Extension not activated');
  }
  
  if (!promptManagerInstance) {
    // 加载 Prompt 系统组件
    const { TemplateRegistry } = await import('./prompts/templateRegistry');
    const { IntentRecognizer } = await import('./prompts/intentRecognizer');
    const { ContextCollector } = await import('./prompts/contextCollector');
    const { TemplateRenderer } = await import('./prompts/templateRenderer');
    const { defaultTemplates } = await import('./prompts/templates/defaultTemplates');
    
    // 创建 TemplateRegistry 实例并加载模板
    const templateRegistry = new TemplateRegistry();
    templateRegistry.loadTemplatesFromArray(defaultTemplates);
    
    // 创建其他组件实例（不依赖 API 客户端的部分）
    const templateRenderer = new TemplateRenderer();
    const contextCollector = new ContextCollector();
    
    // 创建 IntentRecognizer（需要 API 客户端，但延迟获取）
    // 注意：这里我们先创建一个占位符，稍后在实际使用时再注入 API 客户端
    const intentRecognizer = new IntentRecognizer(null as any);
    
    // 创建 PromptManager 实例
    const PromptManagerClass = await promptManagerModule.load();
    promptManagerInstance = new PromptManagerClass(
      templateRegistry,
      intentRecognizer,
      contextCollector,
      templateRenderer
    );
    
    console.log('✓ Prompt Manager initialized with template system');
  }
  
  return promptManagerInstance;
}

/**
 * 初始化 Prompt 管理器的 API 客户端依赖
 * 在 API 客户端创建后调用，解决循环依赖问题
 */
async function initializePromptManagerDependencies(): Promise<void> {
  if (promptManagerInstance && apiClientInstance) {
    // 获取 IntentRecognizer 并注入 API 客户端
    const intentRecognizer = (promptManagerInstance as any).intentRecognizer;
    if (intentRecognizer && !intentRecognizer.apiClient) {
      intentRecognizer.apiClient = apiClientInstance;
      console.log('✓ Prompt Manager dependencies initialized');
    }
  }
}

/**
 * 获取配置管理器（懒加载，单例）
 * 需求: 1.1
 */
export async function getConfigManager(): Promise<any> {
  if (!configManagerModule) {
    throw new Error('Extension not activated');
  }
  
  if (!extensionContext) {
    throw new Error('Extension context not available');
  }
  
  if (!configManagerInstance) {
    const ConfigManagerClass = await configManagerModule.load();
    // Pass the actual context and secret storage
    configManagerInstance = new ConfigManagerClass(extensionContext, extensionContext.secrets);
  }
  
  return configManagerInstance;
}

/**
 * 获取 API 客户端管理器（懒加载，单例）
 * 需求: 1.5
 * 修改：使用本地 API 调用（AI SDK），不使用 gRPC
 */
export async function getAPIClient(): Promise<any> {
  if (!apiClientModule) {
    throw new Error('Extension not activated');
  }
  
  if (!apiClientInstance) {
    const configMgr = await getConfigManager();
    
    // 强制使用 gRPC 方式，所有 API 调用都通过 Agent 服务
    // console.log('[APIClient] Using gRPC mode - all API calls will be routed to Agent service');
    // 使用本地 API 调用（AI SDK）
    console.log('[APIClient] Using local API mode - all API calls will use AI SDK directly');
    
    // 导入 gRPC API 客户端
    // const { GrpcAPIClient } = await import('./api/grpc_api_client');
    // 导入本地 API 客户端管理器
    const { APIClientManager } = await import('./api/client');
    
    // 创建 gRPC API 客户端
    // apiClientInstance = new GrpcAPIClient(configMgr.models);
    // 创建本地 API 客户端管理器
    apiClientInstance = new APIClientManager(configMgr.models);
    
    // 初始化 PromptManager 的依赖
    await initializePromptManagerDependencies();
    
    console.log('[APIClient] Local API adapters enabled, using AI SDK directly');
  }
  
  return apiClientInstance;
}

/**
 * 获取上下文管理器（懒加载，单例）
 * 需求: 5.1
 */
export async function getContextManager(): Promise<any> {
  if (!contextManagerModule) {
    throw new Error('Extension not activated');
  }
  
  if (!contextManagerInstance) {
    const ContextManagerClass = await contextManagerModule.load();
    contextManagerInstance = new ContextManagerClass();
  }
  
  return contextManagerInstance;
}

/**
 * 获取会话管理器（懒加载，单例）
 */
export async function getSessionManager(): Promise<any> {
  if (!sessionManagerModule) {
    throw new Error('Extension not activated');
  }
  
  if (!extensionContext) {
    throw new Error('Extension context not available');
  }
  
  if (!sessionManagerInstance) {
    const getSessionManagerFn = await sessionManagerModule.load();
    sessionManagerInstance = getSessionManagerFn(extensionContext);
  }
  
  return sessionManagerInstance;
}

/**
 * 获取意图路由器（懒加载，单例）
 * 需求: 9.1
 */
export async function getIntentRouter(): Promise<any> {
  if (!intentRouterModule) {
    throw new Error('Extension not activated');
  }
  
  if (!intentRouterInstance) {
    const IntentRouterClass = await intentRouterModule.load();
    intentRouterInstance = new IntentRouterClass();
  }
  
  return intentRouterInstance;
}

/**
 * 获取内联聊天提供器（懒加载，单例）
 * 需求: 9.1
 */
export async function getInlineChatProvider(): Promise<any> {
  if (!inlineChatProviderModule) {
    throw new Error('Extension not activated');
  }
  
  if (!inlineChatProviderInstance) {
    const InlineChatProviderClass = await inlineChatProviderModule.load();
    const apiClient = await getAPIClient();
    const contextMgr = await getContextManager();
    // TODO: Update InlineChatProvider to use new SessionManager (task 6.1)
    // For now, keep old AgentSystem and HistoryManager for compatibility
    const { AgentSystem } = await import('./agent/system');
    const { HistoryManager } = await import('./history/manager');
    const { VSCodeStorageManager } = await import('./history/storage');
    if (!extensionContext) {
      throw new Error('Extension context not available');
    }
    const storageManager = new VSCodeStorageManager(extensionContext.globalState);
    const agentSystem = new AgentSystem(apiClient, contextMgr);
    const historyManager = new HistoryManager(storageManager);
    
    inlineChatProviderInstance = new InlineChatProviderClass(
      apiClient,
      contextMgr,
      agentSystem,
      historyManager
    );
  }
  
  return inlineChatProviderInstance;
}

/**
 * 获取代码补全提供器（懒加载，单例）
 */
export async function getCompletionProvider(): Promise<any> {
  if (!completionProviderModule) {
    throw new Error('Extension not activated');
  }
  
  if (!completionProviderInstance) {
    const CompletionProviderClass = await completionProviderModule.load();
    const apiClient = await getAPIClient();
    const contextMgr = await getContextManager();
    completionProviderInstance = new CompletionProviderClass(apiClient, contextMgr);
  }
  
  return completionProviderInstance;
}

/**
 * 扩展停用函数
 * 当扩展被停用时调用，负责清理资源
 */
export function deactivate(): void {
  console.log('HiCode AI Integration: Deactivating...');
  
  try {
    // 清理命令管理器
    commandManager.dispose();
    
    // 清理懒加载模块
    apiClientModule = null;
    contextManagerModule = null;
    sessionManagerModule = null;
    inlineChatProviderModule = null;
    intentRouterModule = null;
    configManagerModule = null;
    completionProviderModule = null;
    promptManagerModule = null;
    
    // 清理单例实例
    apiClientInstance = null;
    contextManagerInstance = null;
    sessionManagerInstance = null;
    inlineChatProviderInstance = null;
    intentRouterInstance = null;
    configManagerInstance = null;
    completionProviderInstance = null;
    promptManagerInstance = null;
    chatWebviewProvider = null;
    selectionActionWidget = null;
    
    console.log('✓ HiCode AI Integration deactivated successfully');
  } catch (error) {
    console.error('Error during deactivation:', error);
  }
}
