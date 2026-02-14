/**
 * 工具注册表
 * 管理工具的注册、发现和获取
 */

import { z } from 'zod';
import type { Tool } from './tool';
import type { AgentConfig } from '../agent/types';
import { evaluate } from '../permission/evaluator';

/**
 * 工具注册表类
 */
export class ToolRegistry {
  private toolMap: Map<string, Tool.Info> = new Map();

  /**
   * 注册工具
   * @param tool 工具信息
   */
  register(tool: Tool.Info): void {
    this.toolMap.set(tool.id, tool);
  }

  /**
   * 注册多个工具
   * @param tools 工具列表
   */
  registerAll(tools: Tool.Info[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 获取工具
   * @param id 工具ID
   * @returns 工具信息，如果不存在则返回undefined
   */
  get(id: string): Tool.Info | undefined {
    return this.toolMap.get(id);
  }

  /**
   * 检查工具是否存在
   * @param id 工具ID
   * @returns 是否存在
   */
  has(id: string): boolean {
    return this.toolMap.has(id);
  }

  /**
   * 获取所有工具ID
   * @returns 工具ID列表
   */
  ids(): string[] {
    return Array.from(this.toolMap.keys());
  }

  /**
   * 获取所有工具
   * @returns 工具列表
   */
  all(): Tool.Info[] {
    return Array.from(this.toolMap.values());
  }

  /**
   * 移除工具
   * @param id 工具ID
   * @returns 是否成功移除
   */
  remove(id: string): boolean {
    return this.toolMap.delete(id);
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.toolMap.clear();
  }

  /**
   * 获取工具数量
   * @returns 工具数量
   */
  size(): number {
    return this.toolMap.size;
  }

  /**
   * 检查工具是否被Agent允许使用
   * @param toolId 工具ID
   * @param agent Agent配置
   * @returns 是否允许
   */
  private isToolAllowed(toolId: string, agent?: AgentConfig): boolean {
    if (!agent?.permission) {
      return true; // 如果没有权限配置，默认允许
    }
    
    const rule = evaluate(toolId, '*', agent.permission);
    return rule.action !== 'deny';
  }

  /**
   * 获取已初始化的工具列表（用于AI SDK）
   * @param agent Agent配置（可选）
   * @param options 选项
   * @param options.filterByPermission 是否根据权限过滤工具（默认true）
   * @param options.tools 工具白名单（如果提供，只返回这些工具）
   * @returns 已初始化的工具列表
   */
  async tools(
    agent?: AgentConfig,
    options?: {
      filterByPermission?: boolean;
      tools?: Record<string, boolean>;
    }
  ): Promise<
    Array<{
      id: string;
      description: string;
      parameters: z.ZodType;
    }>
  > {
    const filterByPermission = options?.filterByPermission !== false;
    const toolWhitelist = options?.tools;
    
    // 先过滤工具
    let filteredTools = this.all();
    
    // 如果提供了工具白名单，只返回白名单中的工具
    if (toolWhitelist) {
      filteredTools = filteredTools.filter((tool) => toolWhitelist[tool.id] === true);
    }
    
    // 根据权限过滤
    if (filterByPermission && agent) {
      filteredTools = filteredTools.filter((tool) => this.isToolAllowed(tool.id, agent));
    }
    
    // 初始化工具
    const result = await Promise.all(
      filteredTools.map(async (tool) => {
        const initialized = await tool.init({ agent });
        return {
          id: tool.id,
          description: initialized.description,
          parameters: initialized.parameters,
        };
      })
    );
    
    return result;
  }
}

/**
 * 全局工具注册表实例
 */
let globalRegistry: ToolRegistry | null = null;

/**
 * 获取全局工具注册表
 * @returns 工具注册表实例
 */
export function getToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry();
  }
  return globalRegistry;
}

/**
 * 设置全局工具注册表（主要用于测试）
 * @param registry 工具注册表实例
 */
export function setToolRegistry(registry: ToolRegistry): void {
  globalRegistry = registry;
}

/**
 * 工具注册表命名空间
 */
export namespace ToolRegistry {
  /**
   * 注册工具
   */
  export function register(tool: Tool.Info): void {
    getToolRegistry().register(tool);
  }

  /**
   * 注册多个工具
   */
  export function registerAll(tools: Tool.Info[]): void {
    getToolRegistry().registerAll(tools);
  }

  /**
   * 获取工具
   */
  export function get(id: string): Tool.Info | undefined {
    return getToolRegistry().get(id);
  }

  /**
   * 检查工具是否存在
   */
  export function has(id: string): boolean {
    return getToolRegistry().has(id);
  }

  /**
   * 获取所有工具ID
   */
  export function ids(): string[] {
    return getToolRegistry().ids();
  }

  /**
   * 获取所有工具
   */
  export function all(): Tool.Info[] {
    return getToolRegistry().all();
  }

  /**
   * 移除工具
   */
  export function remove(id: string): boolean {
    return getToolRegistry().remove(id);
  }

  /**
   * 清空所有工具
   */
  export function clear(): void {
    getToolRegistry().clear();
  }

  /**
   * 获取工具数量
   */
  export function size(): number {
    return getToolRegistry().size();
  }

  /**
   * 获取已初始化的工具列表
   */
  export async function tools(
    agent?: AgentConfig,
    options?: {
      filterByPermission?: boolean;
      tools?: Record<string, boolean>;
    }
  ): Promise<
    Array<{
      id: string;
      description: string;
      parameters: z.ZodType;
    }>
  > {
    return getToolRegistry().tools(agent, options);
  }
}
