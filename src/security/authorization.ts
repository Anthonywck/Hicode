/**
 * 授权控制模块
 * 负责管理用户授权确认和功能级别的数据传输控制
 * 验证需求: 7.3, 7.4
 */

import * as vscode from 'vscode';

/**
 * 功能类型枚举
 */
export enum FeatureType {
  /** 聊天功能 */
  CHAT = 'chat',
  /** 代码补全功能 */
  COMPLETION = 'completion',
  /** Agent功能 */
  AGENT = 'agent',
  /** 内联聊天功能 */
  INLINE_CHAT = 'inlineChat'
}

/**
 * 授权请求接口
 */
export interface AuthorizationRequest {
  /** 功能类型 */
  feature: FeatureType;
  /** 请求描述 */
  description: string;
  /** 将要发送的数据摘要 */
  dataSummary?: {
    /** 代码行数 */
    codeLines?: number;
    /** 文件数量 */
    fileCount?: number;
    /** 是否包含敏感信息 */
    containsSensitiveInfo?: boolean;
  };
}

/**
 * 授权结果接口
 */
export interface AuthorizationResult {
  /** 是否授权 */
  granted: boolean;
  /** 是否记住选择 */
  remember?: boolean;
  /** 拒绝原因 */
  reason?: string;
}

/**
 * 授权配置接口
 */
export interface AuthorizationConfig {
  /** 是否启用授权控制 */
  enabled: boolean;
  /** 各功能的授权状态 */
  features: {
    [key in FeatureType]: {
      /** 是否启用该功能 */
      enabled: boolean;
      /** 是否需要每次确认 */
      requireConfirmation: boolean;
      /** 是否自动授权 */
      autoAuthorize: boolean;
    };
  };
}

/**
 * 授权管理器接口
 */
export interface IAuthorizationManager {
  /**
   * 请求授权
   * @param request 授权请求
   * @returns 授权结果
   */
  requestAuthorization(request: AuthorizationRequest): Promise<AuthorizationResult>;

  /**
   * 检查功能是否启用
   * @param feature 功能类型
   * @returns 是否启用
   */
  isFeatureEnabled(feature: FeatureType): boolean;

  /**
   * 启用或禁用功能
   * @param feature 功能类型
   * @param enabled 是否启用
   */
  setFeatureEnabled(feature: FeatureType, enabled: boolean): Promise<void>;

  /**
   * 获取授权配置
   * @returns 授权配置
   */
  getConfig(): AuthorizationConfig;

  /**
   * 更新授权配置
   * @param config 部分配置更新
   */
  updateConfig(config: Partial<AuthorizationConfig>): Promise<void>;

  /**
   * 重置所有授权设置
   */
  resetAuthorizations(): Promise<void>;
}

/**
 * 授权管理器实现
 */
export class AuthorizationManager implements IAuthorizationManager {
  private static readonly CONFIG_KEY = 'hicode.authorization';
  private static readonly FEATURES_KEY = 'features';
  private static readonly ENABLED_KEY = 'enabled';

  /** 授权缓存，避免重复询问 */
  private authorizationCache: Map<FeatureType, boolean> = new Map();

  constructor(private context: vscode.ExtensionContext) {
    this.initializeDefaultConfig();
  }

  /**
   * 初始化默认配置
   */
  private initializeDefaultConfig(): void {
    const config = this.getConfig();
    
    // 如果配置为空，设置默认值
    if (!config.features) {
      const defaultConfig: AuthorizationConfig = {
        enabled: true,
        features: {
          [FeatureType.CHAT]: {
            enabled: true,
            requireConfirmation: true,
            autoAuthorize: false
          },
          [FeatureType.COMPLETION]: {
            enabled: true,
            requireConfirmation: false,
            autoAuthorize: true
          },
          [FeatureType.AGENT]: {
            enabled: true,
            requireConfirmation: true,
            autoAuthorize: false
          },
          [FeatureType.INLINE_CHAT]: {
            enabled: true,
            requireConfirmation: true,
            autoAuthorize: false
          }
        }
      };
      
      this.updateConfig(defaultConfig);
    }
  }

  /**
   * 请求授权
   */
  async requestAuthorization(request: AuthorizationRequest): Promise<AuthorizationResult> {
    const config = this.getConfig();

    // 如果授权控制未启用，直接授权
    if (!config.enabled) {
      return { granted: true };
    }

    // 检查功能是否启用
    if (!this.isFeatureEnabled(request.feature)) {
      return {
        granted: false,
        reason: `Feature ${request.feature} is disabled`
      };
    }

    const featureConfig = config.features[request.feature];

    // 如果设置了自动授权，直接授权
    if (featureConfig.autoAuthorize) {
      return { granted: true };
    }

    // 检查缓存
    if (this.authorizationCache.has(request.feature)) {
      const cached = this.authorizationCache.get(request.feature)!;
      return { granted: cached };
    }

    // 如果不需要确认，直接授权
    if (!featureConfig.requireConfirmation) {
      return { granted: true };
    }

    // 显示授权对话框
    return await this.showAuthorizationDialog(request);
  }

  /**
   * 显示授权对话框
   */
  private async showAuthorizationDialog(
    request: AuthorizationRequest
  ): Promise<AuthorizationResult> {
    // 构建消息
    let message = `HiCode wants to send data to AI model for ${this.getFeatureName(request.feature)}.\n\n`;
    message += `${request.description}\n\n`;

    if (request.dataSummary) {
      message += 'Data to be sent:\n';
      if (request.dataSummary.codeLines !== undefined) {
        message += `- Code lines: ${request.dataSummary.codeLines}\n`;
      }
      if (request.dataSummary.fileCount !== undefined) {
        message += `- Files: ${request.dataSummary.fileCount}\n`;
      }
      if (request.dataSummary.containsSensitiveInfo) {
        message += '- ⚠️ May contain sensitive information\n';
      }
    }

    message += '\nDo you want to proceed?';

    // 显示对话框
    const options = [
      'Allow Once',
      'Always Allow',
      'Deny',
      'Always Deny'
    ];

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      ...options
    );

    switch (choice) {
      case 'Allow Once':
        return { granted: true, remember: false };

      case 'Always Allow':
        // 更新配置为自动授权
        await this.setAutoAuthorize(request.feature, true);
        this.authorizationCache.set(request.feature, true);
        return { granted: true, remember: true };

      case 'Deny':
        return { granted: false, remember: false };

      case 'Always Deny':
        // 禁用该功能
        await this.setFeatureEnabled(request.feature, false);
        this.authorizationCache.set(request.feature, false);
        return { granted: false, remember: true, reason: 'User denied permanently' };

      default:
        // 用户关闭对话框，视为拒绝
        return { granted: false, reason: 'User cancelled' };
    }
  }

  /**
   * 获取功能的友好名称
   */
  private getFeatureName(feature: FeatureType): string {
    const names: Record<FeatureType, string> = {
      [FeatureType.CHAT]: 'Chat',
      [FeatureType.COMPLETION]: 'Code Completion',
      [FeatureType.AGENT]: 'Agent Operations',
      [FeatureType.INLINE_CHAT]: 'Inline Chat'
    };
    return names[feature] || feature;
  }

  /**
   * 检查功能是否启用
   */
  isFeatureEnabled(feature: FeatureType): boolean {
    const config = this.getConfig();
    return config.features?.[feature]?.enabled ?? true;
  }

  /**
   * 启用或禁用功能
   */
  async setFeatureEnabled(feature: FeatureType, enabled: boolean): Promise<void> {
    const config = this.getConfig();
    
    if (!config.features[feature]) {
      config.features[feature] = {
        enabled,
        requireConfirmation: true,
        autoAuthorize: false
      };
    } else {
      config.features[feature].enabled = enabled;
    }

    await this.updateConfig(config);

    // 清除缓存
    this.authorizationCache.delete(feature);

    // 通知用户
    const status = enabled ? 'enabled' : 'disabled';
    vscode.window.showInformationMessage(
      `${this.getFeatureName(feature)} has been ${status}`
    );
  }

  /**
   * 设置自动授权
   */
  private async setAutoAuthorize(feature: FeatureType, autoAuthorize: boolean): Promise<void> {
    const config = this.getConfig();
    
    if (config.features[feature]) {
      config.features[feature].autoAuthorize = autoAuthorize;
      await this.updateConfig(config);
    }
  }

  /**
   * 获取授权配置
   */
  getConfig(): AuthorizationConfig {
    const workspaceConfig = vscode.workspace.getConfiguration();
    const enabled = workspaceConfig.get<boolean>(`${AuthorizationManager.CONFIG_KEY}.${AuthorizationManager.ENABLED_KEY}`, true);
    const features = workspaceConfig.get<AuthorizationConfig['features']>(
      `${AuthorizationManager.CONFIG_KEY}.${AuthorizationManager.FEATURES_KEY}`,
      {} as AuthorizationConfig['features']
    );

    return { enabled, features };
  }

  /**
   * 更新授权配置
   */
  async updateConfig(config: Partial<AuthorizationConfig>): Promise<void> {
    const workspaceConfig = vscode.workspace.getConfiguration();

    if (config.enabled !== undefined) {
      await workspaceConfig.update(
        `${AuthorizationManager.CONFIG_KEY}.${AuthorizationManager.ENABLED_KEY}`,
        config.enabled,
        vscode.ConfigurationTarget.Global
      );
    }

    if (config.features !== undefined) {
      await workspaceConfig.update(
        `${AuthorizationManager.CONFIG_KEY}.${AuthorizationManager.FEATURES_KEY}`,
        config.features,
        vscode.ConfigurationTarget.Global
      );
    }

    // 清除缓存
    this.authorizationCache.clear();
  }

  /**
   * 重置所有授权设置
   */
  async resetAuthorizations(): Promise<void> {
    const workspaceConfig = vscode.workspace.getConfiguration();
    
    await workspaceConfig.update(
      AuthorizationManager.CONFIG_KEY,
      undefined,
      vscode.ConfigurationTarget.Global
    );

    this.authorizationCache.clear();
    this.initializeDefaultConfig();

    vscode.window.showInformationMessage('Authorization settings have been reset');
  }

  /**
   * 清除授权缓存
   */
  clearCache(): void {
    this.authorizationCache.clear();
  }

  /**
   * 获取功能的授权状态（用于UI显示）
   */
  getFeatureStatus(feature: FeatureType): {
    enabled: boolean;
    requireConfirmation: boolean;
    autoAuthorize: boolean;
  } {
    const config = this.getConfig();
    return config.features[feature] || {
      enabled: true,
      requireConfirmation: true,
      autoAuthorize: false
    };
  }
}
