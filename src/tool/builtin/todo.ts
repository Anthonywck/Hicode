/**
 * Todo tool - 待办事项工具
 * 
 * 功能：
 * - 管理待办事项列表
 * - 支持添加、更新、标记完成待办事项
 * - 跟踪待办事项状态（pending、in_progress、completed）
 */

import { z } from 'zod';
import { Tool } from '../tool';
import { getTodos, updateTodos } from './todo-storage';

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

    // 保存待办事项到存储
    await updateTodos(ctx.sessionID, params.todos);
    
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

    // 从存储中读取待办事项
    const todos = await getTodos(ctx.sessionID);

    return {
      title: `${todos.filter((x) => x.status !== 'completed').length} todos`,
      metadata: {
        todos,
      },
      output: JSON.stringify(todos, null, 2),
    };
  },
});
