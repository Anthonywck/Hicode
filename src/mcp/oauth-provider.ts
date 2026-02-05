/**
 * MCP OAuth Provider
 * 实现 OAuth 客户端提供者接口
 */

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientMetadata,
  OAuthTokens,
  OAuthClientInformation,
  OAuthClientInformationFull,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { McpAuth } from './auth';
import { createLogger } from '../utils/logger';

const log = createLogger('mcp.oauth');

/** OAuth 回调服务器端口 */
export const OAUTH_CALLBACK_PORT = 19876;
/** OAuth 回调路径 */
export const OAUTH_CALLBACK_PATH = '/mcp/oauth/callback';

/**
 * OAuth 配置接口
 * 用于配置 OAuth 客户端信息
 */
export interface McpOAuthConfig {
  /** 客户端 ID（可选，如果不提供则使用动态注册） */
  clientId?: string;
  /** 客户端密钥（可选） */
  clientSecret?: string;
  /** OAuth 授权范围（可选） */
  scope?: string;
}

/**
 * OAuth 回调接口
 * 定义 OAuth 流程中的回调函数
 */
export interface McpOAuthCallbacks {
  /** 当需要重定向到授权页面时调用 */
  onRedirect: (url: URL) => void | Promise<void>;
}

/**
 * MCP OAuth Provider
 * 实现 MCP SDK 的 OAuthClientProvider 接口
 * 负责管理 OAuth 2.0 认证流程中的客户端信息、令牌和状态
 */
export class McpOAuthProvider implements OAuthClientProvider {
  constructor(
    private mcpName: string,
    private serverUrl: string,
    private config: McpOAuthConfig,
    private callbacks: McpOAuthCallbacks
  ) {}

  /**
   * 获取重定向 URL
   * OAuth 服务器在用户授权后会重定向到此 URL
   */
  get redirectUrl(): string {
    return `http://127.0.0.1:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}`;
  }

  /**
   * 获取客户端元数据
   * 用于动态客户端注册时向 OAuth 服务器提供客户端信息
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      client_name: 'HiCode',
      client_uri: 'https://github.com/Anthonywck/Hicode',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      // 如果有客户端密钥，使用 client_secret_post，否则使用 none（公共客户端）
      token_endpoint_auth_method: this.config.clientSecret ? 'client_secret_post' : 'none',
    };
  }

  /**
   * 获取客户端信息
   * 优先使用配置中的客户端 ID，否则从存储中获取（动态注册的客户端）
   * @returns 客户端信息，如果不存在则返回 undefined（触发动态注册）
   */
  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    // 优先使用配置中的客户端 ID
    if (this.config.clientId) {
      return {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      };
    }

    // 尝试从存储中获取动态注册的客户端信息
    const entry = await McpAuth.getForUrl(this.mcpName, this.serverUrl);
    if (entry?.clientInfo) {
      // 检查客户端密钥是否已过期
      if (
        entry.clientInfo.clientSecretExpiresAt &&
        entry.clientInfo.clientSecretExpiresAt < Date.now() / 1000
      ) {
        log.info('client secret expired, need to re-register', { mcpName: this.mcpName });
        return undefined;
      }
      return {
        client_id: entry.clientInfo.clientId,
        client_secret: entry.clientInfo.clientSecret,
      };
    }

    // 没有客户端信息，返回 undefined 触发动态注册
    return undefined;
  }

  /**
   * 保存动态注册的客户端信息
   * 当 OAuth 服务器支持动态客户端注册时调用
   * @param info 完整的客户端信息（包含颁发时间和过期时间）
   */
  async saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    await McpAuth.updateClientInfo(
      this.mcpName,
      {
        clientId: info.client_id,
        clientSecret: info.client_secret,
        clientIdIssuedAt: info.client_id_issued_at,
        clientSecretExpiresAt: info.client_secret_expires_at,
      },
      this.serverUrl
    );
    log.info('saved dynamically registered client', {
      mcpName: this.mcpName,
      clientId: info.client_id,
    });
  }

  /**
   * 获取 OAuth 令牌
   * 从存储中读取访问令牌和刷新令牌
   * @returns OAuth 令牌，如果不存在则返回 undefined
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    const entry = await McpAuth.getForUrl(this.mcpName, this.serverUrl);
    if (!entry?.tokens) return undefined;

    return {
      access_token: entry.tokens.accessToken,
      token_type: 'Bearer',
      refresh_token: entry.tokens.refreshToken,
      // 计算剩余过期时间（秒）
      expires_in: entry.tokens.expiresAt
        ? Math.max(0, Math.floor(entry.tokens.expiresAt - Date.now() / 1000))
        : undefined,
      scope: entry.tokens.scope,
    };
  }

  /**
   * 保存 OAuth 令牌
   * 在获取到新的访问令牌后调用此方法保存
   * @param tokens OAuth 令牌
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await McpAuth.updateTokens(
      this.mcpName,
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        // 将 expires_in（秒）转换为 Unix 时间戳
        expiresAt: tokens.expires_in ? Date.now() / 1000 + tokens.expires_in : undefined,
        scope: tokens.scope,
      },
      this.serverUrl
    );
    log.info('saved oauth tokens', { mcpName: this.mcpName });
  }

  /**
   * 重定向到授权页面
   * 当需要用户授权时，OAuth 服务器会调用此方法
   * @param authorizationUrl 授权页面 URL
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    log.info('redirecting to authorization', {
      mcpName: this.mcpName,
      url: authorizationUrl.toString(),
    });
    await this.callbacks.onRedirect(authorizationUrl);
  }

  /**
   * 保存 PKCE 代码验证器
   * PKCE 用于增强 OAuth 2.0 安全性
   * @param codeVerifier 代码验证器
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await McpAuth.updateCodeVerifier(this.mcpName, codeVerifier);
  }

  /**
   * 获取 PKCE 代码验证器
   * @returns 代码验证器
   * @throws 如果不存在则抛出错误
   */
  async codeVerifier(): Promise<string> {
    const entry = await McpAuth.get(this.mcpName);
    if (!entry?.codeVerifier) {
      throw new Error(`No code verifier saved for MCP server: ${this.mcpName}`);
    }
    return entry.codeVerifier;
  }

  /**
   * 保存 OAuth 状态参数
   * 状态参数用于防止 CSRF 攻击
   * @param state 状态字符串
   */
  async saveState(state: string): Promise<void> {
    await McpAuth.updateOAuthState(this.mcpName, state);
  }

  /**
   * 获取 OAuth 状态参数
   * @returns 状态字符串
   * @throws 如果不存在则抛出错误
   */
  async state(): Promise<string> {
    const entry = await McpAuth.get(this.mcpName);
    if (!entry?.oauthState) {
      throw new Error(`No OAuth state saved for MCP server: ${this.mcpName}`);
    }
    return entry.oauthState;
  }
}
