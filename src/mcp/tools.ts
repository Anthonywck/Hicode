/**
 * MCP 工具转换
 * 将 MCP 工具转换为 AI SDK Tool 格式
 */

import { tool, jsonSchema, type Tool } from 'ai';
import { z } from 'zod';
import { getMcpClientManager } from './client';
import { createLogger } from '../utils/logger';

const log = createLogger('mcp.tools');

/**
 * 获取所有 MCP 工具
 */
export async function getMcpTools(): Promise<Record<string, Tool>> {
  const manager = getMcpClientManager();
  const clients = manager.getAll();
  const tools: Record<string, Tool> = {};

  for (const [clientName, client] of Object.entries(clients)) {
    try {
      const toolsResult = await client.listTools();
      
      for (const mcpTool of toolsResult.tools) {
        const sanitizedClientName = clientName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const sanitizedToolName = mcpTool.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const toolKey = `${sanitizedClientName}_${sanitizedToolName}`;

        // 转换输入模式
        const inputSchema = mcpTool.inputSchema || {};
        const schema: z.ZodType = z.object(
          Object.fromEntries(
            Object.entries(inputSchema.properties || {}).map(([key, value]: [string, any]) => {
              const zodType = convertJsonSchemaToZod(value);
              return [key, zodType];
            })
          )
        );

        tools[toolKey] = tool({
          id: toolKey as any,
          description: mcpTool.description || '',
          inputSchema: jsonSchema(inputSchema as any),
          async execute(args) {
            const result = await client.callTool(mcpTool.name, args);
            return {
              title: '',
              output: typeof result === 'string' ? result : JSON.stringify(result),
              metadata: {},
            };
          },
        });
      }
    } catch (error) {
      log.error('获取 MCP 工具失败', { clientName, error });
    }
  }

  return tools;
}

/**
 * 将 JSON Schema 转换为 Zod 类型（简化版）
 */
function convertJsonSchemaToZod(schema: any): z.ZodType {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  switch (schema.type) {
    case 'string':
      return z.string();
    case 'number':
    case 'integer':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(convertJsonSchemaToZod(schema.items || {}));
    case 'object':
      if (schema.properties) {
        return z.object(
          Object.fromEntries(
            Object.entries(schema.properties).map(([key, value]: [string, any]) => [
              key,
              convertJsonSchemaToZod(value),
            ])
          )
        );
      }
      return z.record(z.any());
    default:
      return z.any();
  }
}
