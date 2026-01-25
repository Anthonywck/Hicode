/**
 * API类型定义和接口
 * 定义了与AI模型交互的核心数据结构和接口
 */

import * as vscode from 'vscode';

/**
 * 模型配置
 * 包含模型的基本信息和API连接配置
 */
export interface ModelConfig {
  /** 唯一标识符 */
  modelId: string;
  /** 模型名称（如gpt-4, deepseek-chat） */
  modelName: string;
  /** 显示名称 */
  displayName: string;
  /** 模型提供商 */
  vendor: 'deepseek' | 'openai' | 'zhipuai' | 'custom';
  /** 模型描述 */
  modelDescription?: string;
  /** 最大上下文token数（存储为token单位） */
  maxContextTokens: number;
  /** 温度参数（默认0.6，不开放给用户配置） */
  temperature?: number;
  /** 是否支持多模态 */
  supportMultimodal: boolean;
  /** API密钥（存储在SecretStorage） */
  apiKey: string;
  /** API基础URL */
  apiBaseUrl: string;
}

/**
 * 代码上下文
 * 包含当前编辑器状态和相关代码信息
 */
export interface CodeContext {
  /** 当前文件信息 */
  currentFile: {
    path: string;
    language: string;
    content: string;
  };
  /** 选中的代码 */
  selection?: {
    content: string;
    startLine: number;
    endLine: number;
    path: string;
    language: string;
  };
  /** 光标位置上下文 */
  cursorContext?: {
    line: number;
    column: number;
    beforeCursor: string;
    afterCursor: string;
    language: string;
    path: string;
  };
  /** 相关文件 */
  relatedFiles?: Array<{
    path: string;
    relevance: number;
    excerpt: string;
    /** 文件语言ID */
    language?: string;
    /** 符号名称 */
    name?: string;
    /** 起始行号（从0开始） */
    startLine?: number;
    /** 结束行号（从0开始） */
    endLine?: number;
    /** 符号内容 */
    content?: string;
    /** 上下文内容（前后各5行） */
    context?: string;
    /** 文件URI */
    uri?: string;
    /** 符号类型 */
    kind?: vscode.SymbolKind;
    /** 父符号名称（如果该符号是类的方法或属性） */
    parentName?: string;
  }>;
  /** 项目信息 */
  projectInfo?: {
    name: string;
    dependencies: string[];
    framework?: string;
  };
}

/**
 * 聊天消息
 * 表示对话中的单条消息
 */
export interface ChatMessage {
  /** 消息角色 */
  role: 'system' | 'user' | 'assistant';
  /** 消息内容 */
  content: string;
  /** 代码上下文（可选） */
  context?: CodeContext;
  /** 时间戳 */
  timestamp?: Date;
}

/**
 * 聊天请求
 * 发送给AI模型的请求参数
 */
export interface ChatRequest {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 模型ID */
  model: string;
  /** 是否使用流式响应 */
  stream: boolean;
  /** 温度参数（可选） */
  temperature?: number;
  /** 最大token数（可选） */
  maxTokens?: number;
}

/**
 * 聊天响应
 * AI模型返回的响应数据
 */
export interface ChatResponse {
  /** 响应内容 */
  content: string;
  /** 结束原因 */
  finishReason: 'stop' | 'length' | 'error';
  /** token使用情况（可选） */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 补全建议
 * 代码补全的建议项
 */
export interface CompletionSuggestion {
  /** 补全文本 */
  text: string;
  /** 补全类型 */
  kind: string;
  /** 详细信息（可选） */
  detail?: string;
  /** 文档说明（可选） */
  documentation?: string;
}

/**
 * API客户端接口
 * 定义了与AI模型交互的统一接口
 */
export interface IAPIClient {
  /**
   * 发送聊天请求
   * @param request 聊天请求参数
   * @returns 聊天响应
   */
  sendChatRequest(request: ChatRequest): Promise<ChatResponse>;

  /**
   * 发送流式聊天请求
   * @param request 聊天请求参数
   * @param onChunk 接收到数据块时的回调
   * @param onEnd 流结束时的回调
   * @param onError 发生错误时的回调
   */
  sendStreamChatRequest(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onEnd: () => void,
    onError: (error: Error) => void
  ): Promise<void>;

  /**
   * 发送补全请求
   * @param context 代码上下文
   * @param prefix 光标前的代码
   * @param suffix 光标后的代码
   * @returns 补全建议列表
   */
  sendCompletionRequest(
    context: CodeContext,
    prefix: string,
    suffix: string
  ): Promise<CompletionSuggestion[]>;

  /**
   * 验证API配置
   * @param config 模型配置
   * @returns 配置是否有效
   */
  validateConfig(config: ModelConfig): Promise<boolean>;
}

/**
 * 模型适配器接口
 * 每个模型提供商需要实现此接口
 */
export interface ModelAdapter {
  /**
   * 发送聊天请求
   * @param request 聊天请求参数
   * @returns 聊天响应
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * 发送流式聊天请求
   * @param request 聊天请求参数
   * @param onChunk 接收到数据块时的回调
   * @param onEnd 流结束时的回调
   * @param onError 发生错误时的回调
   */
  chatStream(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onEnd: () => void,
    onError: (error: Error) => void
  ): Promise<void>;

  /**
   * 发送补全请求
   * @param context 代码上下文
   * @param prefix 光标前的代码
   * @param suffix 光标后的代码
   * @returns 补全建议列表
   */
  complete(
    context: CodeContext,
    prefix: string,
    suffix: string
  ): Promise<CompletionSuggestion[]>;

  /**
   * 验证配置
   * @param config 模型配置
   * @returns 配置是否有效
   */
  validateConfig(config: ModelConfig): Promise<boolean>;

  /**
   * 计算token数量
   * @param text 文本内容
   * @returns token数量
   */
  countTokens(text: string): number;
}

/**
 * 依赖符号信息
 * 表示选中代码中使用的符号及其定义
 */
export interface DependencySymbol {
  /** 符号名称 */
  name: string;
  /** 定义文件路径 */
  filePath: string;
  /** 起始行号（从0开始） */
  startLine: number;
  /** 结束行号（从0开始） */
  endLine: number;
  /** 符号内容 */
  content: string;
  /** 上下文内容（前后各5行） */
  context: string;
  /** 文件URI */
  uri: string;
  /** 符号类型（类、方法、变量等） */
  kind: vscode.SymbolKind;
  /** 父符号名称（如果该符号是类的方法或属性） */
  parentName?: string;
}