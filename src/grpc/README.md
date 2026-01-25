# gRPC 调用 Agent 机制

参考 `E:\workspace\vscode\hicode` 项目实现，提供简单的 gRPC 客户端来调用 Agent 服务。

## 文件结构

```
src/grpc/
├── types.ts          # 类型定义（ChatRequest, ChatReply, ChatStreamReply）
├── grpcClient.ts     # gRPC 客户端管理器
├── chat.ts           # 聊天接口封装（fetchStreamResponse, fetchResponse）
├── index.ts          # 模块导出
└── README.md         # 本文档
```

## 使用方式

### 1. 基本使用

```typescript
import { fetchStreamResponse, fetchResponse } from './grpc/chat';

// 流式响应
await fetchStreamResponse(
  { 
    message: 'Hello, how are you?',
    chatId: 'chat-123',
    promptType: 'common'
  },
  (text: string) => {
    console.log('收到数据:', text);
    // 当收到 '[DONE]' 时表示流结束
  }
);

// 普通响应
const reply = await fetchResponse({
  message: 'Hello, how are you?',
  chatId: 'chat-123',
  promptType: 'common'
});
console.log('完整回复:', reply);
```

### 2. 直接使用客户端管理器

```typescript
import { getGrpcClientManager, initializeGrpcClient } from './grpc/grpcClient';
import { ChatRequest } from './grpc/types';

// 初始化客户端
await initializeGrpcClient('localhost:50051');

// 获取客户端实例
const client = getGrpcClientManager();

// 发送请求
const request: ChatRequest = {
  convId: 'session-123',
  chatId: 'chat-123',
  message: 'Hello',
  promptType: 'common',
  language: 'typescript'
};

// 普通请求
const reply = await client.sendChatRequest(request);
console.log(reply.reply);

// 流式请求
await client.sendStreamChatRequest(request, (chunk, isEnd) => {
  console.log('Chunk:', chunk, 'IsEnd:', isEnd);
});
```

## 配置

需要在 VS Code 设置中配置 Agent 服务地址：

```json
{
  "hicode.useAgentService": true,
  "hicode.agentServiceUrl": "localhost:50051"
}
```

## 服务路径

参考 vscode/hicode 项目，使用以下服务路径：
- 普通聊天：`/hicode.agent.AgentService/Chat`
- 流式聊天：`/hicode.agent.AgentService/ChatStream`

## 特性

- ✅ 使用 `@grpc/grpc-js` 的 `Client` 类直接创建客户端
- ✅ 使用 JSON 序列化/反序列化，无需 proto 文件生成
- ✅ 支持流式和普通聊天请求
- ✅ 自动从 VS Code 配置读取服务器地址
- ✅ 自动连接管理（懒加载）
- ✅ 与参考项目的 API 风格完全一致

## 注意事项

1. 确保 Agent 服务已启动并监听在配置的端口上
2. 流式响应结束时，会收到 `'[DONE]'` 标志
3. 客户端会自动管理连接，无需手动调用 `connect()`
4. 如果连接失败，会抛出错误，需要调用方处理
