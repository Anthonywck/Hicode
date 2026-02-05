/**
 * Todo tool - 待办事项工具
 * 
 * 功能：
 * - 管理待办事项列表
 * - 支持添加、更新、标记完成待办事项
 * - 跟踪待办事项状态（pending、in_progress、completed）
 * 
 * 注意：当前实现为占位符，实际的待办事项存储逻辑待实现
 */

import { z } from 'zod';
import { Tool } from '../tool';

/**
 * 待办事项数据结构
 * 
 * - id: 唯一标识符
 * - content: 待办事项内容
 * - status: 状态（pending待处理、in_progress进行中、completed已完成）
 */
const TodoSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

/**
 * TodoWrite 工具定义
 * 
 * 用于更新待办事项列表
 * 
 * 参数：
 * - todos: 更新后的待办事项列表
 * 
 * 使用场景：
 * - 添加新的待办事项
 * - 更新现有待办事项的状态
 * - 标记待办事项为已完成
 * - 删除待办事项（从列表中移除）
 */
export const TodoWriteTool = Tool.define('todowrite', {
  description: `Update the todo list. Use this tool to add, update, or mark todos as completed.`,
  parameters: z.object({
    todos: z.array(TodoSchema).describe('The updated todo list'),
  }),
  async execute(params, ctx) {
    // 请求写入待办事项的权限
    await ctx.ask({
      permission: 'todowrite',
      patterns: ['*'],
      always: ['*'],
      metadata: {},
    });

    // TODO: 实现实际的待办事项存储逻辑
    // 当前实现为占位符，仅返回待办事项
    // 
    // 实际实现应该：
    // 1. 将待办事项保存到会话存储或持久化存储
    // 2. 支持会话级别的待办事项管理
    // 3. 提供待办事项的增删改查功能
    
    // 统计未完成的待办事项数量
    const pendingCount = params.todos.filter((x) => x.status !== 'completed').length;

    return {
      title: `${pendingCount} todos`,
      output: JSON.stringify(params.todos, null, 2),
      metadata: {
        todos: params.todos,
      },
    };
  },
});

/**
 * TodoRead 工具定义
 * 
 * 用于读取当前待办事项列表
 * 
 * 参数：无
 * 
 * 使用场景：
 * - 查看当前有哪些待办事项
 * - 检查待办事项的状态
 * - 获取待办事项统计信息
 */
export const TodoReadTool = Tool.define('todoread', {
  description: `Read the current todo list. Use this tool to check what tasks are pending or in progress.`,
  parameters: z.object({}),
  async execute(_params, ctx) {
    // 请求读取待办事项的权限
    await ctx.ask({
      permission: 'todoread',
      patterns: ['*'],
      always: ['*'],
      metadata: {},
    });

    // TODO: 实现实际的待办事项读取逻辑
    // 当前实现为占位符，返回空列表
    // 
    // 实际实现应该：
    // 1. 从会话存储或持久化存储中读取待办事项
    // 2. 返回当前会话的所有待办事项
    // 3. 支持按状态过滤
    
    const todos: Array<{ id: string; content: string; status: 'pending' | 'in_progress' | 'completed' }> =
      [];

    return {
      title: `${todos.filter((x) => x.status !== 'completed').length} todos`,
      metadata: {
        todos,
      },
      output: JSON.stringify(todos, null, 2),
    };
  },
});
