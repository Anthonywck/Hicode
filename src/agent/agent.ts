/**
 * Agent管理核心
 * 提供Agent的获取、列表、默认选择等功能
 */

import { AgentRegistry, getAgentRegistry } from './registry';
import { AgentConfig, AgentType, AgentMode, ModelConfig } from './types';
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
   * @param options.defaultAgentName 默认Agent名称（用于排序）
   * @returns Agent配置列表
   */
  export function list(options?: {
    mode?: AgentMode;
    enabled?: boolean;
    hidden?: boolean;
    defaultAgentName?: string;
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
      agents = agents.filter(agent => !agent.hidden);
    }

    // 排序：默认Agent优先
    if (options?.defaultAgentName) {
      agents.sort((a, b) => {
        const aIsDefault = a.name === options.defaultAgentName;
        const bIsDefault = b.name === options.defaultAgentName;
        if (aIsDefault && !bIsDefault) return -1;
        if (!aIsDefault && bIsDefault) return 1;
        return 0;
      });
    } else {
      // 默认情况下，build agent 优先
      agents.sort((a, b) => {
        const aIsBuild = a.name === 'build';
        const bIsBuild = b.name === 'build';
        if (aIsBuild && !bIsBuild) return -1;
        if (!aIsBuild && bIsBuild) return 1;
        return 0;
      });
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
    config: {
      name: string;
      description?: string;
      mode?: AgentMode;
      permission?: Record<string, any>;
      prompt?: string;
      model?: ModelConfig;
      modelId?: string;
      enabled?: boolean;
      hidden?: boolean;
      temperature?: number;
      topP?: number;
      steps?: number;
      color?: string;
      native?: boolean;
      options?: Record<string, any>;
    },
    defaults?: PermissionRuleset,
    userPermissions?: Record<string, any>
  ): AgentConfig {
    const defaultRuleset = defaults ?? createDefault();
    const userRuleset = userPermissions ? fromPermissionConfig(userPermissions) : createDefault();
    const configRuleset = config.permission ? fromPermissionConfig(config.permission) : createDefault();

    const permission = merge(defaultRuleset, configRuleset, userRuleset);

    const result: AgentConfig = {
      type: type as AgentType,
      name: config.name,
      description: config.description,
      mode: config.mode ?? 'primary',
      permission,
      enabled: config.enabled ?? true,
      options: config.options ?? {},
    };

    if (config.prompt !== undefined) {
      result.prompt = config.prompt;
    }
    if (config.model !== undefined) {
      result.model = config.model;
    } else if (config.modelId !== undefined) {
      result.modelId = config.modelId;
    }
    if (config.hidden !== undefined) {
      result.hidden = config.hidden;
    }
    if (config.temperature !== undefined) {
      result.temperature = config.temperature;
    }
    if (config.topP !== undefined) {
      result.topP = config.topP;
    }
    if (config.steps !== undefined) {
      result.steps = config.steps;
    }
    if (config.color !== undefined) {
      result.color = config.color;
    }
    if (config.native !== undefined) {
      result.native = config.native;
    }

    return result;
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
      native: true,
      options: {},
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
      native: true,
      options: {},
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
      native: true,
      options: {},
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
      native: true,
      options: {},
    }, defaults, userPermissions);
  }

  /**
   * 从配置对象加载Agent配置
   * 用于从配置文件（如 opencode.json）加载自定义Agent
   * @param agentConfigs 配置对象，格式如 { agentName: { name, description, mode, permission, ... } }
   * @param defaultPermissions 默认权限规则集
   * @param userPermissions 用户权限配置
   * @param defaultAgentName 默认Agent名称（可选）
   * @returns 加载的Agent配置列表
   */
  export function loadFromConfig(
    agentConfigs: Record<string, {
      disable?: boolean;
      name?: string;
      description?: string;
      mode?: AgentMode;
      permission?: Record<string, any>;
      prompt?: string;
      model?: string | ModelConfig;
      temperature?: number;
      top_p?: number;
      topP?: number;
      steps?: number;
      color?: string;
      hidden?: boolean;
      options?: Record<string, any>;
    }>,
    defaultPermissions?: PermissionRuleset,
    userPermissions?: Record<string, any>,
    defaultAgentName?: string
  ): void {
    const registry = getAgentRegistry(defaultAgentName);
    const defaults = defaultPermissions ?? fromPermissionConfig({
      '*': 'allow',
      doom_loop: 'ask',
    });

    for (const [key, value] of Object.entries(agentConfigs)) {
      if (value.disable) {
        // 如果配置了 disable，则移除该Agent
        const existing = registry.get(key);
        if (existing) {
          // 注意：registry 没有 remove 方法，这里可以通过注册一个 disabled 的配置来实现
          // 或者在实际使用时过滤掉 disabled 的 agent
          continue;
        }
        continue;
      }

      // 解析模型配置
      let model: ModelConfig | undefined;
      if (value.model) {
        if (typeof value.model === 'string') {
          // 如果是字符串，尝试解析 "providerID:modelID" 格式
          const parts = value.model.split(':');
          if (parts.length === 2) {
            model = { providerID: parts[0], modelID: parts[1] };
          }
        } else {
          model = value.model;
        }
      }

      // 获取或创建Agent配置
      const existing = registry.get(key);
      const baseConfig = existing ? {
        name: existing.name,
        description: existing.description,
        mode: existing.mode,
        permission: existing.permission,
        prompt: existing.prompt,
        model: existing.model,
        modelId: existing.modelId,
        temperature: existing.temperature,
        topP: existing.topP,
        steps: existing.steps,
        color: existing.color,
        hidden: existing.hidden,
        options: existing.options ?? {},
      } : {
        name: key,
        mode: 'all' as AgentMode,
        permission: merge(defaults, userPermissions ? fromPermissionConfig(userPermissions) : createDefault()),
        options: {},
      };

      // 合并配置
      const config = Agent.fromConfig(
        key,
        {
          name: value.name ?? baseConfig.name,
          description: value.description ?? baseConfig.description,
          mode: value.mode ?? baseConfig.mode,
          permission: value.permission,
          prompt: value.prompt ?? baseConfig.prompt,
          model: model ?? baseConfig.model,
          modelId: baseConfig.modelId,
          temperature: value.temperature ?? baseConfig.temperature,
          topP: value.top_p ?? value.topP ?? baseConfig.topP,
          steps: value.steps ?? baseConfig.steps,
          color: value.color ?? baseConfig.color,
          hidden: value.hidden ?? baseConfig.hidden,
          options: { ...baseConfig.options, ...(value.options ?? {}) },
          native: existing?.native ?? false,
        },
        defaults,
        userPermissions
      );

      registry.register(config);
    }
  }
}
