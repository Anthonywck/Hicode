/**
 * Agent注册表
 * 管理多种Agent类型和配置
 */

import { AgentConfig, AgentType } from './types';
import { PermissionRuleset, fromConfig, createDefault, merge } from '../permission';

/**
 * Agent注册表接口
 */
export interface IAgentRegistry {
  /**
   * 注册Agent配置
   */
  register(config: AgentConfig): void;

  /**
   * 获取Agent配置
   */
  get(type: AgentType): AgentConfig | null;

  /**
   * 获取所有Agent配置
   */
  getAll(): AgentConfig[];

  /**
   * 获取默认Agent配置
   * @param defaultAgentName 配置的默认Agent名称（可选）
   */
  getDefault(defaultAgentName?: string): AgentConfig;

  /**
   * 检查Agent是否存在
   */
  has(type: AgentType): boolean;
}

/**
 * Agent注册表实现
 */
export class AgentRegistry implements IAgentRegistry {
  private agents: Map<AgentType, AgentConfig> = new Map();
  private defaultAgentName?: string;

  constructor(defaultAgentName?: string) {
    this.defaultAgentName = defaultAgentName;
    this.initializeDefaults();
  }

  /**
   * 设置默认Agent名称
   */
  setDefaultAgentName(name?: string): void {
    this.defaultAgentName = name;
  }

  /**
   * 注册Agent配置
   */
  register(config: AgentConfig): void {
    this.agents.set(config.type, config);
  }

  /**
   * 获取Agent配置
   */
  get(type: AgentType): AgentConfig | null {
    return this.agents.get(type) || null;
  }

  /**
   * 获取所有Agent配置
   */
  getAll(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * 获取默认Agent配置
   * @param defaultAgentName 配置的默认Agent名称（可选，优先使用实例的默认名称）
   */
  getDefault(defaultAgentName?: string): AgentConfig {
    const name = defaultAgentName ?? this.defaultAgentName;
    if (name) {
      const agent = this.get(name as AgentType);
      if (agent) {
        if (agent.mode === 'subagent') {
          throw new Error(`default agent "${name}" is a subagent`);
        }
        if (agent.hidden === true) {
          throw new Error(`default agent "${name}" is hidden`);
        }
        return agent;
      }
    }

    const allAgents = this.getAll();
    const primaryVisible = allAgents.find(
      agent => agent.mode === 'primary' && (agent.enabled ?? true) && !agent.hidden
    );
    if (primaryVisible) {
      return primaryVisible;
    }

    const enabled = allAgents.find(agent => agent.enabled !== false);
    if (enabled) {
      return enabled;
    }

    const buildAgent = this.get('build');
    if (buildAgent) {
      return buildAgent;
    }

    if (allAgents.length > 0) {
      return allAgents[0];
    }

    return this.createDefaultBuildAgent();
  }

  /**
   * 检查Agent是否存在
   */
  has(type: AgentType): boolean {
    return this.agents.has(type);
  }

  /**
   * 初始化默认Agent配置
   */
  private initializeDefaults(): void {
    const defaults = fromConfig({
      '*': 'allow',
      doom_loop: 'ask',
    });

    this.register({
      type: 'build',
      name: 'build',
      description: '默认Agent，执行工具调用',
      mode: 'primary',
      enabled: true,
      native: true,
      permission: merge(
        defaults,
        fromConfig({
          question: 'allow',
          plan_enter: 'allow',
        })
      ),
      options: {},
    });

    this.register({
      type: 'plan',
      name: 'plan',
      description: '计划模式Agent，禁止编辑工具',
      mode: 'primary',
      enabled: true,
      native: true,
      permission: merge(
        defaults,
        fromConfig({
          question: 'allow',
          plan_exit: 'allow',
          edit: 'deny',
          write: 'deny',
          patch: 'deny',
          multiedit: 'deny',
        })
      ),
      options: {},
    });

    this.register({
      type: 'general',
      name: 'general',
      description: '通用Agent，用于复杂任务',
      mode: 'subagent',
      enabled: true,
      native: true,
      permission: merge(
        defaults,
        fromConfig({
          todoread: 'deny',
          todowrite: 'deny',
        })
      ),
      options: {},
    });

    this.register({
      type: 'explore',
      name: 'explore',
      description: '探索Agent，快速搜索代码库',
      mode: 'subagent',
      enabled: true,
      native: true,
      permission: merge(
        defaults,
        fromConfig({
          '*': 'deny',
          grep: 'allow',
          glob: 'allow',
          codesearch: 'allow',
          read: 'allow',
          bash: 'allow',
          webfetch: 'allow',
          websearch: 'allow',
        })
      ),
      options: {},
    });
  }

  /**
   * 创建默认的build Agent
   */
  private createDefaultBuildAgent(): AgentConfig {
    const defaults = fromConfig({
      '*': 'allow',
      doom_loop: 'ask',
    });

    return {
      type: 'build',
      name: 'build',
      description: '默认Agent',
      mode: 'primary',
      enabled: true,
      native: true,
      permission: merge(
        defaults,
        fromConfig({
          question: 'allow',
          plan_enter: 'allow',
        })
      ),
      options: {},
    };
  }
}

/**
 * 全局Agent注册表实例
 */
let globalRegistry: AgentRegistry | null = null;

/**
 * 获取全局Agent注册表
 * @param defaultAgentName 默认Agent名称（可选）
 */
export function getAgentRegistry(defaultAgentName?: string): AgentRegistry {
  if (!globalRegistry) {
    globalRegistry = new AgentRegistry(defaultAgentName);
  } else if (defaultAgentName !== undefined) {
    globalRegistry.setDefaultAgentName(defaultAgentName);
  }
  return globalRegistry;
}

/**
 * 重置全局Agent注册表（主要用于测试）
 */
export function resetAgentRegistry(): void {
  globalRegistry = null;
}
