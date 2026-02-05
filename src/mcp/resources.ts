/**
 * MCP 资源处理
 * 处理 MCP 资源的读取和管理
 */

import { getMcpClientManager } from './client';
import { createLogger } from '../utils/logger';

const log = createLogger('mcp.resources');

/**
 * 获取所有 MCP 资源
 */
export async function getMcpResources(): Promise<
  Record<
    string,
    {
      name: string;
      uri: string;
      description?: string;
      mimeType?: string;
      client: string;
    }
  >
> {
  const manager = getMcpClientManager();
  const clients = manager.getAll();
  const resources: Record<string, any> = {};

  for (const [clientName, client] of Object.entries(clients)) {
    try {
      const resourcesResult = await client.listResources();
      
      for (const resource of resourcesResult.resources) {
        const sanitizedClientName = clientName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const sanitizedResourceName = resource.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const resourceKey = `${sanitizedClientName}:${sanitizedResourceName}`;

        resources[resourceKey] = {
          ...resource,
          client: clientName,
        };
      }
    } catch (error) {
      log.error('获取 MCP 资源失败', { clientName, error });
    }
  }

  return resources;
}

/**
 * 读取 MCP 资源
 */
export async function readMcpResource(clientName: string, uri: string): Promise<any> {
  const manager = getMcpClientManager();
  const client = manager.get(clientName);
  
  if (!client) {
    throw new Error(`MCP 客户端 ${clientName} 不存在`);
  }

  try {
    const result = await client.readResource(uri);
    return result;
  } catch (error) {
    log.error('读取 MCP 资源失败', { clientName, uri, error });
    throw error;
  }
}
