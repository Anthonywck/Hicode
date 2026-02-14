# MCP 集成指南

## 概述

Model Context Protocol (MCP) 是一个开放协议，允许 AI 应用与外部数据源和工具集成。HiCode Agent 支持 MCP 服务器集成，可以动态发现和使用 MCP 工具。

## MCP 配置

### 配置文件

在 `opencode.json` 中配置 MCP 服务器：

```json
{
  "mcp": {
    "servers": {
      "server-name": {
        "type": "local",
        "command": ["node", "server.js"],
        "enabled": true,
        "timeout": 30000,
        "environment": {
          "API_KEY": "your-api-key"
        }
      }
    }
  }
}
```

### 配置选项

- `type`: 服务器类型
  - `local`: 本地进程（stdio）
  - `remote`: 远程服务器（HTTP/SSE）
- `command`: 启动命令（仅 local 类型）
- `url`: 服务器 URL（仅 remote 类型）
- `enabled`: 是否启用
- `timeout`: 连接超时（毫秒）
- `headers`: HTTP 请求头（仅 remote 类型）
- `environment`: 环境变量（仅 local 类型）
- `oauth`: OAuth 配置（可选）

### 远程服务器配置

```json
{
  "mcp": {
    "servers": {
      "remote-server": {
        "type": "remote",
        "url": "https://api.example.com/mcp",
        "enabled": true,
        "headers": {
          "Authorization": "Bearer token"
        }
      }
    }
  }
}
```

### OAuth 配置

```json
{
  "mcp": {
    "servers": {
      "oauth-server": {
        "type": "remote",
        "url": "https://api.example.com/mcp",
        "oauth": {
          "clientId": "your-client-id",
          "clientSecret": "your-client-secret",
          "scope": "read write"
        }
      }
    }
  }
}
```

## MCP 客户端使用

### 获取客户端管理器

```typescript
import { getMcpClientManager } from '../mcp/client';
import * as vscode from 'vscode';

const context = vscode.extensions.getExtension('hicode.hicode-ai-integration')?.extensionContext;
const manager = getMcpClientManager(context);
```

### 连接服务器

```typescript
const config = {
  type: 'local',
  command: ['node', 'server.js'],
  enabled: true,
};

const client = await manager.connect('server-name', config);
```

### 列出工具

```typescript
const tools = await client.listTools();
console.log(tools.tools);
```

### 调用工具

```typescript
const result = await client.callTool('tool-name', {
  arg1: 'value1',
  arg2: 'value2',
});
```

### 列出资源

```typescript
const resources = await client.listResources();
console.log(resources.resources);
```

### 读取资源

```typescript
const content = await client.readResource('resource://uri');
```

### 断开连接

```typescript
await manager.disconnect('server-name');
```

## MCP 工具转换

MCP 工具会自动转换为 AI SDK 工具格式，可以在 Agent 中使用：

```typescript
import { ToolRegistry } from '../tool/registry';
import { getMcpClientManager } from '../mcp/client';

const registry = new ToolRegistry();
const manager = getMcpClientManager(context);

// MCP 工具会自动注册
const tools = registry.list();
const mcpTools = tools.filter(t => t.name.startsWith('mcp:'));
```

## OAuth 认证

### 配置 OAuth

```typescript
import { McpOAuthProvider } from '../mcp/oauth-provider';

const provider = new McpOAuthProvider({
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  authorizationUrl: 'https://api.example.com/oauth/authorize',
  tokenUrl: 'https://api.example.com/oauth/token',
  scope: 'read write',
});

const token = await provider.getToken();
```

### OAuth 回调处理

```typescript
import { McpOAuthCallback } from '../mcp/oauth-callback';

const callback = new McpOAuthCallback();
await callback.handleCallback(authCode);
```

## 错误处理

### 连接错误

```typescript
try {
  const client = await manager.connect('server-name', config);
} catch (error) {
  if (error instanceof UnauthorizedError) {
    // 需要认证
    await handleAuth();
  } else {
    // 其他错误
    console.error('Connection failed:', error);
  }
}
```

### 工具调用错误

```typescript
try {
  const result = await client.callTool('tool-name', args);
} catch (error) {
  console.error('Tool call failed:', error);
}
```

## 状态管理

### 检查连接状态

```typescript
const client = manager.getClient('server-name');
if (client) {
  console.log('Status:', client.status);
  
  if (client.status.status === 'connected') {
    // 已连接
  } else if (client.status.status === 'needs_auth') {
    // 需要认证
  } else if (client.status.status === 'failed') {
    // 连接失败
    console.error('Error:', client.status.error);
  }
}
```

## 最佳实践

### 1. 错误处理

始终处理连接和工具调用错误：

```typescript
try {
  const client = await manager.connect('server-name', config);
  const result = await client.callTool('tool-name', args);
} catch (error) {
  // 处理错误
  logger.error('MCP operation failed', { error });
}
```

### 2. 超时设置

为长时间运行的工具设置超时：

```typescript
const config = {
  type: 'local',
  command: ['node', 'server.js'],
  timeout: 60000, // 60 秒
};
```

### 3. 资源清理

使用完毕后断开连接：

```typescript
try {
  const client = await manager.connect('server-name', config);
  // 使用客户端
} finally {
  await manager.disconnect('server-name');
}
```

### 4. 环境变量

使用环境变量存储敏感信息：

```typescript
const config = {
  type: 'local',
  command: ['node', 'server.js'],
  environment: {
    API_KEY: process.env.MCP_API_KEY,
  },
};
```

## 参考

- [MCP 规范](https://modelcontextprotocol.io/)
- [MCP SDK](https://github.com/modelcontextprotocol/sdk)
