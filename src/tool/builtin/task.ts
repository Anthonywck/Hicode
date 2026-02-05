/**
 * Task tool - 调用子 Agent 工具
 * 
 * 功能：
 * - 将任务委托给专门的子Agent处理
 * - 支持创建新的任务会话或继续现有会话
 * - 用于将复杂任务分解为子任务
 * 
 * 注意：当前实现为占位符，实际子Agent调用逻辑待实现
 */

import { z } from 'zod';
import { Tool } from '../tool';

/**
 * Task 工具定义
 * 
 * 参数：
 * - description: 任务的简短描述（3-5个单词）
 * - prompt: 要执行的任务描述
 * - subagent_type: 要使用的子Agent类型
 * - session_id: 现有任务会话ID（可选，用于继续现有会话）
 * - command: 触发此任务的命令（可选）
 * 
 * 使用场景：
 * - 当主Agent需要将复杂任务分解为子任务时
 * - 当需要调用专门的Agent（如代码审查、测试生成等）时
 * - 当需要并行处理多个子任务时
 */
export const TaskTool = Tool.define('task', {
  description: `Delegate a task to a specialized sub-agent. Use this tool when you need to break down a complex task into smaller subtasks that can be handled by specialized agents.`,
  parameters: z.object({
    description: z.string().describe('A short (3-5 words) description of the task'),
    prompt: z.string().describe('The task for the agent to perform'),
    subagent_type: z.string().describe('The type of specialized agent to use for this task'),
    session_id: z.string().optional().describe('Existing Task session to continue'),
    command: z.string().optional().describe('The command that triggered this task'),
  }),
  async execute(params, ctx) {
    // 请求任务执行权限
    await ctx.ask({
      permission: 'task',
      patterns: [params.subagent_type],
      always: ['*'],
      metadata: {
        description: params.description,
        subagent_type: params.subagent_type,
      },
    });

    // TODO: 实现实际的子Agent调用逻辑
    // 当前实现为占位符，返回一个占位响应
    // 
    // 实际实现应该：
    // 1. 根据subagent_type查找对应的Agent配置
    // 2. 创建或获取任务会话（session）
    // 3. 调用子Agent执行任务
    // 4. 返回任务执行结果
    const output = `Task "${params.description}" delegated to sub-agent "${params.subagent_type}".\n\n<task_metadata>\nsession_id: ${params.session_id || 'new'}\n</task_metadata>`;

    return {
      title: params.description,
      metadata: {
        sessionId: params.session_id || 'new',
        subagentType: params.subagent_type,
      },
      output,
    };
  },
});
