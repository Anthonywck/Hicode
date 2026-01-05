# Webview 前后端交互机制实现文档

## 概述

本文档描述了 hcode 插件项目中实现的前后端交互机制，参考了 hicode 项目的实现，并进行了优化以符合 hcode 的编码风格和习惯。

## 架构设计

### 消息流向

```
前端 (Webview)                   后端 (Extension)
    |                                    |
    |  postMessage(messageType, data)   |
    |---------------------------------->|
    |                                    | routeWebviewMessage()
    |                                    |   -> webviewMessageHandler
    |                                    |   -> 业务处理
    |                                    |
    |  webview.postMessage(response)   |
    |<----------------------------------|
    |                                    |
```

### 核心组件

1. **消息类型定义** (`src/utils/messageType.ts`)
   - 定义所有前后端消息类型常量
   - 命名规范：F2B (前端到后端)、B2F (后端到前端)、REQ (请求)、RES (响应)

2. **消息路由分发器** (`src/message/webviewMessageRouter.ts`)
   - 统一的消息入口
   - 根据消息类型路由到对应的处理器
   - 统一错误处理和日志记录

3. **消息处理器** (`src/message/webviewMessageHandler.ts`)
   - 处理各种业务消息
   - 包括聊天、模型配置、设置、历史记录等

4. **Webview 提供器** (`src/providers/chatWebviewProvider.ts`)
   - 集成消息路由机制
   - 管理 Webview 生命周期

5. **前端通信工具** (`light-code-html/src/lib/io.js`)
   - 提供 `postMessage()` 函数发送消息
   - 支持 Promise 和回调两种方式
   - 自动处理 token 匹配和超时

## 消息类型

### 聊天相关

- `HCODE_ASK_QUESTION_F2B_REQ`: 发送聊天消息
- `HCODE_ASK_QUESTION_B2F_RES`: 聊天消息响应
- `HCODE_NEW_CHAT_F2B_REQ`: 新建对话
- `HCODE_NEW_CHAT_B2F_RES`: 新建对话响应

### 模型配置相关

- `HCODE_GET_MODELS_F2B_REQ`: 获取模型列表
- `HCODE_GET_MODELS_B2F_RES`: 模型列表响应
- `HCODE_CHANGE_MODEL_F2B_REQ`: 切换模型
- `HCODE_CHANGE_MODEL_B2F_RES`: 切换模型响应
- `HCODE_ADD_MODEL_F2B_REQ`: 新增模型
- `HCODE_EDIT_MODEL_F2B_REQ`: 编辑模型
- `HCODE_DELETE_MODEL_F2B_REQ`: 删除模型
- `HCODE_REFRESH_MODELS_B2F_RES`: 刷新模型列表

### 设置相关

- `HCODE_GET_SETTINGS_F2B_REQ`: 获取设置
- `HCODE_GET_SETTINGS_B2F_RES`: 设置响应

### 历史记录相关

- `HCODE_GET_HISTORY_F2B_REQ`: 获取历史记录
- `HCODE_GET_HISTORY_B2F_RES`: 历史记录响应

### 系统消息

- `HCODE_WEBVIEW_READY`: Webview 准备就绪
- `HCODE_CONSOLE_LOG`: 控制台日志
- `HCODE_ERROR_B2F`: 错误消息

## 使用示例

### 前端发送消息

```javascript
import { postMessage } from '@/lib/io';
import * as MessageType from '@/utils/messageType';

// 发送聊天消息
async function sendChatMessage(content, chatId) {
  try {
    const response = await postMessage(
      MessageType.HCODE_ASK_QUESTION_F2B_REQ,
      {
        content,
        chatId,
        sessionId: chatId
      }
    );
    
    // 处理响应
    if (response.message === MessageType.HCODE_ASK_QUESTION_B2F_RES) {
      const { data } = response;
      if (data.isStreaming) {
        // 处理流式数据
        appendMessage(data.content);
      } else if (data.isComplete) {
        // 流式响应完成
        finalizeMessage(data.fullContent);
      }
    }
  } catch (error) {
    console.error('发送消息失败:', error);
  }
}

// 获取模型列表
async function loadModels() {
  try {
    const response = await postMessage(MessageType.HCODE_GET_MODELS_F2B_REQ);
    if (response.message === MessageType.HCODE_GET_MODELS_B2F_RES) {
      const { models, currentModel } = response.data;
      updateModelList(models, currentModel);
    }
  } catch (error) {
    console.error('获取模型列表失败:', error);
  }
}

// 监听后端推送的消息
import { onMessage } from '@/lib/io';

const unsubscribe = onMessage((event) => {
  const { message, data } = event.data;
  
  if (message === MessageType.HCODE_REFRESH_MODELS_B2F_RES) {
    // 模型列表已更新
    updateModelList(data.models);
  }
});
```

### 后端处理消息

消息处理已经在 `webviewMessageHandler.ts` 中实现，通过 `webviewMessageRouter.ts` 自动路由。

如果需要添加新的消息类型：

1. 在 `messageType.ts` 中定义新的消息类型常量
2. 在 `webviewMessageHandler.ts` 中实现处理函数
3. 在 `webviewMessageRouter.ts` 中添加路由规则

示例：

```typescript
// 1. 定义消息类型
export const HCODE_NEW_FEATURE_F2B_REQ = 'hcode_new_feature_f2b_req';

// 2. 实现处理函数
export async function handleNewFeature(
  message: any,
  webview: vscode.Webview
): Promise<void> {
  // 处理逻辑
  webview.postMessage({
    token: message.token,
    message: MessageType.HCODE_NEW_FEATURE_B2F_RES,
    data: { /* ... */ }
  });
}

// 3. 添加路由
case MessageType.HCODE_NEW_FEATURE_F2B_REQ:
  handleNewFeature(message, webview).catch(error => {
    logger.error('处理新功能失败', error, 'WebviewMessageRouter');
  });
  break;
```

## 优化点

1. **统一的消息格式**
   - 使用 `message` 字段作为消息类型（兼容 `command` 字段）
   - 使用 `token` 机制匹配请求和响应
   - 统一的数据结构

2. **错误处理**
   - 统一的错误响应格式
   - 详细的错误日志记录
   - 前端友好的错误提示

3. **类型安全**
   - TypeScript 类型定义
   - 消息类型常量
   - 接口定义

4. **性能优化**
   - 懒加载模块
   - 异步处理
   - 流式响应支持

5. **可维护性**
   - 清晰的文件结构
   - 详细的中文注释
   - 统一的编码风格

## 注意事项

1. **消息格式**
   - 前端发送消息时，必须包含 `message` 字段（消息类型）
   - 后端响应时，必须包含 `token` 字段（匹配请求）
   - 数据放在 `data` 字段中

2. **异步处理**
   - 所有消息处理都是异步的
   - 使用 Promise 或 async/await
   - 注意错误处理

3. **流式响应**
   - 聊天消息使用流式响应
   - 通过 `isStreaming` 和 `isComplete` 标志区分状态
   - 前端需要累积数据块

4. **兼容性**
   - 保持向后兼容（支持旧的 `command` 字段）
   - 支持 HICODE 前缀的消息类型（兼容旧代码）

## 文件清单

### 后端文件

- `src/utils/messageType.ts` - 消息类型定义
- `src/message/webviewMessageRouter.ts` - 消息路由分发器
- `src/message/webviewMessageHandler.ts` - 消息处理器
- `src/providers/chatWebviewProvider.ts` - Webview 提供器（已更新）
- `src/message/index.ts` - 模块导出（已更新）
- `src/utils/index.ts` - Utils 模块导出（已更新）

### 前端文件

- `light-code-html/src/utils/messageType.js` - 消息类型定义（已更新）
- `light-code-html/src/lib/io.js` - 前后端通信工具（已优化）

## 总结

本次实现参考了 hicode 项目的前后端交互机制，并根据 hcode 项目的编码风格和习惯进行了优化：

1. ✅ 创建了完整的消息类型定义系统
2. ✅ 实现了统一的消息路由分发机制
3. ✅ 实现了各种业务消息的处理器
4. ✅ 更新了 Webview 提供器以使用新的消息机制
5. ✅ 优化了前端消息发送工具
6. ✅ 添加了详细的中文注释
7. ✅ 符合 hcode 的编码风格和习惯

所有代码都经过编译检查，没有错误。可以直接使用。

