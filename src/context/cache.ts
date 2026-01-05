/**
 * Context Cache
 * 负责缓存代码上下文信息，提高响应速度
 */

import { CodeContext } from '../api/types';
import { ParseResult } from './analyzer';

/**
 * 缓存条目接口
 * 包含缓存的数据和元数据
 */
interface CacheEntry<T> {
  /** 缓存的数据 */
  data: T;
  /** 创建时间戳 */
  timestamp: number;
  /** 文件的最后修改时间（用于验证缓存是否过期） */
  lastModified?: number;
  /** 访问次数 */
  accessCount: number;
  /** 最后访问时间 */
  lastAccess: number;
}

/**
 * 缓存配置接口
 */
interface CacheConfig {
  /** 最大缓存条目数 */
  maxSize: number;
  /** 缓存过期时间（毫秒） */
  ttl: number;
  /** 是否启用LRU淘汰策略 */
  enableLRU: boolean;
}

/**
 * Context Cache类
 * 实现上下文信息的缓存管理
 */
export class ContextCache {
  private cache: Map<string, CacheEntry<any>>;
  private config: CacheConfig;
  private fileWatchers: Map<string, number>;

  constructor(config?: Partial<CacheConfig>) {
    this.cache = new Map();
    this.fileWatchers = new Map();
    this.config = {
      maxSize: config?.maxSize ?? 100,
      ttl: config?.ttl ?? 5 * 60 * 1000, // 默认5分钟
      enableLRU: config?.enableLRU ?? true
    };
  }

  /**
   * 获取缓存的上下文
   * @param key 缓存键
   * @returns 缓存的上下文，如果不存在或已过期则返回null
   */
  get(key: string): CodeContext | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    // 更新访问信息
    entry.accessCount++;
    entry.lastAccess = Date.now();

    return entry.data as CodeContext;
  }

  /**
   * 设置缓存
   * @param key 缓存键
   * @param context 要缓存的上下文
   * @param lastModified 文件的最后修改时间（可选）
   */
  set(key: string, context: CodeContext, lastModified?: number): void {
    // 检查缓存大小，必要时清理
    if (this.cache.size >= this.config.maxSize) {
      this.evict();
    }

    const entry: CacheEntry<CodeContext> = {
      data: context,
      timestamp: Date.now(),
      lastModified,
      accessCount: 0,
      lastAccess: Date.now()
    };

    this.cache.set(key, entry);
  }

  /**
   * 获取缓存的解析结果
   * @param key 缓存键
   * @returns 缓存的解析结果，如果不存在或已过期则返回null
   */
  getParseResult(key: string): ParseResult | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    // 更新访问信息
    entry.accessCount++;
    entry.lastAccess = Date.now();

    return entry.data as ParseResult;
  }

  /**
   * 设置解析结果缓存
   * @param key 缓存键
   * @param result 解析结果
   * @param lastModified 文件的最后修改时间（可选）
   */
  setParseResult(key: string, result: ParseResult, lastModified?: number): void {
    // 检查缓存大小，必要时清理
    if (this.cache.size >= this.config.maxSize) {
      this.evict();
    }

    const entry: CacheEntry<ParseResult> = {
      data: result,
      timestamp: Date.now(),
      lastModified,
      accessCount: 0,
      lastAccess: Date.now()
    };

    this.cache.set(key, entry);
  }

  /**
   * 使指定文件的缓存失效
   * @param filePath 文件路径
   */
  invalidate(filePath: string): void {
    // 删除所有与该文件相关的缓存
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.includes(filePath)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * 增量更新缓存
   * 当文件内容发生变化时，只更新受影响的部分
   * @param filePath 文件路径
   * @param newContent 新的文件内容
   */
  incrementalUpdate(filePath: string, newContent: string): void {
    // 使相关缓存失效
    this.invalidate(filePath);

    // 在实际实现中，这里可以实现更智能的增量更新
    // 例如，只重新解析变化的函数或类
  }

  /**
   * 检查文件是否已修改
   * @param filePath 文件路径
   * @param currentModified 当前的修改时间
   * @returns 文件是否已修改
   */
  isFileModified(filePath: string, currentModified: number): boolean {
    const key = this.getFileKey(filePath);
    const entry = this.cache.get(key);

    if (!entry || !entry.lastModified) {
      return true;
    }

    return currentModified > entry.lastModified;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.fileWatchers.clear();
  }

  /**
   * 获取缓存统计信息
   * @returns 缓存统计数据
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{ key: string; accessCount: number; age: number }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      accessCount: entry.accessCount,
      age: Date.now() - entry.timestamp
    }));

    // 计算命中率（简化实现）
    const totalAccess = entries.reduce((sum, e) => sum + e.accessCount, 0);
    const hitRate = totalAccess > 0 ? entries.length / totalAccess : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate,
      entries
    };
  }

  /**
   * 检查缓存条目是否过期
   * @param entry 缓存条目
   * @returns 是否过期
   */
  private isExpired(entry: CacheEntry<any>): boolean {
    const age = Date.now() - entry.timestamp;
    return age > this.config.ttl;
  }

  /**
   * 淘汰缓存条目
   * 使用LRU（最近最少使用）策略
   */
  private evict(): void {
    if (!this.config.enableLRU) {
      // 如果不启用LRU，删除最旧的条目
      const oldestKey = this.findOldestEntry();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
      return;
    }

    // LRU策略：删除最久未访问的条目
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < lruTime) {
        lruTime = entry.lastAccess;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  /**
   * 找到最旧的缓存条目
   * @returns 最旧条目的键
   */
  private findOldestEntry(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * 生成文件的缓存键
   * @param filePath 文件路径
   * @returns 缓存键
   */
  private getFileKey(filePath: string): string {
    return `file:${filePath}`;
  }

  /**
   * 监听文件变化
   * @param filePath 文件路径
   * @param callback 文件变化时的回调
   */
  watchFile(filePath: string, callback: () => void): void {
    // 在实际实现中，这里会使用fs.watch或VSCode的文件监听API
    // 这里提供基础框架
    const watchId = Date.now();
    this.fileWatchers.set(filePath, watchId);
  }

  /**
   * 停止监听文件
   * @param filePath 文件路径
   */
  unwatchFile(filePath: string): void {
    this.fileWatchers.delete(filePath);
  }

  /**
   * 智能截断策略
   * 根据重要性和相关性对上下文进行智能截断
   * @param context 原始上下文
   * @param maxTokens 最大token数
   * @returns 截断后的上下文
   */
  smartTruncate(context: CodeContext, maxTokens: number): CodeContext {
    // 这个方法在ContextManager中实现
    // 这里保留接口以便将来扩展
    return context;
  }

  /**
   * 预热缓存
   * 预先加载常用文件的上下文
   * @param filePaths 要预热的文件路径列表
   */
  async warmup(filePaths: string[]): Promise<void> {
    // 在实际实现中，这里会并行加载多个文件的上下文
    // 提高首次访问的响应速度
  }

  /**
   * 压缩缓存
   * 清理过期和低价值的缓存条目
   */
  compact(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      // 删除过期条目
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
        continue;
      }

      // 删除长时间未访问的低价值条目
      const timeSinceLastAccess = now - entry.lastAccess;
      if (timeSinceLastAccess > this.config.ttl * 2 && entry.accessCount < 2) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }
}
