/**
 * 会话模块入口
 * 导出所有会话相关的接口和实现
 */

// 消息相关
export {
  MessageRole,
  type MessageTime,
  type MessageCost,
  type MessageError,
  type FilePart,
  type TextPart,
  type ToolCallPart,
  type Part,
  type BaseMessage,
  type UserMessage,
  type AssistantMessage,
  type MessageWithParts,
  generateMessageID,
  generatePartID,
} from './message';

// 重新导出 MessageInfo（从 storage.ts）
export type { MessageInfo } from './storage';

// 存储相关
export {
  type ISessionStorage,
  VSCodeSessionStorage,
} from './storage';

// 系统提示词相关
export {
  SystemPrompt,
} from './system';

// 处理器相关
export {
  SessionProcessor,
  type ProcessorConfig,
  type ProcessorResult,
} from './processor';

// LLM流处理相关
export {
  stream,
  type StreamInput,
  type StreamOutput,
} from './llm';