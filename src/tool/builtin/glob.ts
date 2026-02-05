/**
 * Glob tool - 文件匹配工具
 * 
 * 功能：
 * - 使用glob模式查找匹配的文件
 * - 支持标准glob语法（如星号.ts, 双星号/星号.test.ts）
 * - 按文件修改时间排序结果
 * - 支持结果截断（最多100个文件）
 * - 支持中止信号（AbortSignal）
 */

import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Tool } from '../tool';
import { glob as globFn } from 'glob';

/**
 * 获取工作区目录路径
 */
function getWorkspaceDirectory(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  return workspaceFolder?.uri.fsPath || '';
}

/**
 * Glob 工具定义
 * 
 * 参数：
 * - pattern: glob模式（如星号.ts, 双星号/星号.test.ts）
 * - path: 搜索目录（可选，默认工作区目录）
 * 
 * Glob模式说明：
 * - 星号: 匹配任意字符（不包括路径分隔符）
 * - 双星号: 匹配任意字符（包括路径分隔符，用于递归搜索）
 * - 问号: 匹配单个字符
 * - 方括号: 匹配字符集合中的任意一个
 * - 花括号: 匹配多个模式之一
 * 
 * 示例：
 * - 星号.ts: 当前目录下所有.ts文件
 * - 双星号/星号.test.ts: 所有子目录中的.test.ts文件
 * - src/双星号/星号.花括号ts,tsx: src目录下所有.ts和.tsx文件
 */
export const GlobTool = Tool.define('glob', {
  description: `Find files matching a glob pattern. Use this tool to search for files by name pattern (e.g., "*.ts", "**/*.test.ts").`,
  parameters: z.object({
    pattern: z.string().describe('The glob pattern to match files against'),
    path: z
      .string()
      .optional()
      .describe(
        `The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.`
      ),
  }),
  async execute(params, ctx) {
    // 请求搜索权限
    await ctx.ask({
      permission: 'glob',
      patterns: [params.pattern],
      always: ['*'],
      metadata: {
        pattern: params.pattern,
        path: params.path,
      },
    });

    // 解析搜索路径
    const workspaceDir = getWorkspaceDirectory();
    let search = params.path ?? workspaceDir;
    search = path.isAbsolute(search) ? path.resolve(search) : path.resolve(workspaceDir, search);

    // 检查搜索路径是否存在
    if (!fs.existsSync(search)) {
      throw new Error(`Search path does not exist: ${search}`);
    }

    // 结果限制和状态
    const limit = 100;
    const files: Array<{ path: string; mtime: number }> = [];
    let truncated = false;

    try {
      // 执行glob搜索
      const matches = await globFn(params.pattern, {
        cwd: search, // 工作目录
        absolute: true, // 返回绝对路径
        signal: ctx.abort, // 支持中止
      });

      // 处理匹配结果
      for (const file of matches) {
        // 如果达到限制，标记截断并停止
        if (files.length >= limit) {
          truncated = true;
          break;
        }
        // 解析完整路径并检查文件是否存在
        const full = path.resolve(search, file);
        if (fs.existsSync(full)) {
          const stats = fs.statSync(full);
          files.push({
            path: full,
            mtime: stats.mtime.getTime(), // 文件修改时间（用于排序）
          });
        }
      }
    } catch (error) {
      // 如果是中止错误，直接抛出
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      // 其他错误包装后抛出
      throw new Error(`Glob search failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 按修改时间倒序排序（最近修改的文件在前）
    files.sort((a, b) => b.mtime - a.mtime);

    // 格式化输出
    const output: string[] = [];
    if (files.length === 0) output.push('No files found');
    if (files.length > 0) {
      // 输出所有文件路径
      output.push(...files.map((f) => f.path));
      // 如果结果被截断，添加提示
      if (truncated) {
        output.push('');
        output.push('(Results are truncated. Consider using a more specific path or pattern.)');
      }
    }

    // 生成标题（相对于工作区的路径）
    const title = workspaceDir ? path.relative(workspaceDir, search) : path.basename(search);

    return {
      title,
      metadata: {
        count: files.length,
        truncated,
      },
      output: output.join('\n'),
    };
  },
});
