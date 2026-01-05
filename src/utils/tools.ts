/**
 * 通用工具函数
 * 提供各种常用的工具方法
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * 生成唯一标识符（UUID v4）
 * 使用标准的 UUID v4 算法生成符合 RFC 4122 标准的唯一标识符
 * 
 * @returns UUID v4 格式的唯一标识符字符串
 * @example
 * generateUUID() // 返回类似 "550e8400-e29b-41d4-a716-446655440000" 的字符串
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * 生成唯一 token
 * 与 generateUUID 功能相同，提供别名以保持代码一致性
 * 
 * @returns 唯一 token 字符串
 */
export function generateToken(): string {
  return generateUUID();
}

