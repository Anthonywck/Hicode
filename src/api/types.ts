/**
 * API类型定义和接口
 * 定义了与AI模型交互的核心数据结构和接口
 */

import * as vscode from 'vscode';

/**
 * 模型配置（新版本 - 基于 opencode 架构）
 * 包含模型的基本信息和API连接配置
 */
export interface ModelConfig {
  /** 唯一标识符（格式：providerID/modelID） */
  modelId: string;
  
  /** 显示名称（用户友好） */
  displayName: string;
  
  /** 提供商标识 */
  providerID: string;
  
  /** 模型ID（在提供商内的标识） */
  modelID: string;
  
  /** API配置 */
  api: {
    /** API模型ID（可能与modelID不同） */
    id: string;
    /** API基础URL */
    url: string;
    /** 使用的SDK包名 */
    npm: string;
  };
  
  /** 模型能力 */
  capabilities: {
    temperature: boolean;
    reasoning: boolean;
    attachment: boolean;
    toolcall: boolean;
    input: {
      text: boolean;
      audio: boolean;
      image: boolean;
      video: boolean;
      pdf: boolean;
    };
    output: {
      text: boolean;
      audio: boolean;
      image: boolean;
      video: boolean;
      pdf: boolean;
    };
  };
  
  /** 模型限制 */
  limit: {
    context: number;        // 最大上下文token数（原 maxContextTokens）
    input?: number;         // 最大输入token数
    output: number;         // 最大输出token数（原 maxOutputTokens）
  };
  
  /** 成本配置 */
  cost: {
    input: number;
    output: number;
    cache: {
      read: number;
      write: number;
    };
  };
  
  /** 状态 */
  status: 'alpha' | 'beta' | 'deprecated' | 'active';
  
  /** 发布日期 */
  release_date: string;
  
  /** 自定义选项 */
  options?: Record<string, any>;
  
  /** 自定义Headers */
  headers?: Record<string, string>;
  
  /** 模型描述（用户备注） */
  modelDescription?: string;
  
  // === 向后兼容字段 ===
  /** @deprecated 使用 limit.context 替代 */
  maxContextTokens?: number;
  /** @deprecated 使用 limit.output 替代 */
  maxOutputTokens?: number;
  /** @deprecated 使用 capabilities.input 替代 */
  supportMultimodal?: boolean;
  /** @deprecated 使用 providerID 替代 */
  vendor?: 'deepseek' | 'openai' | 'zhipuai' | 'custom';
  /** @deprecated 使用 api.id 替代 */
  modelName?: string;
  /** @deprecated 使用 api.url 替代 */
  apiBaseUrl?: string;
  /** API密钥（存储在SecretStorage，不在此结构中） */
  apiKey?: string;
}

/**
 * Provider 信息
 */
export interface ProviderInfo {
  /** 提供商标识 */
  id: string;
  
  /** 提供商名称 */
  name: string;
  
  /** 配置来源 */
  source: 'env' | 'config' | 'custom' | 'api';
  
  /** 环境变量名列表 */
  env: string[];
  
  /** API密钥 */
  key?: string;
  
  /** 提供商特定选项 */
  options?: Record<string, any>;
  
  /** 该提供商下的模型列表 */
  models: Record<string, ModelConfig>;
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
  /** 模型ID（格式：providerID/modelID 或 modelId） */
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
 * 模型适配器接口（保留用于向后兼容）
 * @deprecated 使用 Provider 系统替代
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
