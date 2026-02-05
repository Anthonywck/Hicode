/**
 * MCP 模块导出
 * Model Context Protocol 集成
 */

import { getMcpClientManager, type McpStatus, type McpConfig } from './client';
import { getMcpTools } from './tools';
import { getMcpResources, readMcpResource } from './resources';
import { getMcpConfig, saveMcpConfig } from './config';

export * from './client';
export * from './tools';
export * from './resources';
export * from './config';
export * from './auth';
export * from './oauth-provider';
export * from './oauth-callback';

/**
 * MCP 命名空间
 */
export namespace MCP {

  /**
   * 获取 MCP 状态
   */
  export async function status(): Promise<Record<string, McpStatus>> {
    const manager = getMcpClientManager();
    return manager.getAllStatuses();
  }

  /**
   * 添加 MCP 服务器
   */
  export async function add(name: string, config: McpConfig): Promise<{ status: Record<string, McpStatus> }> {
    const manager = getMcpClientManager();
    await manager.connect(name, config);
    return { status: manager.getAllStatuses() };
  }

  /**
   * 连接 MCP 服务器
   */
  export async function connect(name: string): Promise<void> {
    const configs = await getMcpConfig();
    const config = configs[name];
    if (!config) {
      throw new Error(`MCP 配置 ${name} 不存在`);
    }
    const manager = getMcpClientManager();
    await manager.connect(name, config);
  }

  /**
   * 断开 MCP 服务器
   */
  export async function disconnect(name: string): Promise<void> {
    const manager = getMcpClientManager();
    await manager.disconnect(name);
  }

  /**
   * 获取 MCP 工具
   */
  export async function tools(): Promise<Record<string, any>> {
    return await getMcpTools();
  }

  /**
   * 获取 MCP 资源
   */
  export async function resources(): Promise<Record<string, any>> {
    return await getMcpResources();
  }

  /**
   * 读取 MCP 资源
   */
  export async function readResource(clientName: string, uri: string): Promise<any> {
    return await readMcpResource(clientName, uri);
  }

  /**
   * 启动 OAuth 认证流程
   * 生成授权 URL 并准备接收回调
   * @param mcpName MCP 服务器名称
   * @returns 授权 URL（如果已认证则返回空字符串）
   */
  export async function startAuth(mcpName: string): Promise<{ authorizationUrl: string }> {
    const { getMcpConfig } = await import('./config');
    const { getMcpClientManager } = await import('./client');
    const { McpOAuthProvider, OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH } = await import('./oauth-provider');
    const { McpOAuthCallback } = await import('./oauth-callback');
    const { McpAuth } = await import('./auth');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const { UnauthorizedError } = await import('@modelcontextprotocol/sdk/client/auth.js');
    const { getExtensionContext } = await import('../extension');

    const configs = await getMcpConfig();
    const mcpConfig = configs[mcpName];

    if (!mcpConfig) {
      throw new Error(`MCP server not found: ${mcpName}`);
    }

    if (mcpConfig.type !== 'remote') {
      throw new Error(`MCP server ${mcpName} is not a remote server`);
    }

    if (mcpConfig.oauth === false) {
      throw new Error(`MCP server ${mcpName} has OAuth explicitly disabled`);
    }

    // 确保回调服务器正在运行
    await McpOAuthCallback.ensureRunning();

    // 生成随机状态参数（用于 CSRF 防护）
    const oauthState = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await McpAuth.updateOAuthState(mcpName, oauthState);

    // 创建 OAuth 提供者
    const oauthConfig = typeof mcpConfig.oauth === 'object' ? mcpConfig.oauth : undefined;
    let capturedUrl: URL | undefined;
    const authProvider = new McpOAuthProvider(
      mcpName,
      mcpConfig.url!,
      {
        clientId: oauthConfig?.clientId,
        clientSecret: oauthConfig?.clientSecret,
        scope: oauthConfig?.scope,
      },
      {
        // 捕获授权 URL（当需要用户授权时）
        onRedirect: async (url) => {
          capturedUrl = url;
        },
      }
    );

    // 创建传输层并尝试连接
    const transport = new StreamableHTTPClientTransport(new URL(mcpConfig.url!), {
      authProvider,
    });

    try {
      const client = new Client({
        name: 'hicode',
        version: '0.1.0',
      });
      // 如果连接成功，说明已经认证
      await client.connect(transport);
      return { authorizationUrl: '' };
    } catch (error) {
      // 如果是未授权错误且已捕获授权 URL，返回授权 URL
      if (error instanceof UnauthorizedError && capturedUrl) {
        return { authorizationUrl: capturedUrl.toString() };
      }
      throw error;
    }
  }

  /**
   * 完成 OAuth 认证
   * 打开浏览器让用户授权，然后等待回调并完成认证
   * @param mcpName MCP 服务器名称
   * @returns 认证后的连接状态
   */
  export async function authenticate(mcpName: string): Promise<McpStatus> {
    const { getMcpConfig } = await import('./config');
    const { getMcpClientManager } = await import('./client');
    const { McpOAuthCallback } = await import('./oauth-callback');
    const { McpAuth } = await import('./auth');
    const vscode = await import('vscode');

    // 启动认证流程，获取授权 URL
    const { authorizationUrl } = await MCP.startAuth(mcpName);

    // 如果没有授权 URL，说明已经认证
    if (!authorizationUrl) {
      const manager = getMcpClientManager();
      return manager.getStatus(mcpName) || { status: 'connected' };
    }

    // 获取状态参数
    const oauthState = await McpAuth.getOAuthState(mcpName);
    if (!oauthState) {
      throw new Error('OAuth state not found - this should not happen');
    }

    // 注册回调等待器（在打开浏览器之前注册，避免竞态条件）
    const callbackPromise = McpOAuthCallback.waitForCallback(oauthState);

    // 打开浏览器让用户授权
    try {
      await vscode.env.openExternal(vscode.Uri.parse(authorizationUrl));
    } catch (error) {
      throw new Error(`Failed to open browser: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 等待回调（用户授权后会重定向到回调服务器）
    const code = await callbackPromise;

    // 验证状态参数（防止 CSRF 攻击）
    const storedState = await McpAuth.getOAuthState(mcpName);
    if (storedState !== oauthState) {
      await McpAuth.clearOAuthState(mcpName);
      throw new Error('OAuth state mismatch - potential CSRF attack');
    }

    // 清除状态参数
    await McpAuth.clearOAuthState(mcpName);

    // 重新连接 MCP 服务器（使用新的认证信息）
    const configs = await getMcpConfig();
    const mcpConfig = configs[mcpName];
    if (!mcpConfig) {
      throw new Error(`MCP server not found: ${mcpName}`);
    }

    const manager = getMcpClientManager();
    await manager.connect(mcpName, mcpConfig);

    return manager.getStatus(mcpName) || { status: 'failed', error: 'Unknown error' };
  }

  /**
   * Remove OAuth credentials
   */
  export async function removeAuth(mcpName: string): Promise<void> {
    const { McpAuth } = await import('./auth');
    const { McpOAuthCallback } = await import('./oauth-callback');
    await McpAuth.remove(mcpName);
    McpOAuthCallback.cancelPending(mcpName);
    await McpAuth.clearOAuthState(mcpName);
  }

  /**
   * Check if MCP server supports OAuth
   */
  export async function supportsOAuth(mcpName: string): Promise<boolean> {
    const { getMcpConfig } = await import('./config');
    const configs = await getMcpConfig();
    const mcpConfig = configs[mcpName];
    if (!mcpConfig) return false;
    return mcpConfig.type === 'remote' && mcpConfig.oauth !== false;
  }

  /**
   * Check if MCP server has stored OAuth tokens
   */
  export async function hasStoredTokens(mcpName: string): Promise<boolean> {
    const { McpAuth } = await import('./auth');
    const entry = await McpAuth.get(mcpName);
    return !!entry?.tokens;
  }

  /**
   * Get authentication status
   */
  export async function getAuthStatus(mcpName: string): Promise<'authenticated' | 'expired' | 'not_authenticated'> {
    const { McpAuth } = await import('./auth');
    const hasTokens = await hasStoredTokens(mcpName);
    if (!hasTokens) return 'not_authenticated';
    const expired = await McpAuth.isTokenExpired(mcpName);
    return expired ? 'expired' : 'authenticated';
  }
}
