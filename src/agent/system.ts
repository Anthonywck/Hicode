/**
 * Agent System核心
 * 实现氛围感编程功能，管理Agent任务的执行
 */

import { CodeContext, ChatRequest, IAPIClient } from '../api/types';
import { AgentTask, AgentResult, AgentHistoryEntry, CodeChange } from './types';
import { getBuiltInTasks, loadCustomTasks, saveCustomTask } from './tasks';
import { AgentExecutor } from './executor';

/**
 * Agent系统接口
 */
export interface IAgentSystem {
  /**
   * 获取可用的Agent任务列表
   * @param context 代码上下文
   * @returns 可用任务列表
   */
  getAvailableTasks(context: CodeContext): AgentTask[];

  /**
   * 执行Agent任务
   * @param task 要执行的任务
   * @param context 代码上下文
   * @returns 执行结果
   */
  executeTask(task: AgentTask, context: CodeContext): Promise<AgentResult>;

  /**
   * 预览更改
   * @param result Agent执行结果
   */
  previewChanges(result: AgentResult): Promise<void>;

  /**
   * 应用更改
   * @param result Agent执行结果
   */
  applyChanges(result: AgentResult): Promise<void>;

  /**
   * 撤销最近的更改
   */
  undoLastChange(): Promise<void>;

  /**
   * 添加自定义任务模板
   * @param task 自定义任务
   */
  addCustomTask(task: AgentTask): Promise<void>;

  /**
   * 获取操作历史
   * @returns 历史记录列表
   */
  getHistory(): AgentHistoryEntry[];
}

/**
 * Agent系统实现
 */
export class AgentSystem implements IAgentSystem {
  private taskHistory: AgentHistoryEntry[] = [];
  private customTasks: AgentTask[] = [];
  private executor: AgentExecutor;

  constructor(
    private apiClient: IAPIClient,
    private storageManager?: any
  ) {
    this.executor = new AgentExecutor(apiClient);
    this.loadCustomTasks();
  }

  /**
   * 获取可用的Agent任务列表
   */
  getAvailableTasks(context: CodeContext): AgentTask[] {
    // 获取内置任务
    const builtInTasks = getBuiltInTasks();
    
    // 合并自定义任务
    return [...builtInTasks, ...this.customTasks];
  }

  /**
   * 执行Agent任务
   */
  async executeTask(task: AgentTask, context: CodeContext): Promise<AgentResult> {
    try {
      // 使用executor执行任务
      const result = await this.executor.execute(task, context);

      // 如果执行成功，保存到历史记录
      if (result.success) {
        const historyEntry: AgentHistoryEntry = {
          id: this.generateId(),
          timestamp: new Date(),
          task,
          result,
          context
        };
        this.taskHistory.push(historyEntry);
      }

      return result;
    } catch (error) {
      // 返回失败结果
      return {
        success: false,
        changes: [],
        message: '任务执行失败',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 预览更改
   */
  async previewChanges(result: AgentResult): Promise<void> {
    await this.executor.previewChanges(result);
  }

  /**
   * 应用更改
   */
  async applyChanges(result: AgentResult): Promise<void> {
    await this.executor.applyChanges(result);
  }

  /**
   * 撤销最近的更改
   */
  async undoLastChange(): Promise<void> {
    if (this.taskHistory.length === 0) {
      throw new Error('没有可撤销的更改');
    }

    const lastEntry = this.taskHistory.pop()!;
    
    // 使用executor撤销更改
    await this.executor.undoChanges(lastEntry.result);
  }

  /**
   * 添加自定义任务模板
   */
  async addCustomTask(task: AgentTask): Promise<void> {
    // 标记为自定义任务
    const customTask: AgentTask = {
      ...task,
      isCustom: true
    };

    // 添加到自定义任务列表
    this.customTasks.push(customTask);

    // 持久化保存
    if (this.storageManager) {
      await saveCustomTask(customTask, this.storageManager);
    }
  }

  /**
   * 获取操作历史
   */
  getHistory(): AgentHistoryEntry[] {
    return [...this.taskHistory];
  }

  /**
   * 加载自定义任务
   */
  private loadCustomTasks(): void {
    if (this.storageManager) {
      this.customTasks = loadCustomTasks(this.storageManager);
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
