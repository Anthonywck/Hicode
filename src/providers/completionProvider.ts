/**
 * AI Completion Provider
 * 提供AI驱动的代码补全功能
 * 
 * 需求: 3.1, 3.3, 3.4, 3.5
 */

import { APIClientManager } from '../api/client';
import { ContextManager } from '../context/manager';
import { CodeContext, CompletionSuggestion } from '../api/types';

/**
 * VSCode补全项类型（模拟）
 * 在实际VSCode扩展中，这些会从vscode模块导入
 */
export enum CompletionItemKind {
  Text = 0,
  Method = 1,
  Function = 2,
  Constructor = 3,
  Field = 4,
  Variable = 5,
  Class = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Unit = 10,
  Value = 11,
  Enum = 12,
  Keyword = 13,
  Snippet = 14,
  Color = 15,
  File = 16,
  Reference = 17,
  Folder = 18,
  EnumMember = 19,
  Constant = 20,
  Struct = 21,
  Event = 22,
  Operator = 23,
  TypeParameter = 24
}

/**
 * 文档位置接口
 */
export interface Position {
  line: number;
  character: number;
}

/**
 * 文档范围接口
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * 文档接口
 */
export interface TextDocument {
  uri: { fsPath: string };
  languageId: string;
  getText(range?: Range): string;
  lineCount: number;
  lineAt(line: number): { text: string };
  positionAt(offset: number): Position;
  offsetAt(position: Position): number;
}

/**
 * 补全上下文接口
 */
export interface CompletionContext {
  triggerKind: number;
  triggerCharacter?: string;
}

/**
 * 取消令牌接口
 */
export interface CancellationToken {
  isCancellationRequested: boolean;
  onCancellationRequested: (listener: () => void) => void;
}

/**
 * VSCode补全项接口
 */
export interface CompletionItem {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  range?: Range;
  sortText?: string;
  filterText?: string;
}

/**
 * 缓存项接口
 */
interface CacheEntry {
  suggestions: CompletionItem[];
  timestamp: number;
}

/**
 * 补全拒绝记录接口
 */
interface RejectionRecord {
  timestamp: Date;
  document: string;
  position: Position;
  suggestion: CompletionItem;
  context: {
    prefix: string;
    suffix: string;
    language: string;
  };
}

/**
 * AI补全提供者
 * 实现代码补全功能，集成API Client和Context Manager
 * 包含性能优化：防抖、请求取消、结果缓存
 * 包含拒绝记录：跟踪用户拒绝的补全建议
 */
export class AICompletionProvider {
  private apiClient: APIClientManager;
  private contextManager: ContextManager;
  
  // 性能优化相关
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceDelay: number = 300; // 300ms防抖延迟
  private cache: Map<string, CacheEntry> = new Map();
  private cacheMaxAge: number = 60000; // 缓存有效期：60秒
  private cacheMaxSize: number = 50; // 最大缓存条目数
  private pendingRequest: Promise<CompletionItem[]> | null = null;
  private abortController: AbortController | null = null;

  // 拒绝记录相关
  private rejectionRecords: RejectionRecord[] = [];
  private maxRejectionRecords: number = 1000; // 最大记录数
  private lastProvidedSuggestions: Map<string, CompletionItem[]> = new Map();

  /**
   * 构造函数
   * @param apiClient API客户端管理器
   * @param contextManager 上下文管理器
   * @param debounceDelay 防抖延迟（毫秒），默认300ms
   */
  constructor(
    apiClient: APIClientManager,
    contextManager: ContextManager,
    debounceDelay: number = 300
  ) {
    this.apiClient = apiClient;
    this.contextManager = contextManager;
    this.debounceDelay = debounceDelay;
  }

  /**
   * 提供补全项
   * 这是VSCode CompletionItemProvider接口的核心方法
   * 包含防抖、缓存和请求取消优化
   * 
   * @param document 当前文档
   * @param position 光标位置
   * @param token 取消令牌
   * @param context 补全上下文
   * @returns 补全项列表
   */
  async provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    context: CompletionContext
  ): Promise<CompletionItem[]> {
    try {
      // 检查是否已取消
      if (token.isCancellationRequested) {
        return [];
      }

      // 生成缓存键
      const { prefix, suffix } = this.extractPrefixAndSuffix(document, position);
      const cacheKey = this.generateCacheKey(document, position, prefix, suffix);

      // 检查缓存
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      // 检查是否已取消
      if (token.isCancellationRequested) {
        return [];
      }

      // 取消之前的请求
      if (this.abortController) {
        this.abortController.abort();
      }
      this.abortController = new AbortController();

      // 使用防抖机制
      const debouncedRequest = await this.debounce(async () => {
        // 检查是否已取消
        if (token.isCancellationRequested) {
          return [];
        }

        // 获取光标上下文
        const codeContext = await this.getCursorContextFromDocument(document, position);

        // 检查是否已取消
        if (token.isCancellationRequested) {
          return [];
        }

        // 调用API获取补全建议
        const suggestions = await this.apiClient.sendCompletionRequest(
          codeContext,
          prefix,
          suffix
        );

        // 检查是否已取消
        if (token.isCancellationRequested) {
          return [];
        }

        // 转换为VSCode补全项
        const items = suggestions.map(s => this.convertToCompletionItem(s, position));

        // 缓存结果
        this.addToCache(cacheKey, items);

        // 存储建议以便跟踪拒绝
        this.lastProvidedSuggestions.set(cacheKey, items);

        return items;
      });

      return debouncedRequest;
    } catch (error) {
      // 记录错误但不抛出，避免影响用户体验
      console.error('Failed to provide completion items:', error);
      return [];
    }
  }

  /**
   * 从文档获取光标上下文
   * 构建包含当前文件和光标位置信息的代码上下文
   * 
   * @param document 当前文档
   * @param position 光标位置
   * @returns 代码上下文
   */
  private async getCursorContextFromDocument(
    document: TextDocument,
    position: Position
  ): Promise<CodeContext> {
    // 获取基础上下文
    const context = await this.contextManager.getCursorContext();

    // 更新当前文件信息
    context.currentFile = {
      path: document.uri.fsPath,
      language: document.languageId,
      content: document.getText()
    };

    // 更新光标位置信息
    const offset = document.offsetAt(position);
    const text = document.getText();
    
    context.cursorContext = {
      line: position.line,
      column: position.character,
      beforeCursor: text.substring(0, offset),
      afterCursor: text.substring(offset)
    };

    return context;
  }

  /**
   * 提取前缀和后缀
   * 获取光标前后的代码片段用于补全
   * 
   * @param document 当前文档
   * @param position 光标位置
   * @returns 前缀和后缀
   */
  private extractPrefixAndSuffix(
    document: TextDocument,
    position: Position
  ): { prefix: string; suffix: string } {
    // 获取光标前10行的代码作为前缀
    const startLine = Math.max(0, position.line - 10);
    const prefixRange: Range = {
      start: { line: startLine, character: 0 },
      end: position
    };
    const prefix = document.getText(prefixRange);

    // 获取光标后10行的代码作为后缀
    const endLine = Math.min(document.lineCount - 1, position.line + 10);
    const suffixRange: Range = {
      start: position,
      end: { line: endLine, character: document.lineAt(endLine).text.length }
    };
    const suffix = document.getText(suffixRange);

    return { prefix, suffix };
  }

  /**
   * 转换为VSCode补全项
   * 将API返回的补全建议转换为VSCode补全项格式
   * 
   * @param suggestion 补全建议
   * @param position 光标位置
   * @returns VSCode补全项
   */
  private convertToCompletionItem(
    suggestion: CompletionSuggestion,
    position: Position
  ): CompletionItem {
    // 解析kind字符串为CompletionItemKind枚举
    const kind = this.parseCompletionKind(suggestion.kind);

    const item: CompletionItem = {
      label: suggestion.text,
      kind: kind,
      detail: suggestion.detail,
      documentation: suggestion.documentation,
      insertText: suggestion.text
    };

    return item;
  }

  /**
   * 解析补全类型
   * 将字符串类型转换为CompletionItemKind枚举
   * 
   * @param kindStr 类型字符串
   * @returns CompletionItemKind枚举值
   */
  private parseCompletionKind(kindStr: string): CompletionItemKind {
    const kindMap: { [key: string]: CompletionItemKind } = {
      'text': CompletionItemKind.Text,
      'method': CompletionItemKind.Method,
      'function': CompletionItemKind.Function,
      'constructor': CompletionItemKind.Constructor,
      'field': CompletionItemKind.Field,
      'variable': CompletionItemKind.Variable,
      'class': CompletionItemKind.Class,
      'interface': CompletionItemKind.Interface,
      'module': CompletionItemKind.Module,
      'property': CompletionItemKind.Property,
      'unit': CompletionItemKind.Unit,
      'value': CompletionItemKind.Value,
      'enum': CompletionItemKind.Enum,
      'keyword': CompletionItemKind.Keyword,
      'snippet': CompletionItemKind.Snippet,
      'color': CompletionItemKind.Color,
      'file': CompletionItemKind.File,
      'reference': CompletionItemKind.Reference,
      'folder': CompletionItemKind.Folder,
      'enummember': CompletionItemKind.EnumMember,
      'constant': CompletionItemKind.Constant,
      'struct': CompletionItemKind.Struct,
      'event': CompletionItemKind.Event,
      'operator': CompletionItemKind.Operator,
      'typeparameter': CompletionItemKind.TypeParameter
    };

    return kindMap[kindStr.toLowerCase()] || CompletionItemKind.Text;
  }

  /**
   * 防抖机制
   * 延迟执行函数，如果在延迟期间再次调用则重置计时器
   * 
   * @param fn 要执行的函数
   * @returns 函数执行结果
   */
  private debounce<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      // 清除之前的计时器
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      // 设置新的计时器
      this.debounceTimer = setTimeout(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, this.debounceDelay);
    });
  }

  /**
   * 生成缓存键
   * 基于文档路径、位置和上下文生成唯一键
   * 
   * @param document 文档
   * @param position 位置
   * @param prefix 前缀
   * @param suffix 后缀
   * @returns 缓存键
   */
  private generateCacheKey(
    document: TextDocument,
    position: Position,
    prefix: string,
    suffix: string
  ): string {
    // 使用文件路径、行号、列号和前后缀的哈希作为缓存键
    const key = `${document.uri.fsPath}:${position.line}:${position.character}:${this.hashString(prefix + suffix)}`;
    return key;
  }

  /**
   * 简单的字符串哈希函数
   * 
   * @param str 输入字符串
   * @returns 哈希值
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * 从缓存获取结果
   * 
   * @param key 缓存键
   * @returns 缓存的补全项，如果不存在或已过期则返回null
   */
  private getFromCache(key: string): CompletionItem[] | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - entry.timestamp > this.cacheMaxAge) {
      this.cache.delete(key);
      return null;
    }

    return entry.suggestions;
  }

  /**
   * 添加到缓存
   * 
   * @param key 缓存键
   * @param suggestions 补全项列表
   */
  private addToCache(key: string, suggestions: CompletionItem[]): void {
    // 检查缓存大小，如果超过限制则删除最旧的条目
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      suggestions,
      timestamp: Date.now()
    });
  }

  /**
   * 清空缓存
   * 可用于手动清理缓存或在配置更改时重置
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * 取消当前请求
   * 可用于在用户停止输入或切换文件时取消正在进行的请求
   */
  public cancelPendingRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.pendingRequest = null;
  }

  /**
   * 设置防抖延迟
   * 
   * @param delay 延迟时间（毫秒）
   */
  public setDebounceDelay(delay: number): void {
    this.debounceDelay = delay;
  }

  /**
   * 设置缓存配置
   * 
   * @param maxAge 最大缓存时间（毫秒）
   * @param maxSize 最大缓存条目数
   */
  public setCacheConfig(maxAge: number, maxSize: number): void {
    this.cacheMaxAge = maxAge;
    this.cacheMaxSize = maxSize;
  }

  /**
   * 记录补全拒绝
   * 当用户拒绝补全建议时调用（按ESC或继续输入）
   * 
   * @param document 文档
   * @param position 位置
   * @param suggestion 被拒绝的建议
   * @param prefix 前缀
   * @param suffix 后缀
   */
  public recordRejection(
    document: TextDocument,
    position: Position,
    suggestion: CompletionItem,
    prefix: string,
    suffix: string
  ): void {
    const record: RejectionRecord = {
      timestamp: new Date(),
      document: document.uri.fsPath,
      position: { line: position.line, character: position.character },
      suggestion: { ...suggestion },
      context: {
        prefix,
        suffix,
        language: document.languageId
      }
    };

    this.rejectionRecords.push(record);

    // 限制记录数量
    if (this.rejectionRecords.length > this.maxRejectionRecords) {
      this.rejectionRecords.shift(); // 删除最旧的记录
    }
  }

  /**
   * 记录所有未被接受的建议为拒绝
   * 当用户关闭补全列表或选择其他建议时调用
   * 
   * @param document 文档
   * @param position 位置
   * @param acceptedSuggestion 被接受的建议（如果有）
   */
  public recordUnacceptedSuggestions(
    document: TextDocument,
    position: Position,
    acceptedSuggestion?: CompletionItem
  ): void {
    const { prefix, suffix } = this.extractPrefixAndSuffix(document, position);
    const cacheKey = this.generateCacheKey(document, position, prefix, suffix);
    const suggestions = this.lastProvidedSuggestions.get(cacheKey);

    if (!suggestions) {
      return;
    }

    // 记录所有未被接受的建议
    for (const suggestion of suggestions) {
      if (!acceptedSuggestion || suggestion.label !== acceptedSuggestion.label) {
        this.recordRejection(document, position, suggestion, prefix, suffix);
      }
    }

    // 清除已处理的建议
    this.lastProvidedSuggestions.delete(cacheKey);
  }

  /**
   * 获取拒绝记录
   * 
   * @param limit 返回的最大记录数（可选）
   * @returns 拒绝记录列表
   */
  public getRejectionRecords(limit?: number): RejectionRecord[] {
    if (limit) {
      return this.rejectionRecords.slice(-limit);
    }
    return [...this.rejectionRecords];
  }

  /**
   * 获取拒绝统计
   * 返回按语言、建议类型等维度的统计信息
   * 
   * @returns 统计信息
   */
  public getRejectionStatistics(): {
    total: number;
    byLanguage: { [language: string]: number };
    byKind: { [kind: string]: number };
    recentRejections: number; // 最近1小时的拒绝数
  } {
    const stats = {
      total: this.rejectionRecords.length,
      byLanguage: {} as { [language: string]: number },
      byKind: {} as { [kind: string]: number },
      recentRejections: 0
    };

    const oneHourAgo = Date.now() - 3600000; // 1小时前

    for (const record of this.rejectionRecords) {
      // 按语言统计
      const lang = record.context.language;
      stats.byLanguage[lang] = (stats.byLanguage[lang] || 0) + 1;

      // 按类型统计
      const kind = CompletionItemKind[record.suggestion.kind];
      stats.byKind[kind] = (stats.byKind[kind] || 0) + 1;

      // 最近拒绝数
      if (record.timestamp.getTime() > oneHourAgo) {
        stats.recentRejections++;
      }
    }

    return stats;
  }

  /**
   * 清空拒绝记录
   */
  public clearRejectionRecords(): void {
    this.rejectionRecords = [];
    this.lastProvidedSuggestions.clear();
  }

  /**
   * 导出拒绝记录
   * 用于分析和改进补全质量
   * 
   * @returns JSON格式的拒绝记录
   */
  public exportRejectionRecords(): string {
    return JSON.stringify(this.rejectionRecords, null, 2);
  }

  /**
   * 设置最大拒绝记录数
   * 
   * @param max 最大记录数
   */
  public setMaxRejectionRecords(max: number): void {
    this.maxRejectionRecords = max;
    
    // 如果当前记录数超过新的限制，删除最旧的记录
    while (this.rejectionRecords.length > this.maxRejectionRecords) {
      this.rejectionRecords.shift();
    }
  }
}
