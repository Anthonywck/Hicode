/**
 * 工具基类和接口定义
 * 提供工具定义、执行上下文等核心功能
 */

import { z } from 'zod';
import type { MessageWithParts } from '../session/message';
import type { AgentConfig } from '../agent/types';
import type { FilePart } from '../session/message';

/**
 * 工具元数据
 */
export interface ToolMetadata {
  [key: string]: any;
}

/**
 * 工具初始化上下文
 */
export interface ToolInitContext {
  agent?: AgentConfig;
}

/**
 * 权限请求
 */
export interface PermissionRequest {
  permission: string;
  patterns: string[];
  always?: string[];
  metadata?: Record<string, any>;
}

/**
 * 工具执行上下文
 */
export interface ToolContext<M extends ToolMetadata = ToolMetadata> {
  /** 会话ID */
  sessionID: string;
  /** 消息ID */
  messageID: string;
  /** Agent名称 */
  agent: string;
  /** 中止信号 */
  abort: AbortSignal;
  /** 工具调用ID（可选） */
  callID?: string;
  /** 额外数据 */
  extra?: { [key: string]: any };
  /** 消息列表 */
  messages: MessageWithParts[];
  /** 设置元数据 */
  metadata(input: { title?: string; metadata?: M }): void;
  /** 请求权限 */
  ask(input: PermissionRequest): Promise<void>;
}

/**
 * 工具执行结果
 */
export interface ToolResult<M extends ToolMetadata = ToolMetadata> {
  /** 标题 */
  title: string;
  /** 元数据 */
  metadata: M;
  /** 输出内容 */
  output: string;
  /** 附件（文件） */
  attachments?: FilePart[];
}

/**
 * 工具信息接口
 */
export interface ToolInfo<
  Parameters extends z.ZodType = z.ZodType,
  M extends ToolMetadata = ToolMetadata
> {
  /** 工具ID */
  id: string;
  /** 初始化函数 */
  init: (ctx?: ToolInitContext) => Promise<{
    /** 工具描述 */
    description: string;
    /** 参数模式 */
    parameters: Parameters;
    /** 执行函数 */
    execute(
      args: z.infer<Parameters>,
      ctx: ToolContext<M>
    ): Promise<ToolResult<M>>;
    /** 验证错误格式化函数（可选） */
    formatValidationError?: (error: z.ZodError) => string;
  }>;
}

/**
 * 工具命名空间
 */
export namespace Tool {
  /**
   * 工具元数据类型
   */
  export interface Metadata extends ToolMetadata {}

  /**
   * 工具初始化上下文
   */
  export interface InitContext extends ToolInitContext {}

  /**
   * 工具执行上下文
   */
  export type Context<M extends Metadata = Metadata> = ToolContext<M>;

  /**
   * 工具信息
   */
  export interface Info<
    Parameters extends z.ZodType = z.ZodType,
    M extends Metadata = Metadata
  > extends ToolInfo<Parameters, M> {}

  /**
   * 推断参数类型
   */
  export type InferParameters<T extends Info> = T extends Info<infer P>
    ? z.infer<P>
    : never;

  /**
   * 推断元数据类型
   */
  export type InferMetadata<T extends Info> = T extends Info<any, infer M>
    ? M
    : never;

  /**
   * 定义工具
   * @param id 工具ID
   * @param init 初始化函数或已初始化的工具信息
   * @returns 工具信息
   */
  export function define<Parameters extends z.ZodType, Result extends Metadata>(
    id: string,
    init:
      | Info<Parameters, Result>['init']
      | Awaited<ReturnType<Info<Parameters, Result>['init']>>
  ): Info<Parameters, Result> {
    return {
      id,
      init: async (initCtx) => {
        const toolInfo = init instanceof Function ? await init(initCtx) : init;
        const execute = toolInfo.execute;

        toolInfo.execute = async (args, ctx) => {
          try {
            toolInfo.parameters.parse(args);
          } catch (error) {
            if (error instanceof z.ZodError && toolInfo.formatValidationError) {
              const formattedError = new Error(toolInfo.formatValidationError(error));
              (formattedError as any).cause = error;
              throw formattedError;
            }
            const errorMessage =
              error instanceof Error
                ? error.message
                : String(error);
            const validationError = new Error(
              `The ${id} tool was called with invalid arguments: ${errorMessage}.\nPlease rewrite the input so it satisfies the expected schema.`
            );
            (validationError as any).cause = error;
            throw validationError;
          }

          const result = await execute(args, ctx);
          return result;
        };

        return toolInfo;
      },
    };
  }
}
