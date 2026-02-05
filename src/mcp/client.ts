/**
 * MCP 客户端
 * 管理 Model Context Protocol 服务器连接
 */

import { createLogger } from '../utils/logger';
import * as vscode from 'vscode';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { McpOAuthProvider } from './oauth-provider';
import { McpOAuthCallback } from './oauth-callback';
import { getExtensionContext } from '../extension';

const log = createLogger('mcp.client');
const DEFAULT_TIMEOUT = 30_000;

/**
 * MCP 配置类型
 */
export interface McpConfig {
  type: 'local' | 'remote';
  enabled?: boolean;
  timeout?: number;
  command?: string[];
  url?: string;
  headers?: Record<string, string>;
  environment?: Record<string, string>;
  oauth?: boolean | {
    clientId?: string;
    clientSecret?: string;
    scope?: string;
  };
}

/**
 * MCP 连接状态
 * 表示 MCP 服务器的当前连接状态
 */
export type McpStatus =
  | { status: 'connected' } // 已连接
  | { status: 'disabled' } // 已禁用
  | { status: 'failed'; error: string } // 连接失败（包含错误信息）
  | { status: 'needs_auth' } // 需要认证
  | { status: 'needs_client_registration'; error: string }; // 需要客户端注册（包含错误信息）

/**
 * MCP 客户端接口
 * 定义 MCP 客户端的基本操作
 */
export interface McpClient {
  /** 客户端名称 */
  name: string;
  /** 连接状态 */
  status: McpStatus;
  /** 关闭连接 */
  close(): Promise<void>;
  /** 列出所有可用工具 */
  listTools(): Promise<{ tools: Array<{ name: string; description?: string; inputSchema?: any }> }>;
  /** 调用工具 */
  callTool(name: string, args: Record<string, unknown>): Promise<any>;
  /** 列出所有可用资源 */
  listResources(): Promise<{ resources: Array<{ name: string; uri: string; description?: string }> }>;
  /** 读取资源 */
  readResource(uri: string): Promise<any>;
}

/**
 * MCP 客户端实现类
 * 封装 MCP SDK 的 Client 实例，提供统一的接口
 */
class McpClientImpl implements McpClient {
  constructor(
    public name: string,
    private client: Client,
    public status: McpStatus
  ) {}

  async close(): Promise<void> {
    await this.client.close();
  }

  async listTools(): Promise<{ tools: Array<{ name: string; description?: string; inputSchema?: any }> }> {
    const result = await this.client.listTools();
    return {
      tools: result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<any> {
    const result = await this.client.callTool({
      name,
      arguments: args,
    });
    return result;
  }

  async listResources(): Promise<{ resources: Array<{ name: string; uri: string; description?: string }> }> {
    const result = await this.client.listResources();
    return {
      resources: result.resources.map((resource) => ({
        name: resource.name,
        uri: resource.uri,
        description: resource.description,
      })),
    };
  }

  async readResource(uri: string): Promise<any> {
    const result = await this.client.readResource({ uri });
    return result;
  }
}

/**
 * 注册 MCP 客户端的通知处理器
 * 监听工具列表变更等通知事件
 * @param client MCP 客户端实例
 * @param serverName 服务器名称（用于日志）
 */
function registerNotificationHandlers(client: Client, serverName: string): void {
  // 监听工具列表变更通知
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    log.info('tools list changed notification received', { server: serverName });
  });
}

/**
 * 超时包装器
 * 为 Promise 添加超时功能，防止操作无限期等待
 * @param promise 要包装的 Promise
 * @param timeout 超时时间（毫秒）
 * @returns 带超时的 Promise
 */
async function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  return Promise.race([
    promise,
    // 超时 Promise，在指定时间后拒绝
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
    ),
  ]);
}

/**
 * MCP 客户端管理器
 */
export class McpClientManager {
  private clients: Map<string, McpClient> = new Map();
  private statuses: Map<string, McpStatus> = new Map();

  /**
   * 创建 MCP 客户端
   */
  async create(name: string, config: McpConfig): Promise<{ client?: McpClient; status: McpStatus }> {
    if (config.enabled === false) {
      this.statuses.set(name, { status: 'disabled' });
      return { status: { status: 'disabled' } };
    }

    try {
      if (config.type === 'local') {
        return await this.createLocalClient(name, config);
      } else if (config.type === 'remote') {
        return await this.createRemoteClient(name, config);
      } else {
        return {
          status: { status: 'failed', error: 'Unknown MCP type' },
        };
      }
    } catch (error) {
      log.error('创建 MCP 客户端失败', { name, error });
      return {
        status: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * 创建本地 MCP 客户端（stdio）
   * 通过标准输入输出与本地进程通信
   * @param name MCP 服务器名称
   * @param config MCP 配置
   * @returns 客户端实例和状态
   */
  private async createLocalClient(name: string, config: McpConfig): Promise<{ client?: McpClient; status: McpStatus }> {
    // 验证命令配置
    if (!config.command || config.command.length === 0) {
      return {
        status: { status: 'failed', error: 'Local MCP requires command' },
      };
    }

    try {
      // 解析命令和参数
      const [cmd, ...args] = config.command;
      // 获取工作目录（优先使用工作区根目录）
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

      // 创建 stdio 传输层
      const transport = new StdioClientTransport({
        stderr: 'pipe', // 捕获标准错误输出
        command: cmd,
        args,
        cwd,
        env: Object.fromEntries(
          Object.entries({
            ...process.env, // 继承当前环境变量
            ...config.environment, // 合并配置中的环境变量
          }).filter(([_, value]) => value !== undefined) as [string, string][]
        ) as Record<string, string>,
      });

      // 监听标准错误输出（用于日志记录）
      transport.stderr?.on('data', (chunk: Buffer) => {
        log.info(`mcp stderr: ${chunk.toString()}`, { name });
      });

      // 创建 MCP 客户端并连接
      const connectTimeout = config.timeout ?? DEFAULT_TIMEOUT;
      const client = new Client({
        name: 'hicode',
        version: '0.1.0',
      });

      // 使用超时包装器连接（防止无限等待）
      await withTimeout(client.connect(transport), connectTimeout);
      // 注册通知处理器
      registerNotificationHandlers(client, name);

      return {
        client: new McpClientImpl(name, client, { status: 'connected' }),
        status: { status: 'connected' },
      };
    } catch (error) {
      log.error('local mcp startup failed', {
        name,
        command: config.command,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * 创建远程 MCP 客户端（HTTP/SSE）
   * 通过 HTTP 或 SSE 与远程服务器通信
   * @param name MCP 服务器名称
   * @param config MCP 配置
   * @returns 客户端实例和状态
   */
  private async createRemoteClient(name: string, config: McpConfig): Promise<{ client?: McpClient; status: McpStatus }> {
    // 验证 URL 配置
    if (!config.url) {
      return {
        status: { status: 'failed', error: 'Remote MCP requires URL' },
      };
    }

    // 检查 OAuth 配置
    const oauthDisabled = config.oauth === false;
    const oauthConfig = typeof config.oauth === 'object' ? config.oauth : undefined;
    let authProvider: McpOAuthProvider | undefined;

    // 如果未禁用 OAuth，创建 OAuth 提供者
    if (!oauthDisabled) {
      authProvider = new McpOAuthProvider(
        name,
        config.url,
        {
          clientId: oauthConfig?.clientId,
          clientSecret: oauthConfig?.clientSecret,
          scope: oauthConfig?.scope,
        },
        {
          onRedirect: async (url) => {
            log.info('oauth redirect requested', { name, url: url.toString() });
          },
        }
      );
    }

    // 创建两种传输层（优先尝试 StreamableHTTP，失败则尝试 SSE）
    const transports: Array<{ name: string; transport: StreamableHTTPClientTransport | SSEClientTransport }> = [
      {
        name: 'StreamableHTTP',
        transport: new StreamableHTTPClientTransport(new URL(config.url), {
          authProvider,
          requestInit: config.headers ? { headers: config.headers } : undefined,
        }),
      },
      {
        name: 'SSE',
        transport: new SSEClientTransport(new URL(config.url), {
          authProvider,
          requestInit: config.headers ? { headers: config.headers } : undefined,
        }),
      },
    ];

    let lastError: Error | undefined;
    const connectTimeout = config.timeout ?? DEFAULT_TIMEOUT;

    // 依次尝试两种传输方式
    for (const { name: transportName, transport } of transports) {
      try {
        const client = new Client({
          name: 'hicode',
          version: '0.1.0',
        });
        // 尝试连接
        await withTimeout(client.connect(transport), connectTimeout);
        registerNotificationHandlers(client, name);
        log.info('connected', { name, transport: transportName });
        return {
          client: new McpClientImpl(name, client, { status: 'connected' }),
          status: { status: 'connected' },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 处理认证错误
        if (error instanceof UnauthorizedError) {
          log.info('mcp server requires authentication', { name, transport: transportName });

          // 检查是否需要客户端注册
          if (lastError.message.includes('registration') || lastError.message.includes('client_id')) {
            return {
              status: {
                status: 'needs_client_registration',
                error: 'Server does not support dynamic client registration. Please provide clientId in config.',
              },
            };
          }

          // 需要认证
          return {
            status: { status: 'needs_auth' },
          };
        }

        // 记录连接失败（继续尝试下一种传输方式）
        log.debug('transport connection failed', {
          name,
          transport: transportName,
          url: config.url,
          error: lastError.message,
        });
      }
    }

    // 所有传输方式都失败
    return {
      status: {
        status: 'failed',
        error: lastError?.message || 'Unknown error',
      },
    };
  }

  /**
   * 获取客户端
   */
  get(name: string): McpClient | undefined {
    return this.clients.get(name);
  }

  /**
   * 获取所有客户端
   */
  getAll(): Record<string, McpClient> {
    return Object.fromEntries(this.clients);
  }

  /**
   * 获取状态
   */
  getStatus(name: string): McpStatus | undefined {
    return this.statuses.get(name);
  }

  /**
   * 获取所有状态
   */
  getAllStatuses(): Record<string, McpStatus> {
    return Object.fromEntries(this.statuses);
  }

  /**
   * 连接客户端
   */
  async connect(name: string, config: McpConfig): Promise<void> {
    const result = await this.create(name, config);
    this.statuses.set(name, result.status);
    if (result.client) {
      // 关闭现有客户端
      const existing = this.clients.get(name);
      if (existing) {
        await existing.close().catch((error) => {
          log.error('关闭现有 MCP 客户端失败', { name, error });
        });
      }
      this.clients.set(name, result.client);
    }
  }

  /**
   * 断开客户端
   */
  async disconnect(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.close().catch((error) => {
        log.error('关闭 MCP 客户端失败', { name, error });
      });
      this.clients.delete(name);
    }
    this.statuses.set(name, { status: 'disabled' });
  }

  /**
   * 关闭所有客户端
   */
  async closeAll(): Promise<void> {
    await Promise.all(
      Array.from(this.clients.values()).map((client) =>
        client.close().catch((error) => {
          log.error('关闭 MCP 客户端失败', { error });
        })
      )
    );
    this.clients.clear();
    this.statuses.clear();
  }
}

/**
 * 全局 MCP 客户端管理器实例
 */
let mcpManagerInstance: McpClientManager | null = null;

/**
 * 获取 MCP 客户端管理器实例
 */
export function getMcpClientManager(): McpClientManager {
  if (!mcpManagerInstance) {
    mcpManagerInstance = new McpClientManager();
  }
  return mcpManagerInstance;
}
