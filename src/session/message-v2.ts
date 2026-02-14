/**
 * MessageV2 Model
 * Enhanced message model for session management
 * Based on opencode's MessageV2 but adapted for hicode
 */

import { z } from 'zod';

/**
 * Base part schema with common fields
 */
const PartBase = z.object({
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
});

/**
 * Text part schema
 */
export const TextPart = PartBase.extend({
  type: z.literal('text'),
  text: z.string(),
  synthetic: z.boolean().optional(),
  ignored: z.boolean().optional(),
  time: z
    .object({
      start: z.number(),
      end: z.number().optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type TextPart = z.infer<typeof TextPart>;

/**
 * File part schema
 */
export const FilePart = PartBase.extend({
  type: z.literal('file'),
  mime: z.string(),
  filename: z.string().optional(),
  url: z.string(),
  source: z
    .object({
      type: z.enum(['file', 'symbol', 'resource']),
      path: z.string().optional(),
      text: z
        .object({
          value: z.string(),
          start: z.number().int(),
          end: z.number().int(),
        })
        .optional(),
    })
    .optional(),
});
export type FilePart = z.infer<typeof FilePart>;

/**
 * Tool call state schemas
 */
export const ToolStatePending = z.object({
  status: z.literal('pending'),
  input: z.record(z.string(), z.any()),
  raw: z.string(),
});
export type ToolStatePending = z.infer<typeof ToolStatePending>;

export const ToolStateRunning = z.object({
  status: z.literal('running'),
  input: z.record(z.string(), z.any()),
  title: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  time: z.object({
    start: z.number(),
  }),
});
export type ToolStateRunning = z.infer<typeof ToolStateRunning>;

export const ToolStateCompleted = z.object({
  status: z.literal('completed'),
  input: z.record(z.string(), z.any()),
  output: z.string(),
  title: z.string(),
  metadata: z.record(z.string(), z.any()),
  time: z.object({
    start: z.number(),
    end: z.number(),
    compacted: z.number().optional(),
  }),
  attachments: FilePart.array().optional(),
});
export type ToolStateCompleted = z.infer<typeof ToolStateCompleted>;

export const ToolStateError = z.object({
  status: z.literal('error'),
  input: z.record(z.string(), z.any()),
  error: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  time: z.object({
    start: z.number(),
    end: z.number(),
  }),
});
export type ToolStateError = z.infer<typeof ToolStateError>;

export const ToolState = z.discriminatedUnion('status', [
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
]);
export type ToolState = z.infer<typeof ToolState>;

/**
 * Tool part schema
 */
export const ToolPart = PartBase.extend({
  type: z.literal('tool'),
  callID: z.string(),
  tool: z.string(),
  state: ToolState,
  metadata: z.record(z.string(), z.any()).optional(),
});
export type ToolPart = z.infer<typeof ToolPart>;

/**
 * Reasoning part schema
 */
export const ReasoningPart = PartBase.extend({
  type: z.literal('reasoning'),
  text: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  time: z.object({
    start: z.number(),
    end: z.number().optional(),
  }),
});
export type ReasoningPart = z.infer<typeof ReasoningPart>;

/**
 * Compaction part schema
 */
export const CompactionPart = PartBase.extend({
  type: z.literal('compaction'),
  auto: z.boolean(),
});
export type CompactionPart = z.infer<typeof CompactionPart>;

/**
 * Part union type
 */
export const Part = z.discriminatedUnion('type', [
  TextPart,
  FilePart,
  ToolPart,
  ReasoningPart,
  CompactionPart,
]);
export type Part = z.infer<typeof Part>;

/**
 * Base message schema
 */
const Base = z.object({
  id: z.string(),
  sessionID: z.string(),
});

/**
 * User message schema
 */
export const UserMessage = Base.extend({
  role: z.literal('user'),
  time: z.object({
    created: z.number(),
  }),
  summary: z
    .object({
      title: z.string().optional(),
      body: z.string().optional(),
      diffs: z.array(z.any()).optional(),
    })
    .optional(),
  agent: z.string(),
  model: z.object({
    providerID: z.string(),
    modelID: z.string(),
  }),
  system: z.string().optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
  variant: z.string().optional(),
});
export type UserMessage = z.infer<typeof UserMessage>;

/**
 * Message error schemas
 */
export const MessageError = z
  .discriminatedUnion('name', [
    z.object({
      name: z.literal('MessageOutputLengthError'),
    }),
    z.object({
      name: z.literal('MessageAbortedError'),
      message: z.string(),
    }),
    z.object({
      name: z.literal('ProviderAuthError'),
      providerID: z.string(),
      message: z.string(),
    }),
    z.object({
      name: z.literal('APIError'),
      message: z.string(),
      statusCode: z.number().optional(),
      isRetryable: z.boolean(),
      responseHeaders: z.record(z.string(), z.string()).optional(),
      responseBody: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }),
    z.object({
      name: z.literal('Unknown'),
      message: z.string(),
    }),
  ])
  .optional();
export type MessageError = z.infer<typeof MessageError>;

/**
 * Assistant message schema
 */
export const AssistantMessage = Base.extend({
  role: z.literal('assistant'),
  time: z.object({
    created: z.number(),
    completed: z.number().optional(),
  }),
  error: MessageError,
  parentID: z.string(),
  modelID: z.string(),
  providerID: z.string(),
  mode: z.string(),
  agent: z.string(),
  path: z.object({
    cwd: z.string(),
    root: z.string(),
  }),
  summary: z.boolean().optional(),
  cost: z.number(),
  tokens: z.object({
    input: z.number(),
    output: z.number(),
    reasoning: z.number(),
    cache: z.object({
      read: z.number(),
      write: z.number(),
    }),
  }),
  finish: z.string().optional(),
});
export type AssistantMessage = z.infer<typeof AssistantMessage>;

/**
 * Message info union type
 */
export const MessageInfo = z.discriminatedUnion('role', [UserMessage, AssistantMessage]);
export type MessageInfo = z.infer<typeof MessageInfo>;

/**
 * Message with parts
 */
export const MessageWithParts = z.object({
  info: MessageInfo,
  parts: z.array(Part),
});
export type MessageWithParts = z.infer<typeof MessageWithParts>;

/**
 * Generate message ID
 */
export function generateMessageID(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate part ID
 */
export function generatePartID(): string {
  return `part_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
