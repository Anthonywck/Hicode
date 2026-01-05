/**
 * 日志工具
 * 提供统一的日志记录功能，支持不同日志级别和日志文件管理
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logFilter } from '../security/logFilter';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  /** 调试信息 */
  DEBUG = 0,
  /** 一般信息 */
  INFO = 1,
  /** 警告信息 */
  WARN = 2,
  /** 错误信息 */
  ERROR = 3,
  /** 不输出日志 */
  NONE = 4,
}

/**
 * 日志条目接口
 */
export interface LogEntry {
  /** 时间戳 */
  timestamp: Date;
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息 */
  message: string;
  /** 额外数据 */
  data?: any;
  /** 来源 */
  source?: string;
}

/**
 * 日志配置接口
 */
export interface LoggerConfig {
  /** 最小日志级别 */
  minLevel: LogLevel;
  /** 是否输出到控制台 */
  enableConsole: boolean;
  /** 是否输出到文件 */
  enableFile: boolean;
  /** 是否输出到输出面板 */
  enableOutputChannel: boolean;
  /** 日志文件路径 */
  logFilePath?: string;
  /** 最大日志文件大小（字节） */
  maxFileSize: number;
  /** 保留的日志文件数量 */
  maxFiles: number;
  /** 是否过滤敏感信息 */
  filterSensitive: boolean;
}

/**
 * 日志管理器类
 */
export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private outputChannel: vscode.OutputChannel | null = null;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 1000;
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      minLevel: LogLevel.INFO,
      enableConsole: true,
      enableFile: true,
      enableOutputChannel: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      filterSensitive: true,
      ...config,
    };
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * 初始化日志器
   * @param context VSCode扩展上下文
   */
  initialize(context: vscode.ExtensionContext): void {
    // 创建输出通道
    if (this.config.enableOutputChannel) {
      this.outputChannel = vscode.window.createOutputChannel('HiCode');
      context.subscriptions.push(this.outputChannel);
    }

    // 设置日志文件路径
    if (this.config.enableFile && !this.config.logFilePath) {
      const logDir = path.join(context.globalStorageUri.fsPath, 'logs');
      this.ensureDirectoryExists(logDir);
      this.config.logFilePath = path.join(
        logDir,
        `hicode-${this.getDateString()}.log`
      );
    }

    // 从配置读取日志级别
    const workspaceConfig = vscode.workspace.getConfiguration('hicode');
    const configLevel = workspaceConfig.get<string>('logLevel', 'info');
    this.config.minLevel = this.parseLogLevel(configLevel);

    this.info('Logger initialized', { config: this.config });
  }

  /**
   * 更新配置
   * @param config 新配置
   */
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    this.info('Logger configuration updated', { config: this.config });
  }

  /**
   * 设置日志级别
   * @param level 日志级别
   */
  setLevel(level: LogLevel): void {
    this.config.minLevel = level;
    this.info(`Log level set to ${LogLevel[level]}`);
  }

  /**
   * 记录调试信息
   * @param message 消息
   * @param data 额外数据
   * @param source 来源
   */
  debug(message: string, data?: any, source?: string): void {
    this.log(LogLevel.DEBUG, message, data, source);
  }

  /**
   * 记录一般信息
   * @param message 消息
   * @param data 额外数据
   * @param source 来源
   */
  info(message: string, data?: any, source?: string): void {
    this.log(LogLevel.INFO, message, data, source);
  }

  /**
   * 记录警告信息
   * @param message 消息
   * @param data 额外数据
   * @param source 来源
   */
  warn(message: string, data?: any, source?: string): void {
    this.log(LogLevel.WARN, message, data, source);
  }

  /**
   * 记录错误信息
   * @param message 消息
   * @param error 错误对象
   * @param source 来源
   */
  error(message: string, error?: Error | any, source?: string): void {
    const data = error instanceof Error
      ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        }
      : error;
    this.log(LogLevel.ERROR, message, data, source);
  }

  /**
   * 记录API请求
   * @param method HTTP方法
   * @param url URL
   * @param data 请求数据
   */
  logApiRequest(method: string, url: string, data?: any): void {
    const sanitizedData = this.sanitizeData(data);
    this.debug(`API Request: ${method} ${url}`, sanitizedData, 'API');
  }

  /**
   * 记录API响应
   * @param method HTTP方法
   * @param url URL
   * @param status 状态码
   * @param data 响应数据
   */
  logApiResponse(
    method: string,
    url: string,
    status: number,
    data?: any
  ): void {
    const sanitizedData = this.sanitizeData(data);
    this.debug(
      `API Response: ${method} ${url} - ${status}`,
      sanitizedData,
      'API'
    );
  }

  /**
   * 记录API错误
   * @param method HTTP方法
   * @param url URL
   * @param error 错误对象
   */
  logApiError(method: string, url: string, error: Error | any): void {
    this.error(`API Error: ${method} ${url}`, error, 'API');
  }

  /**
   * 获取日志历史
   * @param count 获取数量
   * @returns 日志条目数组
   */
  getHistory(count?: number): LogEntry[] {
    if (count) {
      return this.logBuffer.slice(-count);
    }
    return [...this.logBuffer];
  }

  /**
   * 清空日志缓冲区
   */
  clearBuffer(): void {
    this.logBuffer = [];
    this.info('Log buffer cleared');
  }

  /**
   * 导出日志到文件
   * @param filePath 文件路径
   */
  async exportLogs(filePath: string): Promise<void> {
    try {
      const logs = this.logBuffer.map(entry => this.formatLogEntry(entry));
      const content = logs.join('\n');
      await fs.promises.writeFile(filePath, content, 'utf-8');
      this.info(`Logs exported to ${filePath}`);
    } catch (error) {
      this.error('Failed to export logs', error);
      throw error;
    }
  }

  /**
   * 显示输出面板
   */
  show(): void {
    if (this.outputChannel) {
      this.outputChannel.show();
    }
  }

  /**
   * 清空输出面板
   */
  clear(): void {
    if (this.outputChannel) {
      this.outputChannel.clear();
    }
  }

  /**
   * 销毁日志器
   */
  dispose(): void {
    if (this.outputChannel) {
      this.outputChannel.dispose();
      this.outputChannel = null;
    }
    this.clearBuffer();
  }

  /**
   * 核心日志记录方法
   * @param level 日志级别
   * @param message 消息
   * @param data 额外数据
   * @param source 来源
   */
  private log(
    level: LogLevel,
    message: string,
    data?: any,
    source?: string
  ): void {
    // 检查日志级别
    if (level < this.config.minLevel) {
      return;
    }

    // 创建日志条目
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data: this.config.filterSensitive ? this.sanitizeData(data) : data,
      source,
    };

    // 添加到缓冲区
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    // 格式化日志消息
    const formattedMessage = this.formatLogEntry(entry);

    // 输出到控制台
    if (this.config.enableConsole) {
      this.logToConsole(level, formattedMessage);
    }

    // 输出到输出面板
    if (this.config.enableOutputChannel && this.outputChannel) {
      this.outputChannel.appendLine(formattedMessage);
    }

    // 输出到文件
    if (this.config.enableFile && this.config.logFilePath) {
      this.logToFile(formattedMessage);
    }
  }

  /**
   * 输出到控制台
   * @param level 日志级别
   * @param message 消息
   */
  private logToConsole(level: LogLevel, message: string): void {
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.ERROR:
        console.error(message);
        break;
    }
  }

  /**
   * 输出到文件
   * @param message 消息
   */
  private logToFile(message: string): void {
    if (!this.config.logFilePath) {
      return;
    }

    // 使用队列确保写入顺序
    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          // 检查文件大小
          await this.rotateLogFileIfNeeded();

          // 追加日志
          await fs.promises.appendFile(
            this.config.logFilePath!,
            message + '\n',
            'utf-8'
          );
        } catch (error) {
          console.error('Failed to write log to file:', error);
        }
      })
      .catch(error => {
        console.error('Log write queue error:', error);
      });
  }

  /**
   * 轮转日志文件
   */
  private async rotateLogFileIfNeeded(): Promise<void> {
    if (!this.config.logFilePath) {
      return;
    }

    try {
      const stats = await fs.promises.stat(this.config.logFilePath);

      if (stats.size >= this.config.maxFileSize) {
        // 轮转日志文件
        const dir = path.dirname(this.config.logFilePath);
        const ext = path.extname(this.config.logFilePath);
        const basename = path.basename(this.config.logFilePath, ext);

        // 移动现有文件
        for (let i = this.config.maxFiles - 1; i > 0; i--) {
          const oldPath = path.join(dir, `${basename}.${i}${ext}`);
          const newPath = path.join(dir, `${basename}.${i + 1}${ext}`);

          if (fs.existsSync(oldPath)) {
            if (i === this.config.maxFiles - 1) {
              // 删除最老的文件
              await fs.promises.unlink(oldPath);
            } else {
              await fs.promises.rename(oldPath, newPath);
            }
          }
        }

        // 移动当前文件
        const archivePath = path.join(dir, `${basename}.1${ext}`);
        await fs.promises.rename(this.config.logFilePath, archivePath);
      }
    } catch (error) {
      // 文件不存在或其他错误，忽略
    }
  }

  /**
   * 格式化日志条目
   * @param entry 日志条目
   * @returns 格式化后的字符串
   */
  private formatLogEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = LogLevel[entry.level].padEnd(5);
    const source = entry.source ? `[${entry.source}]` : '';
    const message = entry.message;

    let formatted = `${timestamp} ${level} ${source} ${message}`;

    if (entry.data !== undefined) {
      try {
        const dataStr =
          typeof entry.data === 'string'
            ? entry.data
            : JSON.stringify(entry.data, null, 2);
        formatted += `\n${dataStr}`;
      } catch (error) {
        formatted += `\n[Unable to serialize data]`;
      }
    }

    return formatted;
  }

  /**
   * 过滤敏感信息
   * @param data 数据
   * @returns 过滤后的数据
   */
  private sanitizeData(data: any): any {
    // 使用专用的日志过滤器
    return logFilter.filterObject(data);
  }

  /**
   * 过滤字符串中的敏感信息
   * @param str 字符串
   * @returns 过滤后的字符串
   */
  private sanitizeString(str: string): string {
    // 使用专用的日志过滤器
    return logFilter.filterString(str);
  }

  /**
   * 解析日志级别字符串
   * @param level 级别字符串
   * @returns 日志级别
   */
  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
      case 'warning':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      case 'none':
        return LogLevel.NONE;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * 确保目录存在
   * @param dirPath 目录路径
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * 获取日期字符串
   * @returns 格式化的日期字符串
   */
  private getDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * 导出便捷函数
 */
export const logger = Logger.getInstance();

/**
 * 创建带来源的日志器
 * @param source 来源标识
 * @returns 日志记录函数
 */
export function createLogger(source: string) {
  return {
    debug: (message: string, data?: any) => logger.debug(message, data, source),
    info: (message: string, data?: any) => logger.info(message, data, source),
    warn: (message: string, data?: any) => logger.warn(message, data, source),
    error: (message: string, error?: Error | any) =>
      logger.error(message, error, source),
  };
}
