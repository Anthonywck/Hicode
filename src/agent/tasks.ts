/**
 * Agent任务定义
 * 定义内置任务模板和自定义任务管理
 */

import { AgentTask } from './types';

/**
 * 获取内置Agent任务列表
 * @returns 内置任务数组
 */
export function getBuiltInTasks(): AgentTask[] {
  return [
    {
      type: 'refactor',
      name: '重构代码',
      description: '优化代码结构和可读性，提高代码质量',
      prompt: `请重构以下代码，提高可读性和可维护性。

要求：
1. 保持功能不变
2. 改善代码结构
3. 使用更清晰的变量和函数命名
4. 添加必要的注释
5. 遵循最佳实践

代码：
{code}

请提供重构后的完整代码。`,
      isCustom: false
    },
    {
      type: 'test',
      name: '生成测试',
      description: '为选中的代码生成单元测试',
      prompt: `请为以下代码生成完整的单元测试。

要求：
1. 使用适合该语言的测试框架
2. 覆盖主要功能和边界情况
3. 包含正常情况和异常情况的测试
4. 测试代码应该清晰易懂
5. 包含必要的测试数据和mock

代码：
{code}

语言：{language}

请提供完整的测试代码。`,
      isCustom: false
    },
    {
      type: 'document',
      name: '生成文档',
      description: '为代码生成注释和文档',
      prompt: `请为以下代码生成详细的注释和文档。

要求：
1. 为函数/类添加文档注释
2. 解释复杂逻辑
3. 说明参数和返回值
4. 包含使用示例（如果适用）
5. 遵循该语言的文档规范

代码：
{code}

语言：{language}

请提供添加了文档的完整代码。`,
      isCustom: false
    },
    {
      type: 'fix',
      name: '修复问题',
      description: '修复代码中的错误或问题',
      prompt: `请修复以下代码中的问题。

问题描述：
{problem}

代码：
{code}

要求：
1. 识别并修复问题
2. 确保修复后代码正常工作
3. 添加注释说明修复内容
4. 如果有多个问题，全部修复

请提供修复后的完整代码。`,
      isCustom: false
    },
    {
      type: 'optimize',
      name: '优化性能',
      description: '优化代码性能和效率',
      prompt: `请优化以下代码的性能。

要求：
1. 识别性能瓶颈
2. 优化算法复杂度
3. 减少不必要的计算
4. 改善内存使用
5. 添加注释说明优化点

代码：
{code}

语言：{language}

请提供优化后的完整代码，并说明优化的具体内容。`,
      isCustom: false
    }
  ];
}

/**
 * 加载自定义任务
 * @param storageManager 存储管理器
 * @returns 自定义任务数组
 */
export function loadCustomTasks(storageManager: any): AgentTask[] {
  try {
    const data = storageManager.get('agentCustomTasks');
    if (data) {
      const tasks = JSON.parse(data);
      return Array.isArray(tasks) ? tasks : [];
    }
  } catch (error) {
    console.error('Failed to load custom tasks:', error);
  }
  return [];
}

/**
 * 保存自定义任务
 * @param task 要保存的任务
 * @param storageManager 存储管理器
 */
export async function saveCustomTask(task: AgentTask, storageManager: any): Promise<void> {
  try {
    // 加载现有任务
    const existingTasks = loadCustomTasks(storageManager);
    
    // 检查是否已存在同名任务
    const index = existingTasks.findIndex(t => t.name === task.name);
    if (index >= 0) {
      // 更新现有任务
      existingTasks[index] = task;
    } else {
      // 添加新任务
      existingTasks.push(task);
    }
    
    // 保存到存储
    const data = JSON.stringify(existingTasks);
    await storageManager.set('agentCustomTasks', data);
  } catch (error) {
    console.error('Failed to save custom task:', error);
    throw new Error('保存自定义任务失败');
  }
}

/**
 * 删除自定义任务
 * @param taskName 任务名称
 * @param storageManager 存储管理器
 */
export async function deleteCustomTask(taskName: string, storageManager: any): Promise<void> {
  try {
    const existingTasks = loadCustomTasks(storageManager);
    const filteredTasks = existingTasks.filter(t => t.name !== taskName);
    
    const data = JSON.stringify(filteredTasks);
    await storageManager.set('agentCustomTasks', data);
  } catch (error) {
    console.error('Failed to delete custom task:', error);
    throw new Error('删除自定义任务失败');
  }
}

/**
 * 构建任务提示词
 * 将模板中的占位符替换为实际值
 * @param task Agent任务
 * @param code 代码内容
 * @param language 编程语言
 * @param problem 问题描述（可选）
 * @returns 构建好的提示词
 */
export function buildTaskPrompt(
  task: AgentTask,
  code: string,
  language?: string,
  problem?: string
): string {
  let prompt = task.prompt;
  
  // 替换占位符
  prompt = prompt.replace(/{code}/g, code);
  
  if (language) {
    prompt = prompt.replace(/{language}/g, language);
  }
  
  if (problem) {
    prompt = prompt.replace(/{problem}/g, problem);
  }
  
  return prompt;
}

/**
 * 验证任务定义
 * @param task 要验证的任务
 * @returns 验证结果
 */
export function validateTask(task: AgentTask): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!task.name || task.name.trim() === '') {
    errors.push('任务名称不能为空');
  }
  
  if (!task.description || task.description.trim() === '') {
    errors.push('任务描述不能为空');
  }
  
  if (!task.prompt || task.prompt.trim() === '') {
    errors.push('提示词模板不能为空');
  }
  
  if (!task.type) {
    errors.push('任务类型不能为空');
  }
  
  // 检查提示词是否包含{code}占位符
  if (task.prompt && !task.prompt.includes('{code}')) {
    errors.push('提示词模板必须包含{code}占位符');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
