/**
 * 工具输出截断模块
 * 当工具输出过长时，自动截断并保存完整内容到文件
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { AgentConfig } from '../agent/types';
import { evaluate } from '../permission/evaluator';

/**
 * 最大行数
 */
export const MAX_LINES = 2000;

/**
 * 最大字节数
 */
export const MAX_BYTES = 50 * 1024;

/**
 * 输出目录
 */
const OUTPUT_DIR = path.join(os.tmpdir(), 'hicode-tool-output');

/**
 * 保留时间（7天）
 */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 截断选项
 */
export interface TruncationOptions {
  maxLines?: number;
  maxBytes?: number;
  direction?: 'head' | 'tail';
}

/**
 * 截断结果
 */
export type TruncationResult =
  | { content: string; truncated: false }
  | { content: string; truncated: true; outputPath: string };

/**
 * 检查Agent是否有task工具权限
 */
function hasTaskTool(agent?: AgentConfig): boolean {
  if (!agent?.permission) return false;
  const rule = evaluate('task', '*', agent.permission);
  return rule.action !== 'deny';
}

/**
 * 初始化输出目录
 */
async function ensureOutputDir(): Promise<void> {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    // Ignore errors
  }
}

/**
 * 清理旧文件
 */
export async function cleanupOldFiles(): Promise<void> {
  try {
    await ensureOutputDir();
    const files = await fs.readdir(OUTPUT_DIR);
    const cutoff = Date.now() - RETENTION_MS;
    
    for (const file of files) {
      const filePath = path.join(OUTPUT_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < cutoff) {
          await fs.unlink(filePath);
        }
      } catch (error) {
        // Ignore errors
      }
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * 生成输出文件名
 */
function generateOutputFilename(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `tool_${timestamp}_${random}.txt`;
}

/**
 * 截断工具输出
 * @param text 输出文本
 * @param options 截断选项
 * @param agent Agent配置（可选）
 * @returns 截断结果
 */
export async function truncateOutput(
  text: string,
  options: TruncationOptions = {},
  agent?: AgentConfig
): Promise<TruncationResult> {
  const maxLines = options.maxLines ?? MAX_LINES;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const direction = options.direction ?? 'head';
  const lines = text.split('\n');
  const totalBytes = Buffer.byteLength(text, 'utf-8');

  // 如果不需要截断，直接返回
  if (lines.length <= maxLines && totalBytes <= maxBytes) {
    return { content: text, truncated: false };
  }

  const out: string[] = [];
  let i = 0;
  let bytes = 0;
  let hitBytes = false;

  if (direction === 'head') {
    for (i = 0; i < lines.length && i < maxLines; i++) {
      const size = Buffer.byteLength(lines[i], 'utf-8') + (i > 0 ? 1 : 0);
      if (bytes + size > maxBytes) {
        hitBytes = true;
        break;
      }
      out.push(lines[i]);
      bytes += size;
    }
  } else {
    for (i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
      const size = Buffer.byteLength(lines[i], 'utf-8') + (out.length > 0 ? 1 : 0);
      if (bytes + size > maxBytes) {
        hitBytes = true;
        break;
      }
      out.unshift(lines[i]);
      bytes += size;
    }
  }

  const removed = hitBytes ? totalBytes - bytes : lines.length - out.length;
  const unit = hitBytes ? 'bytes' : 'lines';
  const preview = out.join('\n');

  // 保存完整内容到文件
  await ensureOutputDir();
  const filename = generateOutputFilename();
  const filepath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(filepath, text, 'utf-8');

  const hasTask = hasTaskTool(agent);
  const hint = hasTask
    ? `The tool call succeeded but the output was truncated. Full output saved to: ${filepath}\nUse the Task tool to have explore agent process this file with Grep and Read (with offset/limit). Do NOT read the full file yourself - delegate to save context.`
    : `The tool call succeeded but the output was truncated. Full output saved to: ${filepath}\nUse Grep to search the full content or Read with offset/limit to view specific sections.`;
  
  const message =
    direction === 'head'
      ? `${preview}\n\n...${removed} ${unit} truncated...\n\n${hint}`
      : `...${removed} ${unit} truncated...\n\n${hint}\n\n${preview}`;

  return { content: message, truncated: true, outputPath: filepath };
}
