/**
 * MCP OAuth 认证存储
 * 管理 MCP 服务器的 OAuth 凭证和状态
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { z } from 'zod';
import { getExtensionContext } from '../extension';
import { createLogger } from '../utils/logger';

const log = createLogger('mcp.auth');

/**
 * OAuth 令牌数据结构
 * 用于存储访问令牌、刷新令牌等信息
 */
export const Tokens = z.object({
  /** 访问令牌，用于访问受保护的资源 */
  accessToken: z.string(),
  /** 刷新令牌，用于获取新的访问令牌 */
  refreshToken: z.string().optional(),
  /** 令牌过期时间（Unix 时间戳，秒） */
  expiresAt: z.number().optional(),
  /** OAuth 授权范围 */
  scope: z.string().optional(),
});
export type Tokens = z.infer<typeof Tokens>;

/**
 * OAuth 客户端信息
 * 用于存储客户端 ID、密钥等信息（支持动态注册）
 */
export const ClientInfo = z.object({
  /** 客户端 ID */
  clientId: z.string(),
  /** 客户端密钥（可选） */
  clientSecret: z.string().optional(),
  /** 客户端 ID 颁发时间（Unix 时间戳，秒） */
  clientIdIssuedAt: z.number().optional(),
  /** 客户端密钥过期时间（Unix 时间戳，秒） */
  clientSecretExpiresAt: z.number().optional(),
});
export type ClientInfo = z.infer<typeof ClientInfo>;

/**
 * 认证条目
 * 包含一个 MCP 服务器的所有认证相关信息
 */
export const Entry = z.object({
  /** OAuth 令牌 */
  tokens: Tokens.optional(),
  /** 客户端信息 */
  clientInfo: ClientInfo.optional(),
  /** PKCE 代码验证器（用于 OAuth 2.0 PKCE 流程） */
  codeVerifier: z.string().optional(),
  /** OAuth 状态参数（用于防止 CSRF 攻击） */
  oauthState: z.string().optional(),
  /** 服务器 URL（用于验证凭证是否匹配当前服务器） */
  serverUrl: z.string().optional(),
});
export type Entry = z.infer<typeof Entry>;

/**
 * 获取认证文件路径
 * 文件存储在扩展的全局存储目录下的 mcp/auth.json
 */
async function getAuthFilePath(): Promise<string> {
  const context = await getExtensionContext();
  const dataDir = path.join(context.globalStorageUri.fsPath, 'mcp');
  // 确保目录存在
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'auth.json');
}

/**
 * 读取所有认证条目
 * 从 JSON 文件中读取所有 MCP 服务器的认证信息
 */
async function readAll(): Promise<Record<string, Entry>> {
  const filepath = await getAuthFilePath();
  // 文件不存在时返回空对象
  if (!fs.existsSync(filepath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(content);
    // 使用 Zod 验证数据结构
    return z.record(Entry).parse(data);
  } catch (error) {
    log.error('Failed to read auth file', error);
    return {};
  }
}

/**
 * 写入所有认证条目
 * 将认证信息保存到 JSON 文件（文件权限设置为 0o600，仅所有者可读写）
 */
async function writeAll(data: Record<string, Entry>): Promise<void> {
  const filepath = await getAuthFilePath();
  try {
    // 使用 0o600 权限确保文件安全（仅所有者可读写）
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch (error) {
    log.error('Failed to write auth file', error);
    throw error;
  }
}

/**
 * MCP 认证管理命名空间
 * 提供 OAuth 认证信息的存储和管理功能
 */
export namespace McpAuth {
  /**
   * 获取指定 MCP 服务器的认证条目
   * @param mcpName MCP 服务器名称
   * @returns 认证条目，如果不存在则返回 undefined
   */
  export async function get(mcpName: string): Promise<Entry | undefined> {
    const data = await readAll();
    return data[mcpName];
  }

  /**
   * 获取认证条目并验证其是否匹配指定的服务器 URL
   * 用于确保凭证是为正确的服务器 URL 存储的（防止 URL 变更导致凭证失效）
   * @param mcpName MCP 服务器名称
   * @param serverUrl 服务器 URL
   * @returns 匹配的认证条目，如果不匹配则返回 undefined
   */
  export async function getForUrl(mcpName: string, serverUrl: string): Promise<Entry | undefined> {
    const entry = await get(mcpName);
    if (!entry) return undefined;

    // 如果没有存储服务器 URL，说明是旧版本数据，视为无效
    if (!entry.serverUrl) return undefined;

    // URL 不匹配，说明凭证已失效
    if (entry.serverUrl !== serverUrl) return undefined;

    return entry;
  }

  /**
   * 设置认证条目
   * @param mcpName MCP 服务器名称
   * @param entry 认证条目
   * @param serverUrl 服务器 URL（可选，如果提供则更新存储的 URL）
   */
  export async function set(mcpName: string, entry: Entry, serverUrl?: string): Promise<void> {
    const data = await readAll();
    const updatedEntry = serverUrl ? { ...entry, serverUrl } : entry;
    await writeAll({ ...data, [mcpName]: updatedEntry });
  }

  /**
   * 移除认证条目
   * 删除指定 MCP 服务器的所有认证信息
   * @param mcpName MCP 服务器名称
   */
  export async function remove(mcpName: string): Promise<void> {
    const data = await readAll();
    delete data[mcpName];
    await writeAll(data);
  }

  /**
   * 更新 OAuth 令牌
   * @param mcpName MCP 服务器名称
   * @param tokens OAuth 令牌
   * @param serverUrl 服务器 URL（可选）
   */
  export async function updateTokens(mcpName: string, tokens: Tokens, serverUrl?: string): Promise<void> {
    const entry = (await get(mcpName)) ?? {};
    entry.tokens = tokens;
    await set(mcpName, entry, serverUrl);
  }

  /**
   * 更新客户端信息
   * 用于存储动态注册的客户端信息
   * @param mcpName MCP 服务器名称
   * @param clientInfo 客户端信息
   * @param serverUrl 服务器 URL（可选）
   */
  export async function updateClientInfo(mcpName: string, clientInfo: ClientInfo, serverUrl?: string): Promise<void> {
    const entry = (await get(mcpName)) ?? {};
    entry.clientInfo = clientInfo;
    await set(mcpName, entry, serverUrl);
  }

  /**
   * 更新 PKCE 代码验证器
   * PKCE (Proof Key for Code Exchange) 用于增强 OAuth 2.0 安全性
   * @param mcpName MCP 服务器名称
   * @param codeVerifier 代码验证器
   */
  export async function updateCodeVerifier(mcpName: string, codeVerifier: string): Promise<void> {
    const entry = (await get(mcpName)) ?? {};
    entry.codeVerifier = codeVerifier;
    await set(mcpName, entry);
  }

  /**
   * 清除 PKCE 代码验证器
   * 在认证完成后清除临时存储的代码验证器
   * @param mcpName MCP 服务器名称
   */
  export async function clearCodeVerifier(mcpName: string): Promise<void> {
    const entry = await get(mcpName);
    if (entry) {
      delete entry.codeVerifier;
      await set(mcpName, entry);
    }
  }

  /**
   * 更新 OAuth 状态参数
   * 状态参数用于防止 CSRF 攻击
   * @param mcpName MCP 服务器名称
   * @param oauthState OAuth 状态字符串
   */
  export async function updateOAuthState(mcpName: string, oauthState: string): Promise<void> {
    const entry = (await get(mcpName)) ?? {};
    entry.oauthState = oauthState;
    await set(mcpName, entry);
  }

  /**
   * 获取 OAuth 状态参数
   * @param mcpName MCP 服务器名称
   * @returns OAuth 状态字符串，如果不存在则返回 undefined
   */
  export async function getOAuthState(mcpName: string): Promise<string | undefined> {
    const entry = await get(mcpName);
    return entry?.oauthState;
  }

  /**
   * 清除 OAuth 状态参数
   * 在认证完成后清除临时存储的状态参数
   * @param mcpName MCP 服务器名称
   */
  export async function clearOAuthState(mcpName: string): Promise<void> {
    const entry = await get(mcpName);
    if (entry) {
      delete entry.oauthState;
      await set(mcpName, entry);
    }
  }

  /**
   * 检查令牌是否已过期
   * @param mcpName MCP 服务器名称
   * @returns null 表示没有令牌，false 表示未过期或没有过期时间，true 表示已过期
   */
  export async function isTokenExpired(mcpName: string): Promise<boolean | null> {
    const entry = await get(mcpName);
    if (!entry?.tokens) return null;
    // 没有过期时间，视为永不过期
    if (!entry.tokens.expiresAt) return false;
    // 检查是否已过期（当前时间大于过期时间）
    return entry.tokens.expiresAt < Date.now() / 1000;
  }
}
