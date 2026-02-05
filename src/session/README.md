# Session 模块

Session 模块是 HiCode 的核心组件之一，负责管理会话消息、处理 LLM 响应流和工具调用。该模块设计参考了 opencode 项目，并针对 HiCode 的需求进行了优化。

## 主要功能

1. **消息管理**: 定义了完整的消息结构和类型，支持用户消息、助手消息和系统消息
2. **存储抽象**: 提供消息和部分数据的存储接口，默认实现了基于 VSCode 扩展全局状态的存储
3. **系统提示词**: 为不同模型提供定制的系统提示词和环境信息
4. **LLM 流处理**: 封装 AI SDK 的 streamText，提供工具参数转换和流式响应处理
5. **会话处理器**: 处理 LLM 响应流，管理工具调用和消息生成

## 文件结构

### message.ts
定义了消息相关的接口和类型：
- `MessageRole`: 消息角色枚举（用户、助手、系统、工具）
- `MessageTime`: 消息时间信息
- `MessageCost`: 消息成本信息
- `MessageError`: 消息错误信息
- `Part`: 消息部分联合类型（文本、文件、工具调用）
- `UserMessage`, `AssistantMessage`: 具体消息类型
- `MessageWithParts`: 带部分的消息
- 工具函数：`generateMessageID()`, `generatePartID()`

### storage.ts
实现了消息和会话数据的存储抽象层：
- `ISessionStorage`: 存储接口，定义了所有存储操作
- `VSCodeSessionStorage`: 基于 VSCode 扩展全局状态的存储实现
- 支持消息的增删改查、部分管理和会话消息批量操作

### system.ts
提供针对不同模型的系统提示词和环境信息：
- `SystemPrompt`: 系统提示词工具集
  - `provider()`: 获取针对特定模型的提供商系统提示词
  - `environment()`: 获取环境信息
  - `instructions()`: 获取所有指令（用于特定用途）

### processor.ts
实现消息处理逻辑：
- `SessionProcessor`: 会话处理器类
  - `process()`: 处理会话，返回处理结果
  - 内部方法处理文本增量、工具调用和工具结果
- 支持流式处理、错误处理和完成状态管理

### llm.ts
封装 AI SDK 的 streamText，提供工具参数转换和流式响应处理：
- `stream()`: 流式调用 LLM 的主函数
- `resolveTools()`: 解析工具，将工具注册表中的工具转换为 AI SDK 的 Tool 格式
- 优化了工具参数序列化逻辑，确保不包含 Zod 内部结构

### index.ts
导出所有session模块接口，提供统一的入口点。

## 特点和优化

1. **健壮的工具参数序列化**: 使用专门的 `zodToJsonSchemaClean` 函数确保转换后的 JSON Schema 不包含任何 Zod 内部结构
2. **模型适配**: 针对不同模型（如智谱AI、OpenAI、Anthropic）提供定制的系统提示词
3. **流式处理**: 支持流式处理 LLM 响应，实时显示内容更新
4. **错误处理**: 完善的错误处理机制，包括工具调用错误和 LLM API 错误
5. **类型安全**: 使用 TypeScript 提供完整的类型定义和检查

## 使用示例

```typescript
import { SessionProcessor, VSCodeSessionStorage, stream } from './session';

// 创建存储实例
const storage = new VSCodeSessionStorage(context);

// 创建会话处理器
const processor = new SessionProcessor({
  sessionID: 'session-123',
  userMessage,
  model,
  agent,
  toolRegistry,
  languageModel,
  provider,
  messages,
  abort: new AbortController().signal,
  storage,
});

// 处理会话
const result = await processor.process();
```

## 注意事项

1. 所有函数和方法都提供了详细的中文注释，符合代码规范
2. 代码设计遵循了单一职责原则和依赖注入模式
3. 错误处理全面，包括日志记录和异常传播
4. 与 opencode 项目保持相似的架构，但针对 HiCode 的需求进行了适配