/**
 * Prompt 模板系统类型定义
 * 
 * 本文件定义了 Prompt 模板系统的核心类型和接口
 */

import { ChatMessage } from '../api/types';

/**
 * 意图类型
 * 定义系统支持的所有用户意图类型
 */
export type IntentType = 
  | 'chat'              // 通用对话
  | 'code-question'     // 代码问答
  | 'code-completion'   // 代码补全
  | 'code-explanation'  // 代码解释
  | 'code-generation'   // 代码生成
  | 'code-review';      // 代码审查

/**
 * 槽位配置
 * 定义模板中可替换槽位的配置信息
 */
export interface SlotConfig {
  /** 槽位名称 */
  name: string;
  /** 数据来源路径（使用点号分隔，如 'context.currentFile.language'） */
  sourcePath: string;
  /** 默认值（可选） */
  defaultValue?: string;
  /** 是否必需 */
  required?: boolean;
}

/**
 * 模板配置
 * 定义 Prompt 模板的完整配置结构
 */
export interface TemplateConfig {
  /** 模板类型（命名规范：hicode_操作类型_prompt_type，统一使用 hicode_common_chat_prompt_type） */
  templateType: string;
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description?: string;
  /** 适用的意图类型列表 */
  intents: IntentType[];
  /** 优先级（数字越大优先级越高） */
  priority: number;
  /** 模板内容 */
  content: string;
  /** 槽位配置列表 */
  slotConfig: SlotConfig[];
}

/**
 * 上下文数据结构
 * 存储从各种来源收集的上下文信息
 */
export interface ContextData {
  /** 用户查询 */
  user_query: string;
  /** 编程语言 */
  language: string;
  /** 对话历史 */
  history: string;
  /** 选中的代码 */
  selection: string;
  /** 当前文件内容 */
  current_file: string;
  /** 当前文件路径 */
  current_file_path: string;
  /** 相关文件信息 */
  related_files: string;
  /** 其他自定义字段 */
  [key: string]: string;
}

/**
 * 模板查询选项
 * 用于在模板注册表中查询模板
 */
export interface TemplateQueryOptions {
  /** 意图类型（可选） */
  intent?: IntentType;
  /** 模板类型（可选） */
  templateType?: string;
}

/**
 * 意图识别结果
 * 包含识别的意图类型和置信度
 */
export interface IntentRecognitionResult {
  /** 识别的意图类型 */
  intent: IntentType;
  /** 置信度（0-1） */
  confidence?: number;
}

/**
 * Prompt 管理器选项
 * 用于控制 enrichMessageContent 方法的行为
 */
export interface PromptManagerOptions {
  /** 直接指定意图类型（可选） */
  intent?: IntentType;
  /** 直接指定模板类型（可选） */
  templateType?: string;
}

/**
 * 模板注册表接口
 * 负责加载、存储和查询模板配置
 */
export interface ITemplateRegistry {
  /**
   * 加载所有模板配置
   */
  loadTemplates(): Promise<void>;
  
  /**
   * 查询模板（支持通过意图或模板类型查询）
   * @param options 查询选项
   * @returns 匹配的模板
   * 
   * 查询规则：
   * 1. 如果只提供 templateType：直接返回该类型的模板
   * 2. 如果只提供 intent：返回该意图下优先级最高的模板
   * 3. 如果同时提供 intent 和 templateType：返回该意图下指定类型的模板
   * 4. 如果都不提供：返回 undefined
   */
  getTemplate(options: TemplateQueryOptions): TemplateConfig | undefined;
  
  /**
   * 根据意图获取所有匹配的模板列表
   * @param intent 意图类型
   * @returns 按优先级排序的模板列表
   */
  getTemplatesByIntent(intent: IntentType): TemplateConfig[];
  
  /**
   * 根据模板类型获取模板
   * @param templateType 模板类型
   * @returns 模板配置或undefined
   */
  getTemplateByType(templateType: string): TemplateConfig | undefined;
  
  /**
   * 获取默认模板
   * @returns 默认通用模板
   */
  getDefaultTemplate(): TemplateConfig;
}

/**
 * 意图识别器接口
 * 负责识别用户意图
 */
export interface IIntentRecognizer {
  /**
   * 识别用户意图
   * @param message 用户消息
   * @returns 识别的意图类型
   */
  recognizeIntent(message: ChatMessage): Promise<IntentType>;
}

/**
 * 上下文收集器接口
 * 负责从消息中收集上下文数据
 */
export interface IContextCollector {
  /**
   * 从消息中收集上下文数据
   * @param message 聊天消息
   * @returns 结构化的上下文数据
   */
  collectContext(message: ChatMessage): ContextData;
}

/**
 * 模板渲染器接口
 * 负责执行槽位替换和模板渲染
 */
export interface ITemplateRenderer {
  /**
   * 渲染模板
   * @param template 模板配置
   * @param context 上下文数据
   * @returns 渲染后的字符串
   */
  render(template: TemplateConfig, context: ContextData): string;
}

/**
 * Prompt 管理器接口
 * 协调各组件，提供统一的接口
 */
export interface IPromptManager {
  /**
   * 丰富消息内容
   * 替换 adapter 中的 enrichMessageContent 方法
   * @param message 聊天消息
   * @param options 可选配置
   * @returns 丰富后的消息内容
   * 
   * 使用模式：
   * 1. 不提供 options：自动识别意图并选择模板
   * 2. 提供 intent：跳过意图识别，使用指定意图选择模板
   * 3. 提供 templateType：直接使用指定类型的模板
   * 4. 同时提供 intent 和 templateType：使用指定意图下的指定类型模板
   */
  enrichMessageContent(message: ChatMessage, options?: PromptManagerOptions): Promise<string>;
}
