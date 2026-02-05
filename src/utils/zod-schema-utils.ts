/**
 * Zod Schema 工具函数
 * 用于将 Zod schema 转换为纯 JSON Schema，确保不包含任何 Zod 内部结构
 * 参考 opencode 的实现，但添加了额外的清理逻辑以确保完全移除 Zod 内部结构
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * 清理 Zod 内部结构的选项
 */
export interface CleanOptions {
  /** 是否移除 $ref 引用 */
  removeRefs?: boolean;
  /** 是否移除 title */
  removeTitles?: boolean;
}

/**
 * 将 Zod schema 转换为纯 JSON Schema
 * 确保移除所有 Zod 内部结构（_def, ~standard, _cached 等）
 * 
 * @param schema Zod schema 对象
 * @param options 清理选项
 * @returns 纯 JSON Schema 对象
 */
export function zodToJsonSchemaClean(
  schema: z.ZodTypeAny,
  options: CleanOptions = {}
): any {
  let jsonSchema: any;
  
  // 参考 opencode：优先使用 z.toJSONSchema()（zod 3.23+）
  if (typeof (z as any).toJSONSchema === 'function') {
    jsonSchema = (z as any).toJSONSchema(schema);
  } else {
    // 回退到 zod-to-json-schema 包
    jsonSchema = zodToJsonSchema(schema as any);
  }
  
  // 深度清理：移除所有 Zod 内部结构
  const cleaned = cleanZodInternalStructures(jsonSchema);
  
  // 应用选项
  if (options.removeRefs) {
    removeRefs(cleaned);
  }
  if (options.removeTitles) {
    removeTitles(cleaned);
  }
  
  // 最后通过 JSON 序列化/反序列化确保是纯 JSON
  return JSON.parse(JSON.stringify(cleaned));
}

/**
 * 递归清理对象中的 Zod 内部结构
 * 移除所有以 _ 或 ~ 开头的属性
 */
function cleanZodInternalStructures(obj: any, depth = 0): any {
  if (depth > 20) return obj; // 防止无限递归
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanZodInternalStructures(item, depth + 1));
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // 跳过 Zod 内部属性
      if (key === '_def' || key === '~standard' || key === '_cached' || 
          key.startsWith('_') || key.startsWith('~')) {
        continue;
      }
      try {
        const cleanedValue = cleanZodInternalStructures(value, depth + 1);
        // 验证可序列化
        JSON.stringify(cleanedValue);
        cleaned[key] = cleanedValue;
      } catch {
        // 如果无法序列化，跳过这个属性
        continue;
      }
    }
    return cleaned;
  }
  return obj;
}

/**
 * 移除 JSON Schema 中的 $ref 引用
 */
function removeRefs(schema: any): void {
  if (typeof schema !== 'object' || schema === null) return;
  
  if (Array.isArray(schema)) {
    schema.forEach(removeRefs);
    return;
  }
  
  // 移除 $ref 属性
  if ('$ref' in schema) {
    delete schema.$ref;
  }
  
  // 递归处理所有属性
  for (const value of Object.values(schema)) {
    removeRefs(value);
  }
}

/**
 * 移除 JSON Schema 中的 title 属性
 */
function removeTitles(schema: any): void {
  if (typeof schema !== 'object' || schema === null) return;
  
  if (Array.isArray(schema)) {
    schema.forEach(removeTitles);
    return;
  }
  
  // 移除 title 属性
  if ('title' in schema) {
    delete schema.title;
  }
  
  // 递归处理所有属性
  for (const value of Object.values(schema)) {
    removeTitles(value);
  }
}

/**
 * 验证 JSON Schema 是否符合 Function Calling 的要求
 * Function Calling 要求 schema 必须是 object 类型，且有 properties
 */
export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateFunctionSchema(schema: any): SchemaValidationResult {
  const errors: string[] = [];
  
  if (!schema || typeof schema !== 'object') {
    errors.push('Schema must be an object');
    return { valid: false, errors };
  }
  
  // 检查 type
  if (schema.type !== 'object') {
    errors.push(`Schema type must be 'object', got '${schema.type}'`);
  }
  
  // 检查 properties
  if (!schema.properties || typeof schema.properties !== 'object') {
    errors.push('Schema must have a properties object');
  }
  
  // 检查 required 数组（如果存在）
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required)) {
      errors.push('Schema required must be an array');
    } else if (schema.properties) {
      // 检查 required 中的字段是否都在 properties 中
      const properties = schema.properties;
      for (const reqField of schema.required) {
        if (!(reqField in properties)) {
          errors.push(`Required field '${reqField}' not found in properties`);
        }
      }
    }
  }
  
  // 检查 properties 中的每个字段
  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      if (!value || typeof value !== 'object') {
        errors.push(`Property '${key}' must be an object`);
      } else {
        const prop = value as any;
        if (!prop.type) {
          errors.push(`Property '${key}' missing 'type' field`);
        }
        // 检查是否包含不可序列化的内容
        try {
          JSON.stringify(prop);
        } catch (e) {
          errors.push(`Property '${key}' contains non-serializable content: ${e}`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
