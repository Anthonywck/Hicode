/**
 * 错误处理器
 * 提供统一的错误处理、重试策略和用户友好的错误通知
 */

import * as vscode from 'vscode';

/**
 * 错误类型枚举
 */
export enum ErrorType {
  /** 网络错误 */
  NETWORK = 'network',
  /** API错误 */
  API = 'api',
  /** 认证错误 */
  AUTH = 'auth',
  /** 配置错误 */
  CONFIG = 'config',
  /** 超时错误 */
  TIMEOUT = 'timeout',
  /** 未知错误 */
  UNKNOWN = 'unknown',
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  /** 信息 */
  INFO = 'info',
  /** 警告 */
  WARNING = 'warning',
  /** 错误 */
  ERROR = 'error',
  /** 致命错误 */
  CRITICAL = 'critical',
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始延迟（毫秒） */
  initialDelay: number;
  /** 最大延迟（毫秒） */
  maxDelay: number;
  /** 延迟倍数 */
  backoffMultiplier: number;
  /** 可重试的错误类型 */
  retryableErrors: ErrorType[];
}

/**
 * 错误处理选项
 */
export interface ErrorHandlingOptions {
  /** 是否显示通知 */
  showNotification?: boolean;
  /** 是否记录日志 */
  logError?: boolean;
  /** 重试配置 */
  retryConfig?: Partial<RetryConfig>;
  /** 降级处理函数 */
  fallback?: () => any;
  /** 错误上下文信息 */
  context?: Record<string, any>;
}

/**
 * 应用错误类
 */
export class AppError extends Error {
  constructor(
    message: string,
    public type: ErrorType = ErrorType.UNKNOWN,
    public severity: ErrorSeverity = ErrorSeverity.ERROR,
    public originalError?: Error,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
    
    // 保持正确的原型链
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(): string {
    switch (this.type) {
      case ErrorType.NETWORK:
        return '网络连接失败，请检查您的网络设置';
      case ErrorType.API:
        return 'API调用失败，请稍后重试';
      case ErrorType.AUTH:
        return '认证失败，请检查您的API密钥';
      case ErrorType.CONFIG:
        return '配置错误，请检查您的设置';
      case ErrorType.TIMEOUT:
        return '请求超时，请稍后重试';
      default:
        return this.message || '发生未知错误';
    }
  }

  /**
   * 获取解决建议
   */
  getSuggestion(): string | undefined {
    switch (this.type) {
      case ErrorType.NETWORK:
        return '请检查网络连接，确保可以访问外部服务';
      case ErrorType.API:
        return '请检查API配置是否正确，或稍后重试';
      case ErrorType.AUTH:
        return '请在设置中更新您的API密钥';
      case ErrorType.CONFIG:
        return '请打开设置检查配置项';
      case ErrorType.TIMEOUT:
        return '请检查网络连接或增加超时时间';
      default:
        return undefined;
    }
  }
}

/**
 * 错误处理器类
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryableErrors: [ErrorType.NETWORK, ErrorType.TIMEOUT, ErrorType.API],
  };

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * 处理错误
   * @param error 错误对象
   * @param options 处理选项
   */
  async handleError(
    error: Error | AppError,
    options: ErrorHandlingOptions = {}
  ): Promise<void> {
    const appError = this.normalizeError(error);

    // 记录日志
    if (options.logError !== false) {
      this.logError(appError, options.context);
    }

    // 显示通知
    if (options.showNotification !== false) {
      await this.showErrorNotification(appError);
    }

    // 执行降级处理
    if (options.fallback) {
      try {
        return await options.fallback();
      } catch (fallbackError) {
        console.error('Fallback execution failed:', fallbackError);
      }
    }
  }

  /**
   * 带重试的执行函数
   * @param fn 要执行的函数
   * @param options 错误处理选项
   * @returns 执行结果
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: ErrorHandlingOptions = {}
  ): Promise<T> {
    const retryConfig = {
      ...this.defaultRetryConfig,
      ...options.retryConfig,
    };

    let lastError: Error | undefined;
    let delay = retryConfig.initialDelay;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const appError = this.normalizeError(lastError);

        // 检查是否可重试
        if (
          attempt < retryConfig.maxRetries &&
          this.isRetryable(appError, retryConfig)
        ) {
          // 记录重试日志
          console.log(
            `Retry attempt ${attempt + 1}/${retryConfig.maxRetries} after ${delay}ms`
          );

          // 等待后重试
          await this.sleep(delay);

          // 增加延迟（指数退避）
          delay = Math.min(
            delay * retryConfig.backoffMultiplier,
            retryConfig.maxDelay
          );
        } else {
          // 不可重试或达到最大重试次数
          break;
        }
      }
    }

    // 所有重试都失败，处理错误
    if (lastError) {
      await this.handleError(lastError, options);
      throw lastError;
    }

    throw new Error('Unexpected error in executeWithRetry');
  }

  /**
   * 包装异步函数，自动处理错误
   * @param fn 要包装的函数
   * @param options 错误处理选项
   * @returns 包装后的函数
   */
  wrapAsync<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    options: ErrorHandlingOptions = {}
  ): (...args: T) => Promise<R | undefined> {
    return async (...args: T): Promise<R | undefined> => {
      try {
        return await fn(...args);
      } catch (error) {
        await this.handleError(error as Error, options);
        return undefined;
      }
    };
  }

  /**
   * 标准化错误对象
   * @param error 原始错误
   * @returns AppError实例
   */
  private normalizeError(error: Error | AppError): AppError {
    if (error instanceof AppError) {
      return error;
    }

    // 检测错误类型
    const errorType = this.detectErrorType(error);
    const severity = this.detectSeverity(errorType);

    return new AppError(
      error.message,
      errorType,
      severity,
      error
    );
  }

  /**
   * 检测错误类型
   * @param error 错误对象
   * @returns 错误类型
   */
  private detectErrorType(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('无法连接')
    ) {
      return ErrorType.NETWORK;
    }

    if (
      message.includes('timeout') ||
      message.includes('超时')
    ) {
      return ErrorType.TIMEOUT;
    }

    if (
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('api key') ||
      message.includes('认证') ||
      message.includes('401')
    ) {
      return ErrorType.AUTH;
    }

    if (
      message.includes('config') ||
      message.includes('配置') ||
      message.includes('invalid')
    ) {
      return ErrorType.CONFIG;
    }

    if (
      message.includes('api') ||
      message.includes('400') ||
      message.includes('500')
    ) {
      return ErrorType.API;
    }

    return ErrorType.UNKNOWN;
  }

  /**
   * 检测错误严重程度
   * @param errorType 错误类型
   * @returns 严重程度
   */
  private detectSeverity(errorType: ErrorType): ErrorSeverity {
    switch (errorType) {
      case ErrorType.AUTH:
      case ErrorType.CONFIG:
        return ErrorSeverity.CRITICAL;
      case ErrorType.API:
      case ErrorType.NETWORK:
        return ErrorSeverity.ERROR;
      case ErrorType.TIMEOUT:
        return ErrorSeverity.WARNING;
      default:
        return ErrorSeverity.ERROR;
    }
  }

  /**
   * 判断错误是否可重试
   * @param error 错误对象
   * @param config 重试配置
   * @returns 是否可重试
   */
  private isRetryable(error: AppError, config: RetryConfig): boolean {
    return config.retryableErrors.includes(error.type);
  }

  /**
   * 显示错误通知
   * @param error 错误对象
   */
  private async showErrorNotification(error: AppError): Promise<void> {
    const message = error.getUserMessage();
    const suggestion = error.getSuggestion();
    const fullMessage = suggestion ? `${message}\n\n${suggestion}` : message;

    const actions: string[] = [];

    // 根据错误类型添加操作按钮
    if (error.type === ErrorType.AUTH || error.type === ErrorType.CONFIG) {
      actions.push('打开设置');
    }
    actions.push('查看详情', '忽略');

    let selectedAction: string | undefined;

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        selectedAction = await vscode.window.showErrorMessage(
          fullMessage,
          ...actions
        );
        break;
      case ErrorSeverity.ERROR:
        selectedAction = await vscode.window.showErrorMessage(
          fullMessage,
          ...actions
        );
        break;
      case ErrorSeverity.WARNING:
        selectedAction = await vscode.window.showWarningMessage(
          fullMessage,
          ...actions
        );
        break;
      case ErrorSeverity.INFO:
        selectedAction = await vscode.window.showInformationMessage(
          fullMessage,
          ...actions
        );
        break;
    }

    // 处理用户操作
    if (selectedAction === '打开设置') {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'hicode'
      );
    } else if (selectedAction === '查看详情') {
      this.showErrorDetails(error);
    }
  }

  /**
   * 显示错误详情
   * @param error 错误对象
   */
  private showErrorDetails(error: AppError): void {
    const details = [
      `错误类型: ${error.type}`,
      `严重程度: ${error.severity}`,
      `消息: ${error.message}`,
    ];

    if (error.originalError) {
      details.push(`原始错误: ${error.originalError.message}`);
      if (error.originalError.stack) {
        details.push(`堆栈: ${error.originalError.stack}`);
      }
    }

    if (error.context) {
      details.push(`上下文: ${JSON.stringify(error.context, null, 2)}`);
    }

    const detailsText = details.join('\n\n');

    vscode.window.showInformationMessage(
      '错误详情',
      { modal: true, detail: detailsText }
    );
  }

  /**
   * 记录错误日志
   * @param error 错误对象
   * @param context 上下文信息
   */
  private logError(error: AppError, context?: Record<string, any>): void {
    const logMessage = [
      `[${error.severity.toUpperCase()}] ${error.type}:`,
      error.message,
    ];

    if (error.originalError) {
      logMessage.push(`Original: ${error.originalError.message}`);
    }

    if (context) {
      logMessage.push(`Context: ${JSON.stringify(context)}`);
    }

    if (error.originalError?.stack) {
      logMessage.push(`Stack: ${error.originalError.stack}`);
    }

    console.error(logMessage.join('\n'));
  }

  /**
   * 延迟函数
   * @param ms 延迟毫秒数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 导出便捷函数
 */
export const errorHandler = ErrorHandler.getInstance();

/**
 * 创建应用错误
 */
export function createError(
  message: string,
  type: ErrorType = ErrorType.UNKNOWN,
  severity: ErrorSeverity = ErrorSeverity.ERROR,
  originalError?: Error,
  context?: Record<string, any>
): AppError {
  return new AppError(message, type, severity, originalError, context);
}

/**
 * 处理错误的便捷函数
 */
export async function handleError(
  error: Error | AppError,
  options?: ErrorHandlingOptions
): Promise<void> {
  return errorHandler.handleError(error, options);
}

/**
 * 带重试执行的便捷函数
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options?: ErrorHandlingOptions
): Promise<T> {
  return errorHandler.executeWithRetry(fn, options);
}
