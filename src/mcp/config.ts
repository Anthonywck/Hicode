/**
 * MCP 配置管理
 * 从配置文件读取和管理 MCP 服务器配置
 */

import { z } from 'zod';
import { McpConfig } from './client';
import { ConfigManager } from '../config/manager';
import { getExtensionContext } from '../extension';
import { createLogger } from '../utils/logger';

const log = createLogger('mcp.config');

/**
 * MCP 配置模式
 */
export const McpConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('local'),
    enabled: z.boolean().optional(),
    timeout: z.number().optional(),
    command: z.array(z.string()),
    environment: z.record(z.string()).optional(),
  }),
  z.object({
    type: z.literal('remote'),
    enabled: z.boolean().optional(),
    timeout: z.number().optional(),
    url: z.string(),
    headers: z.record(z.string()).optional(),
    oauth: z
      .union([
        z.boolean(),
        z.object({
          clientId: z.string().optional(),
          clientSecret: z.string().optional(),
          scope: z.string().optional(),
        }),
      ])
      .optional(),
  }),
]);

export type McpConfigType = z.infer<typeof McpConfigSchema>;

/**
 * 获取 MCP 配置
 */
export async function getMcpConfig(): Promise<Record<string, McpConfig>> {
  try {
    const context = getExtensionContext();
    const configManager = await (await import('../extension')).getConfigManager();
    
    // 从配置中读取 MCP 设置
    // 配置格式：hicode.mcp: { [name: string]: McpConfig }
    const mcpConfig = (configManager.get as (key: string, defaultValue: any) => any)('mcp', {}) as Record<string, any>;
    
    // 验证配置
    const result: Record<string, McpConfig> = {};
    for (const [name, config] of Object.entries(mcpConfig)) {
      try {
        const validated = McpConfigSchema.parse(config);
        result[name] = validated as McpConfig;
      } catch (error) {
        log.warn('MCP 配置验证失败', { name, error });
      }
    }
    
    return result;
  } catch (error) {
    log.error('获取 MCP 配置失败', { error });
    return {};
  }
}

/**
 * 保存 MCP 配置
 */
export async function saveMcpConfig(config: Record<string, McpConfig>): Promise<void> {
  try {
    const configManager = await (await import('../extension')).getConfigManager();
    await configManager.set('mcp', config);
    log.info('MCP 配置已保存');
  } catch (error) {
    log.error('保存 MCP 配置失败', { error });
    throw error;
  }
}
