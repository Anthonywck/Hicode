# gRPC 迁移总结

## 概述

已将当前项目的所有 API 调用从本地直接访问改为通过 gRPC 调用 Agent 服务。参考了 `E:\workspace\vscode\hicode` 项目的实现。

## 主要修改

### 1. 创建 gRPC API 客户端适配器

**文件**: `src/api/grpc_api_client.ts`

- 实现了 `IAPIClient` 接口
- 将所有 API 调用转换为 gRPC 调用
- 支持聊天请求（流式和非流式）
- 支持代码补全请求（转换为聊天请求）

**主要方法**:
- `sendChatRequest()` - 非流式聊天请求
- `sendStreamChatRequest()` - 流式聊天请求
- `sendCompletionRequest()` - 代码补全请求
- `validateConfig()` - 配置验证

### 2. 修改 extension.ts

**文件**: `src/extension.ts`

- 修改了 `getAPIClient()` 函数
- 强制使用 `GrpcAPIClient`，不再创建本地 API 适配器
- 停用了本地 API 适配器（DeepSeekAdapter, OpenAIAdapter, ZhipuAIAdapter）

**修改前**:
```typescript
// 创建本地 API 客户端管理器
apiClientInstance = new APIClientManagerClass(configMgr.models, promptManager);
// 注册本地适配器
adapter = new DeepSeekAdapter(model, promptManager);
```

**修改后**:
```typescript
// 强制使用 gRPC 方式
const { GrpcAPIClient } = await import('./api/grpc_api_client');
apiClientInstance = new GrpcAPIClient(configMgr.models);
// 本地适配器已停用
```

### 3. 修改 messageHandler

**文件**: `src/message/messageHandler.ts`

- 在 `buildChatRequest()` 方法中添加了 `sessionId` 到请求中
- 确保 gRPC 调用能够正确识别会话

**修改**:
```typescript
// 添加 sessionId 到请求中（用于 gRPC 调用）
(request as any).sessionId = sessionId;
```

## 架构变化

### 修改前
```
VS Code Extension
    ↓ 直接 HTTP 调用
LLM APIs (DeepSeek, OpenAI, etc.)
```

### 修改后
```
VS Code Extension
    ↓ gRPC
Python Agent Service
    ↓ HTTP
LLM APIs (DeepSeek, OpenAI, etc.)
```

## 配置要求

需要在 VS Code 设置中配置 Agent 服务地址：

```json
{
  "hicode.useAgentService": true,
  "hicode.agentServiceUrl": "localhost:50051"
}
```

## 影响范围

### 已修改的文件
1. `src/api/grpc_api_client.ts` - 新建，gRPC API 客户端适配器
2. `src/extension.ts` - 修改，强制使用 gRPC
3. `src/message/messageHandler.ts` - 修改，添加 sessionId 支持

### 受影响但无需修改的文件
以下文件使用 `IAPIClient` 接口，由于 `GrpcAPIClient` 实现了该接口，无需修改：
- `src/message/webviewMessageHandler.ts`
- `src/providers/inline.ts`
- `src/agent/executor.ts`
- `src/prompts/intentRecognizer.ts`
- `src/providers/completionProvider.ts`

### 已停用的文件
以下文件不再被使用（但保留在代码库中）：
- `src/api/adapters/deepseek.ts`
- `src/api/adapters/openai.ts`
- `src/api/adapters/zhipuai.ts`
- `src/api/client.ts` (APIClientManager)

## 使用方式

### 代码示例

所有现有的 API 调用代码无需修改，因为 `GrpcAPIClient` 实现了相同的接口：

```typescript
// 获取 API 客户端（自动使用 gRPC）
const apiClient = await getAPIClient();

// 发送聊天请求（自动路由到 Agent 服务）
const response = await apiClient.sendChatRequest({
  messages: [{ role: 'user', content: 'Hello!' }],
  model: 'current',
  stream: false
});

// 发送流式请求（自动路由到 Agent 服务）
await apiClient.sendStreamChatRequest(
  request,
  (chunk) => console.log(chunk),
  () => console.log('Done'),
  (error) => console.error(error)
);
```

## 注意事项

1. **Agent 服务必须运行**: 所有 API 调用都依赖 Agent 服务，确保服务已启动
2. **配置检查**: 确保 `hicode.agentServiceUrl` 配置正确
3. **错误处理**: 如果 Agent 服务不可用，会抛出错误，需要调用方处理
4. **会话管理**: sessionId 会自动传递到 gRPC 请求中，保持会话连续性

## 测试建议

1. 启动 Agent 服务
2. 配置 VS Code 设置
3. 测试聊天功能
4. 测试流式响应
5. 测试代码补全功能
6. 验证错误处理

## 回退方案

如果需要回退到本地 API 调用，可以：
1. 恢复 `extension.ts` 中的原始代码
2. 删除或注释掉 `GrpcAPIClient` 的使用
3. 重新启用本地适配器
