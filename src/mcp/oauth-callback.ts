/**
 * MCP OAuth Callback Server
 * 处理 OAuth 回调请求
 */

import * as http from 'http';
import { OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH } from './oauth-provider';
import { createLogger } from '../utils/logger';

const log = createLogger('mcp.oauth-callback');

const HTML_SUCCESS = `<!DOCTYPE html>
<html>
<head>
  <title>HiCode - Authorization Successful</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #4ade80; margin-bottom: 1rem; }
    p { color: #aaa; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorization Successful</h1>
    <p>You can close this window and return to HiCode.</p>
  </div>
  <script>setTimeout(() => window.close(), 2000);</script>
</body>
</html>`;

const HTML_ERROR = (error: string) => `<!DOCTYPE html>
<html>
<head>
  <title>HiCode - Authorization Failed</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #f87171; margin-bottom: 1rem; }
    p { color: #aaa; }
    .error { color: #fca5a5; font-family: monospace; margin-top: 1rem; padding: 1rem; background: rgba(248,113,113,0.1); border-radius: 0.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorization Failed</h1>
    <p>An error occurred during authorization.</p>
    <div class="error">${error}</div>
  </div>
</body>
</html>`;

/**
 * 待处理的认证请求
 * 用于跟踪正在进行的 OAuth 认证流程
 */
interface PendingAuth {
  /** 成功回调，传入授权码 */
  resolve: (code: string) => void;
  /** 失败回调，传入错误 */
  reject: (error: Error) => void;
  /** 超时定时器 */
  timeout: NodeJS.Timeout;
}

/** OAuth 回调超时时间（5 分钟） */
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

/** HTTP 服务器实例 */
let server: http.Server | undefined;
/** 待处理的认证请求映射表（key: OAuth state, value: PendingAuth） */
const pendingAuths = new Map<string, PendingAuth>();

/**
 * 检查端口是否已被占用
 * 用于检测是否已有其他实例在运行回调服务器
 * @returns true 表示端口已被占用，false 表示端口可用
 */
async function isPortInUse(): Promise<boolean> {
  return new Promise((resolve) => {
    const testServer = http.createServer();
    // 尝试监听端口，如果成功则说明端口可用
    testServer.listen(OAUTH_CALLBACK_PORT, () => {
      testServer.close(() => resolve(false));
    });
    // 如果监听失败，说明端口已被占用
    testServer.on('error', () => resolve(true));
  });
}

/**
 * MCP OAuth 回调服务器命名空间
 * 提供 OAuth 回调服务器的启动、停止和管理功能
 */
export namespace McpOAuthCallback {
  /**
   * 确保回调服务器正在运行
   * 如果服务器未启动，则创建并启动 HTTP 服务器监听 OAuth 回调
   */
  export async function ensureRunning(): Promise<void> {
    // 如果服务器已运行，直接返回
    if (server) return;

    // 检查端口是否已被占用（可能是其他实例）
    const running = await isPortInUse();
    if (running) {
      log.info('oauth callback server already running on another instance', {
        port: OAUTH_CALLBACK_PORT,
      });
      return;
    }

    // 创建 HTTP 服务器处理 OAuth 回调
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);

      // 只处理 OAuth 回调路径
      if (url.pathname !== OAUTH_CALLBACK_PATH) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      // 从 URL 查询参数中提取 OAuth 回调信息
      const code = url.searchParams.get('code'); // 授权码
      const state = url.searchParams.get('state'); // 状态参数（用于 CSRF 防护）
      const error = url.searchParams.get('error'); // 错误码（如果有）
      const errorDescription = url.searchParams.get('error_description'); // 错误描述

      log.info('received oauth callback', { hasCode: !!code, state, error });

      // 验证状态参数（CSRF 防护）
      if (!state) {
        const errorMsg = 'Missing required state parameter - potential CSRF attack';
        log.error('oauth callback missing state parameter', { url: url.toString() });
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(HTML_ERROR(errorMsg));
        return;
      }

      // 处理 OAuth 错误响应
      if (error) {
        const errorMsg = errorDescription || error;
        // 如果有对应的待处理请求，通知失败
        if (pendingAuths.has(state)) {
          const pending = pendingAuths.get(state)!;
          clearTimeout(pending.timeout);
          pendingAuths.delete(state);
          pending.reject(new Error(errorMsg));
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(HTML_ERROR(errorMsg));
        return;
      }

      // 验证授权码是否存在
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(HTML_ERROR('No authorization code provided'));
        return;
      }

      // 验证状态参数是否匹配（防止 CSRF 攻击）
      if (!pendingAuths.has(state)) {
        const errorMsg = 'Invalid or expired state parameter - potential CSRF attack';
        log.error('oauth callback with invalid state', {
          state,
          pendingStates: Array.from(pendingAuths.keys()),
        });
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(HTML_ERROR(errorMsg));
        return;
      }

      // 找到对应的待处理请求，通知成功并传递授权码
      const pending = pendingAuths.get(state)!;
      clearTimeout(pending.timeout);
      pendingAuths.delete(state);
      pending.resolve(code);

      // 返回成功页面
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(HTML_SUCCESS);
    });

    server.listen(OAUTH_CALLBACK_PORT, () => {
      log.info('oauth callback server started', { port: OAUTH_CALLBACK_PORT });
    });

    server.on('error', (error) => {
      log.error('oauth callback server error', error);
    });
  }

  /**
   * 等待 OAuth 回调
   * 创建一个 Promise，等待指定状态参数的 OAuth 回调
   * @param oauthState OAuth 状态参数
   * @returns Promise，成功时返回授权码，失败时抛出错误
   */
  export function waitForCallback(oauthState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // 设置超时定时器
      const timeout = setTimeout(() => {
        if (pendingAuths.has(oauthState)) {
          pendingAuths.delete(oauthState);
          reject(new Error('OAuth callback timeout - authorization took too long'));
        }
      }, CALLBACK_TIMEOUT_MS);

      // 注册待处理的认证请求
      pendingAuths.set(oauthState, { resolve, reject, timeout });
    });
  }

  /**
   * 取消待处理的认证请求
   * 用于取消指定 MCP 服务器的所有待处理认证
   * @param mcpName MCP 服务器名称
   */
  export function cancelPending(mcpName: string): void {
    for (const [state, pending] of pendingAuths.entries()) {
      // 通过状态参数中包含服务器名称来匹配
      if (state.includes(mcpName)) {
        clearTimeout(pending.timeout);
        pendingAuths.delete(state);
        pending.reject(new Error('Authorization cancelled'));
      }
    }
  }

  /**
   * 停止回调服务器
   * 关闭 HTTP 服务器并清理所有待处理的认证请求
   */
  export async function stop(): Promise<void> {
    if (server) {
      return new Promise((resolve) => {
        server!.close(() => {
          server = undefined;
          log.info('oauth callback server stopped');
          resolve();
        });
      });
    }

    // 清理所有待处理的认证请求
    for (const [name, pending] of pendingAuths) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('OAuth callback server stopped'));
    }
    pendingAuths.clear();
  }

  /**
   * 检查服务器是否正在运行
   * @returns true 表示服务器正在运行，false 表示未运行
   */
  export function isRunning(): boolean {
    return server !== undefined;
  }
}
