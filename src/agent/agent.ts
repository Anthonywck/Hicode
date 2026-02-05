/**
 * Agent管理核心
 * 提供Agent的获取、列表、默认选择等功能
 */

import { AgentRegistry, getAgentRegistry } from './registry';
import { AgentConfig, AgentType, AgentMode } from './types';
import { PermissionRuleset, fromConfig as fromPermissionConfig, createDefault, merge } from '../permission';

/**
 * Agent管理命名空间
 */
export namespace Agent {
  /**
   * 获取指定类型的Agent配置
   * @param type Agent类型
   * @returns Agent配置，如果不存在则返回null
   */
  export function get(type: AgentType | string): AgentConfig | null {
    const registry = getAgentRegistry();
    return registry.get(type as AgentType);
  }

  /**
   * 获取所有Agent配置列表
   * @param options 选项
   * @param options.mode 过滤模式（只返回指定模式的Agent）
   * @param options.enabled 是否只返回启用的Agent
   * @param options.hidden 是否包含隐藏的Agent
   * @returns Agent配置列表
   */
  export function list(options?: {
    mode?: AgentMode;
    enabled?: boolean;
    hidden?: boolean;
  }): AgentConfig[] {
    const registry = getAgentRegistry();
    let agents = registry.getAll();

    if (options?.mode) {
      agents = agents.filter(agent => agent.mode === options.mode);
    }

    if (options?.enabled !== undefined) {
      agents = agents.filter(agent => (agent.enabled ?? true) === options.enabled);
    }

    if (options?.hidden === false) {
      agents = agents.filter(agent => !(agent as any).hidden);
    }

    return agents;
  }

  /**
   * 获取默认Agent
   * 优先级：
   * 1. 配置中指定的默认Agent
   * 2. 第一个primary模式且启用的Agent
   * 3. 第一个启用的Agent
   * 4. build Agent
   * @param defaultAgentName 配置的默认Agent名称（可选）
   * @returns 默认Agent配置
   */
  export function defaultAgent(defaultAgentName?: string): AgentConfig {
    const registry = getAgentRegistry();
    const allAgents = registry.getAll();

    if (defaultAgentName) {
      const agent = registry.get(defaultAgentName as AgentType);
      if (agent) {
        if (agent.mode === 'subagent') {
          throw new Error(`default agent "${defaultAgentName}" is a subagent`);
        }
        if ((agent as any).hidden === true) {
          throw new Error(`default agent "${defaultAgentName}" is hidden`);
        }
        return agent;
      }
    }

    const primaryVisible = allAgents.find(
      agent => agent.mode === 'primary' && (agent.enabled ?? true) && !(agent as any).hidden
    );
    if (primaryVisible) {
      return primaryVisible;
    }

    const enabled = allAgents.find(agent => agent.enabled !== false);
    if (enabled) {
      return enabled;
    }

    return registry.getDefault();
  }

  /**
   * 检查Agent是否存在
   * @param type Agent类型
   * @returns 是否存在
   */
  export function has(type: AgentType | string): boolean {
    const registry = getAgentRegistry();
    return registry.has(type as AgentType);
  }

  /**
   * 注册Agent配置
   * @param config Agent配置
   */
  export function register(config: AgentConfig): void {
    const registry = getAgentRegistry();
    registry.register(config);
  }

  /**
   * 从配置对象创建Agent配置
   * @param type Agent类型
   * @param config 配置对象
   * @param defaults 默认权限规则集
   * @param userPermissions 用户权限配置
   * @returns Agent配置
   */
  export function fromConfig(
    type: AgentType | string,
    config: Partial<AgentConfig> & {
      name: string;
      description?: string;
      mode?: AgentMode;
      permission?: Record<string, any>;
      prompt?: string;
      modelId?: string;
      enabled?: boolean;
      hidden?: boolean;
      temperature?: number;
      topP?: number;
      steps?: number;
    },
    defaults?: PermissionRuleset,
    userPermissions?: Record<string, any>
  ): AgentConfig {
    const defaultRuleset = defaults ?? createDefault();
    const userRuleset = userPermissions ? fromPermissionConfig(userPermissions) : createDefault();
    const configRuleset = config.permission ? fromPermissionConfig(config.permission) : createDefault();

    const permission = merge(defaultRuleset, configRuleset, userRuleset);

    return {
      type: type as AgentType,
      name: config.name,
      description: config.description,
      mode: config.mode ?? 'primary',
      permission,
      prompt: config.prompt,
      modelId: config.modelId,
      enabled: config.enabled ?? true,
      ...(config.hidden !== undefined && { hidden: config.hidden }),
      ...(config.temperature !== undefined && { temperature: config.temperature }),
      ...(config.topP !== undefined && { topP: config.topP }),
      ...(config.steps !== undefined && { steps: config.steps }),
    } as AgentConfig;
  }

  /**
   * 创建默认的build Agent配置
   * @param userPermissions 用户权限配置
   * @returns build Agent配置
   */
  export function createBuildAgent(userPermissions?: Record<string, any>): AgentConfig {
    const defaults = fromPermissionConfig({
      '*': 'allow',
      doom_loop: 'ask',
      question: 'allow',
      plan_enter: 'allow',
    });

    return Agent.fromConfig('build', {
      name: 'build',
      description: '默认Agent，执行工具调用',
      mode: 'primary',
      enabled: true,
      // 不设置 prompt，使用 SystemPrompt.provider 根据模型自动选择
    }, defaults, userPermissions);
  }

  /**
   * 创建plan Agent配置
   * @param userPermissions 用户权限配置
   * @returns plan Agent配置
   */
  export function createPlanAgent(userPermissions?: Record<string, any>): AgentConfig {
    const defaults = fromPermissionConfig({
      '*': 'allow',
      doom_loop: 'ask',
      question: 'allow',
      plan_exit: 'allow',
      edit: 'deny',
      write: 'deny',
      patch: 'deny',
      multiedit: 'deny',
    });

    return Agent.fromConfig('plan', {
      name: 'plan',
      description: '计划模式Agent，禁止编辑工具',
      mode: 'primary',
      enabled: true,
    }, defaults, userPermissions);
  }

  /**
   * 创建general Agent配置
   * @param userPermissions 用户权限配置
   * @returns general Agent配置
   */
  export function createGeneralAgent(userPermissions?: Record<string, any>): AgentConfig {
    const defaults = fromPermissionConfig({
      '*': 'allow',
      doom_loop: 'ask',
      todoread: 'deny',
      todowrite: 'deny',
    });

    return Agent.fromConfig('general', {
      name: 'general',
      description: '通用Agent，用于复杂任务',
      mode: 'subagent',
      enabled: true,
    }, defaults, userPermissions);
  }

  /**
   * 创建explore Agent配置
   * @param userPermissions 用户权限配置
   * @returns explore Agent配置
   */
  export function createExploreAgent(userPermissions?: Record<string, any>): AgentConfig {
    const defaults = fromPermissionConfig({
      '*': 'deny',
      grep: 'allow',
      glob: 'allow',
      codesearch: 'allow',
      read: 'allow',
      bash: 'allow',
      webfetch: 'allow',
      websearch: 'allow',
    });

    return Agent.fromConfig('explore', {
      name: 'explore',
      description: '探索Agent，快速搜索代码库',
      mode: 'subagent',
      enabled: true,
    }, defaults, userPermissions);
  }
}
