/**
 * Write tool - 写入文件内容工具
 * 
 * 功能：
 * - 将内容写入文件（完全替换文件内容）
 * - 生成文件差异（diff）用于权限请求
 * - 支持创建新文件或覆盖现有文件
 * - 自动处理路径解析（相对路径转绝对路径）
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Tool } from '../tool';
import { createTwoFilesPatch } from 'diff';

/**
 * 获取工作区目录路径
 */
function getWorkspaceDirectory(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  return workspaceFolder?.uri.fsPath || '';
}

/**
 * 修剪diff输出，移除公共的前导空格
 * 
 * 这个函数用于优化diff显示，移除所有变更行中共同的前导空格，
 * 使diff更加紧凑易读。
 * 
 * @param diff 原始diff字符串
 * @returns 修剪后的diff字符串
 */
function trimDiff(diff: string): string {
  const lines = diff.split('\n');
  // 过滤出实际的变更行（+、-、空格开头的行，排除文件头）
  const contentLines = lines.filter(
    (line) =>
      (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) &&
      !line.startsWith('---') &&
      !line.startsWith('+++')
  );

  if (contentLines.length === 0) return diff;

  // 找出所有变更行中最小的前导空格数
  let min = Infinity;
  for (const line of contentLines) {
    const content = line.slice(1); // 移除+/-/空格前缀
    if (content.trim().length > 0) {
      const match = content.match(/^(\s*)/);
      if (match) min = Math.min(min, match[1].length);
    }
  }
  // 如果没有找到或最小值为0，直接返回原diff
  if (min === Infinity || min === 0) return diff;
  
  // 移除共同的前导空格
  const trimmedLines = lines.map((line) => {
    if (
      (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) &&
      !line.startsWith('---') &&
      !line.startsWith('+++')
    ) {
      const prefix = line[0]; // 保留+/-/空格前缀
      const content = line.slice(1);
      return prefix + content.slice(min); // 移除共同的前导空格
    }
    return line;
  });

  return trimmedLines.join('\n');
}

/**
 * Write 工具定义
 * 
 * 参数：
 * - content: 要写入的文件内容（字符串）
 * - filePath: 文件路径（绝对路径或相对路径）
 * 
 * 注意：此工具会完全替换文件内容，如果需要部分修改，请使用 edit 工具
 */
export const WriteTool = Tool.define('write', {
  description: `Write content to a file. This will replace the entire file content. Use this tool when you need to create a new file or completely replace an existing file's content.`,
  parameters: z.object({
    content: z.string().describe('The content to write to the file'),
    filePath: z.string().describe('The absolute path to the file to write (must be absolute, not relative)'),
  }),
  async execute(params, ctx) {
    // 解析文件路径
    const workspaceDir = getWorkspaceDirectory();
    const filepath = path.isAbsolute(params.filePath)
      ? params.filePath
      : path.join(workspaceDir, params.filePath);

    // 检查文件是否存在，读取旧内容用于生成diff
    const exists = fs.existsSync(filepath);
    const contentOld = exists ? fs.readFileSync(filepath, 'utf8') : '';

    // 生成文件差异（用于权限请求时展示给用户）
    const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, params.content));
    
    // 请求编辑权限（包含diff信息）
    await ctx.ask({
      permission: 'edit',
      patterns: [workspaceDir ? path.relative(workspaceDir, filepath) : filepath],
      always: ['*'],
      metadata: {
        filepath,
        diff,
      },
    });

    // 写入文件
    fs.writeFileSync(filepath, params.content, 'utf8');

    // 生成返回结果
    const title = workspaceDir ? path.relative(workspaceDir, filepath) : path.basename(filepath);
    const output = 'Wrote file successfully.';

    return {
      title,
      metadata: {
        filepath,
        exists: exists, // 标识文件是新创建还是已存在
      },
      output,
    };
  },
});
