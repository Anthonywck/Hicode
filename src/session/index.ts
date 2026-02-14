/**
 * 会话模块入口
 * 导出所有会话相关的接口和实现
 */

// MessageV2 相关
export {
  type TextPart,
  type FilePart,
  type ToolPart,
  type ReasoningPart,
  type CompactionPart,
  type Part,
  type UserMessage,
  type AssistantMessage,
  type MessageInfo,
  type MessageWithParts,
  type MessageError,
  type ToolState,
  type ToolStatePending,
  type ToolStateRunning,
  type ToolStateCompleted,
  type ToolStateError,
  generateMessageID,
  generatePartID,
} from './message-v2';

// Session Core 相关
export {
  Session,
  SessionState,
  type SessionMetadata,
} from './session-core';

// Session Manager 相关
export {
  SessionManager,
  type ISessionManager,
} from './session-manager';

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