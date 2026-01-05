/**
 * 日志过滤模块
 * 确保API密钥和敏感信息不出现在日志中
 * 验证需求: 7.2
 */

/**
 * 敏感信息模式接口
 */
export interface SensitivePattern {
  /** 模式名称 */
  name: string;
  /** 正则表达式 */
  pattern: RegExp;
  /** 替换文本 */
  replacement: string;
}

/**
 * 日志过滤器接口
 */
export interface ILogFilter {
  /**
   * 过滤字符串中的敏感信息
   * @param text 原始文本
   * @returns 过滤后的文本
   */
  filterString(text: string): string;

  /**
   * 过滤对象中的敏感信息
   * @param obj 原始对象
   * @returns 过滤后的对象
   */
  filterObject(obj: any): any;

  /**
   * 添加自定义敏感模式
   * @param pattern 敏感模式
   */
  addPattern(pattern: SensitivePattern): void;

  /**
   * 移除敏感模式
   * @param name 模式名称
   */
  removePattern(name: string): void;

  /**
   * 检查文本是否包含敏感信息
   * @param text 文本
   * @returns 是否包含敏感信息
   */
  containsSensitiveInfo(text: string): boolean;
}

/**
 * 日志过滤器实现
 */
export class LogFilter implements ILogFilter {
  /** 敏感信息模式列表 */
  private patterns: Map<string, SensitivePattern> = new Map();

  /** 敏感字段名列表 */
  private sensitiveKeys: Set<string> = new Set([
    'apikey',
    'api_key',
    'apiKey',
    'password',
    'passwd',
    'pwd',
    'secret',
    'token',
    'accesstoken',
    'access_token',
    'accessToken',
    'refreshtoken',
    'refresh_token',
    'refreshToken',
    'authorization',
    'auth',
    'credential',
    'credentials',
    'privatekey',
    'private_key',
    'privateKey',
    'secretkey',
    'secret_key',
    'secretKey',
  ]);

  constructor() {
    this.initializeDefaultPatterns();
  }

  /**
   * 初始化默认敏感模式
   */
  private initializeDefaultPatterns(): void {
    // OpenAI API密钥模式
    this.addPattern({
      name: 'openai-key',
      pattern: /sk-[a-zA-Z0-9]{32,}/g,
      replacement: 'sk-***REDACTED***',
    });

    // DeepSeek API密钥模式
    this.addPattern({
      name: 'deepseek-key',
      pattern: /ds-[a-zA-Z0-9]{32,}/g,
      replacement: 'ds-***REDACTED***',
    });

    // 智谱AI API密钥模式
    this.addPattern({
      name: 'zhipuai-key',
      pattern: /[a-f0-9]{32}\.[a-zA-Z0-9]{6}/g,
      replacement: '***REDACTED***',
    });

    // Bearer token模式
    this.addPattern({
      name: 'bearer-token',
      pattern: /Bearer\s+[a-zA-Z0-9._-]+/gi,
      replacement: 'Bearer ***REDACTED***',
    });

    // Authorization header模式
    this.addPattern({
      name: 'auth-header',
      pattern: /"authorization":\s*"[^"]+"/gi,
      replacement: '"authorization": "***REDACTED***"',
    });

    // Basic auth模式
    this.addPattern({
      name: 'basic-auth',
      pattern: /Basic\s+[a-zA-Z0-9+/=]+/gi,
      replacement: 'Basic ***REDACTED***',
    });

    // JWT token模式
    this.addPattern({
      name: 'jwt-token',
      pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
      replacement: 'eyJ***REDACTED***',
    });

    // 通用密钥模式（32位以上的十六进制字符串）
    this.addPattern({
      name: 'hex-key',
      pattern: /\b[a-f0-9]{32,}\b/gi,
      replacement: '***REDACTED***',
    });

    // AWS密钥模式
    this.addPattern({
      name: 'aws-key',
      pattern: /AKIA[0-9A-Z]{16}/g,
      replacement: 'AKIA***REDACTED***',
    });

    // GitHub token模式
    this.addPattern({
      name: 'github-token',
      pattern: /gh[pousr]_[a-zA-Z0-9]{36,}/g,
      replacement: 'gh***REDACTED***',
    });

    // 邮箱地址模式（可选，根据需求决定是否过滤）
    // this.addPattern({
    //   name: 'email',
    //   pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    //   replacement: '***@***.***',
    // });

    // IP地址模式（可选，根据需求决定是否过滤）
    // this.addPattern({
    //   name: 'ip-address',
    //   pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    //   replacement: '***.***.***.***',
    // });
  }

  /**
   * 过滤字符串中的敏感信息
   */
  filterString(text: string): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let filtered = text;

    // 应用所有模式
    for (const pattern of this.patterns.values()) {
      filtered = filtered.replace(pattern.pattern, pattern.replacement);
    }

    return filtered;
  }

  /**
   * 过滤对象中的敏感信息
   */
  filterObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // 如果是字符串，直接过滤
    if (typeof obj === 'string') {
      return this.filterString(obj);
    }

    // 如果是数字、布尔值等基本类型，直接返回
    if (typeof obj !== 'object') {
      return obj;
    }

    // 如果是数组，递归过滤每个元素
    if (Array.isArray(obj)) {
      return obj.map(item => this.filterObject(item));
    }

    // 如果是Date、RegExp等特殊对象，直接返回
    if (obj instanceof Date || obj instanceof RegExp) {
      return obj;
    }

    // 如果是普通对象，递归过滤每个属性
    const filtered: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // 检查是否是敏感字段
        if (this.isSensitiveKey(key)) {
          filtered[key] = '***REDACTED***';
        } else {
          // 递归过滤值
          const value = obj[key];
          if (typeof value === 'string') {
            filtered[key] = this.filterString(value);
          } else if (typeof value === 'object') {
            filtered[key] = this.filterObject(value);
          } else {
            filtered[key] = value;
          }
        }
      }
    }

    return filtered;
  }

  /**
   * 添加自定义敏感模式
   */
  addPattern(pattern: SensitivePattern): void {
    this.patterns.set(pattern.name, pattern);
  }

  /**
   * 移除敏感模式
   */
  removePattern(name: string): void {
    this.patterns.delete(name);
  }

  /**
   * 检查文本是否包含敏感信息
   */
  containsSensitiveInfo(text: string): boolean {
    if (!text || typeof text !== 'string') {
      return false;
    }

    // 检查是否匹配任何敏感模式
    for (const pattern of this.patterns.values()) {
      if (pattern.pattern.test(text)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查是否是敏感字段
   */
  private isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    
    // 精确匹配
    if (this.sensitiveKeys.has(lowerKey)) {
      return true;
    }

    // 部分匹配
    for (const sensitiveKey of this.sensitiveKeys) {
      if (lowerKey.includes(sensitiveKey)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 添加敏感字段名
   */
  addSensitiveKey(key: string): void {
    this.sensitiveKeys.add(key.toLowerCase());
  }

  /**
   * 移除敏感字段名
   */
  removeSensitiveKey(key: string): void {
    this.sensitiveKeys.delete(key.toLowerCase());
  }

  /**
   * 获取所有敏感模式
   */
  getPatterns(): SensitivePattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * 获取所有敏感字段名
   */
  getSensitiveKeys(): string[] {
    return Array.from(this.sensitiveKeys);
  }

  /**
   * 清空所有自定义模式
   */
  clearCustomPatterns(): void {
    this.patterns.clear();
    this.initializeDefaultPatterns();
  }

  /**
   * 过滤HTTP请求头
   */
  filterHeaders(headers: Record<string, string>): Record<string, string> {
    const filtered: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(headers)) {
      if (this.isSensitiveKey(key)) {
        filtered[key] = '***REDACTED***';
      } else {
        filtered[key] = this.filterString(value);
      }
    }

    return filtered;
  }

  /**
   * 过滤URL中的敏感信息（如查询参数中的token）
   */
  filterUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      return url;
    }

    try {
      const urlObj = new URL(url);
      
      // 过滤查询参数
      const params = new URLSearchParams(urlObj.search);
      for (const [key, value] of params.entries()) {
        if (this.isSensitiveKey(key)) {
          params.set(key, '***REDACTED***');
        } else {
          params.set(key, this.filterString(value));
        }
      }
      
      urlObj.search = params.toString();
      return urlObj.toString();
    } catch {
      // 如果不是有效的URL，直接过滤字符串
      return this.filterString(url);
    }
  }

  /**
   * 创建安全的错误消息
   */
  createSafeErrorMessage(error: Error | any): string {
    if (error instanceof Error) {
      const message = this.filterString(error.message);
      const stack = error.stack ? this.filterString(error.stack) : undefined;
      
      return stack 
        ? `${message}\nStack: ${stack}`
        : message;
    }

    if (typeof error === 'string') {
      return this.filterString(error);
    }

    if (typeof error === 'object') {
      const filtered = this.filterObject(error);
      return JSON.stringify(filtered);
    }

    return String(error);
  }
}

/**
 * 导出单例实例
 */
export const logFilter = new LogFilter();

/**
 * 便捷函数：过滤字符串
 */
export function filterSensitiveString(text: string): string {
  return logFilter.filterString(text);
}

/**
 * 便捷函数：过滤对象
 */
export function filterSensitiveObject(obj: any): any {
  return logFilter.filterObject(obj);
}

/**
 * 便捷函数：检查是否包含敏感信息
 */
export function containsSensitiveInfo(text: string): boolean {
  return logFilter.containsSensitiveInfo(text);
}
