/**
 * Grep tool - 代码搜索工具
 * 
 * 功能：
 * - 使用ripgrep（rg）在文件中搜索正则表达式模式
 * - 支持指定搜索目录和文件类型过滤
 * - 按文件修改时间排序结果
 * - 支持结果截断（最多100个匹配）
 * - 显示匹配的文件路径、行号和内容
 */

import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Tool } from '../tool';
import { spawn } from 'child_process';

/**
 * 获取工作区目录路径
 */
function getWorkspaceDirectory(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  return workspaceFolder?.uri.fsPath || '';
}

// 单行最大长度限制
const MAX_LINE_LENGTH = 2000;

/**
 * 查找ripgrep可执行文件路径
 * 
 * 尝试查找 'rg' 或 'ripgrep' 命令
 * 
 * @returns ripgrep路径，如果未找到返回null
 */
function findRipgrep(): string | null {
  const possiblePaths = ['rg', 'ripgrep'];
  for (const cmd of possiblePaths) {
    try {
      const result = require('child_process').execSync(`which ${cmd}`, { encoding: 'utf8' });
      if (result.trim()) return result.trim();
    } catch {
      // 继续查找
    }
  }
  return null;
}

/**
 * 执行ripgrep搜索
 * 
 * @param pattern 正则表达式模式
 * @param searchPath 搜索目录
 * @param include 文件类型过滤（glob模式，可选）
 * @param signal 中止信号（可选）
 * @returns 搜索结果和退出码
 * 
 * ripgrep参数说明：
 * - -nH: 显示行号和文件名
 * - --hidden: 搜索隐藏文件
 * - --follow: 跟随符号链接
 * - --no-messages: 不显示错误消息
 * - --field-match-separator=|: 使用|作为字段分隔符
 * - --regexp: 使用正则表达式模式
 * - --glob: 文件类型过滤
 */
async function executeRipgrep(
  pattern: string,
  searchPath: string,
  include?: string,
  signal?: AbortSignal
): Promise<{ output: string; exitCode: number }> {
  const rgPath = findRipgrep();
  if (!rgPath) {
    throw new Error('ripgrep (rg) not found. Please install ripgrep to use the grep tool.');
  }

  // 构建ripgrep参数
  const args = [
    '-nH', // 显示行号和文件名
    '--hidden', // 搜索隐藏文件
    '--follow', // 跟随符号链接
    '--no-messages', // 不显示错误消息
    '--field-match-separator=|', // 使用|分隔字段
    '--regexp',
    pattern,
  ];
  // 如果指定了文件类型过滤，添加--glob参数
  if (include) {
    args.push('--glob', include);
  }
  args.push(searchPath);

  // 执行ripgrep命令
  return new Promise((resolve, reject) => {
    const proc = spawn(rgPath, args, {
      cwd: searchPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    });

    let output = '';
    let errorOutput = '';

    // 收集标准输出
    proc.stdout?.on('data', (chunk) => {
      output += chunk.toString();
    });

    // 收集错误输出
    proc.stderr?.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    // 进程退出
    proc.on('close', (code) => {
      resolve({ output, exitCode: code ?? 0 });
    });

    // 进程错误
    proc.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Grep 工具定义
 * 
 * 参数：
 * - pattern: 正则表达式模式
 * - path: 搜索目录（可选，默认工作区目录）
 * - include: 文件类型过滤（glob模式，如 "*.ts", "*.{ts,tsx}"）
 * 
 * 退出码说明：
 * - 0: 找到匹配
 * - 1: 未找到匹配
 * - 2: 错误（但可能仍有部分结果）
 */
export const GrepTool = Tool.define('grep', {
  description: `Search for a regex pattern in file contents. Use this tool to find code patterns, function calls, or specific text across your codebase.`,
  parameters: z.object({
    pattern: z.string().describe('The regex pattern to search for in file contents'),
    path: z.string().optional().describe('The directory to search in. Defaults to the current working directory.'),
    include: z.string().optional().describe('File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")'),
  }),
  async execute(params, ctx) {
    // 参数验证
    if (!params.pattern) {
      throw new Error('pattern is required');
    }

    // 请求搜索权限
    await ctx.ask({
      permission: 'grep',
      patterns: [params.pattern],
      always: ['*'],
      metadata: {
        pattern: params.pattern,
        path: params.path,
        include: params.include,
      },
    });

    // 解析搜索路径
    const workspaceDir = getWorkspaceDirectory();
    let searchPath = params.path ?? workspaceDir;
    searchPath = path.isAbsolute(searchPath)
      ? searchPath
      : path.resolve(workspaceDir, searchPath);

    // 检查搜索路径是否存在
    if (!fs.existsSync(searchPath)) {
      throw new Error(`Search path does not exist: ${searchPath}`);
    }

    // 执行ripgrep搜索
    const { output, exitCode } = await executeRipgrep(
      params.pattern,
      searchPath,
      params.include,
      ctx.abort
    );

    // 处理退出码：1表示未找到，2且无输出表示错误
    if (exitCode === 1 || (exitCode === 2 && !output.trim())) {
      return {
        title: params.pattern,
        metadata: { matches: 0, truncated: false },
        output: 'No files found',
      };
    }

    // 其他非0退出码且不是2，表示严重错误
    if (exitCode !== 0 && exitCode !== 2) {
      throw new Error(`ripgrep failed with exit code ${exitCode}`);
    }

    // 解析搜索结果
    const hasErrors = exitCode === 2; // 退出码2表示有错误但可能有部分结果
    const lines = output.trim().split(/\r?\n/); // 支持Unix和Windows换行符
    const matches: Array<{ path: string; modTime: number; lineNum: number; lineText: string }> =
      [];

    // 解析每一行结果
    // ripgrep输出格式：文件路径|行号|匹配内容
    for (const line of lines) {
      if (!line) continue;

      const [filePath, lineNumStr, ...lineTextParts] = line.split('|');
      if (!filePath || !lineNumStr || lineTextParts.length === 0) continue;

      const lineNum = parseInt(lineNumStr, 10);
      const lineText = lineTextParts.join('|'); // 如果内容中包含|，需要重新拼接

      // 只处理存在的文件
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        matches.push({
          path: filePath,
          modTime: stats.mtime.getTime(), // 文件修改时间（用于排序）
          lineNum,
          lineText,
        });
      }
    }

    // 按修改时间倒序排序（最近修改的文件在前）
    matches.sort((a, b) => b.modTime - a.modTime);

    // 限制结果数量（最多100个）
    const limit = 100;
    const truncated = matches.length > limit;
    const finalMatches = truncated ? matches.slice(0, limit) : matches;

    // 如果没有匹配，返回空结果
    if (finalMatches.length === 0) {
      return {
        title: params.pattern,
        metadata: { matches: 0, truncated: false },
        output: 'No files found',
      };
    }

    // 格式化输出
    const outputLines = [`Found ${finalMatches.length} matches`];

    // 按文件分组显示结果
    let currentFile = '';
    for (const match of finalMatches) {
      // 如果切换到新文件，添加文件路径
      if (currentFile !== match.path) {
        if (currentFile !== '') {
          outputLines.push(''); // 文件之间添加空行
        }
        currentFile = match.path;
        outputLines.push(`${match.path}:`);
      }
      // 截断过长的行
      const truncatedLineText =
        match.lineText.length > MAX_LINE_LENGTH
          ? match.lineText.substring(0, MAX_LINE_LENGTH) + '...'
          : match.lineText;
      outputLines.push(`  Line ${match.lineNum}: ${truncatedLineText}`);
    }

    // 添加截断提示
    if (truncated) {
      outputLines.push('');
      outputLines.push('(Results are truncated. Consider using a more specific path or pattern.)');
    }

    // 添加错误提示
    if (hasErrors) {
      outputLines.push('');
      outputLines.push('(Some paths were inaccessible and skipped)');
    }

    return {
      title: params.pattern,
      metadata: {
        matches: finalMatches.length,
        truncated,
      },
      output: outputLines.join('\n'),
    };
  },
});
