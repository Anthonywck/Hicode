/**
 * Edit tool - 编辑文件工具（支持 diff）
 * 
 * 功能：
 * - 通过字符串替换的方式编辑文件
 * - 支持替换单个匹配或所有匹配（replaceAll）
 * - 生成文件差异（diff）用于权限请求
 * - 统计新增和删除的行数
 * - 自动规范化行尾符（统一为 \n）
 */

import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Tool } from '../tool';
import { createTwoFilesPatch, diffLines } from 'diff';

/**
 * 获取工作区目录路径
 */
function getWorkspaceDirectory(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  return workspaceFolder?.uri.fsPath || '';
}

/**
 * 规范化行尾符，统一为 \n
 * 
 * Windows系统使用 \r\n，Unix/Linux使用 \n
 * 统一处理避免diff比较时出现不必要的差异
 * 
 * @param text 原始文本
 * @returns 规范化后的文本
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * 修剪diff输出，移除公共的前导空格
 * 
 * @param diff 原始diff字符串
 * @returns 修剪后的diff字符串
 */
function trimDiff(diff: string): string {
  const lines = diff.split('\n');
  // 过滤出实际的变更行
  const contentLines = lines.filter(
    (line) =>
      (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) &&
      !line.startsWith('---') &&
      !line.startsWith('+++')
  );

  if (contentLines.length === 0) return diff;

  // 找出最小的前导空格数
  let min = Infinity;
  for (const line of contentLines) {
    const content = line.slice(1);
    if (content.trim().length > 0) {
      const match = content.match(/^(\s*)/);
      if (match) min = Math.min(min, match[1].length);
    }
  }
  if (min === Infinity || min === 0) return diff;
  
  // 移除共同的前导空格
  const trimmedLines = lines.map((line) => {
    if (
      (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) &&
      !line.startsWith('---') &&
      !line.startsWith('+++')
    ) {
      const prefix = line[0];
      const content = line.slice(1);
      return prefix + content.slice(min);
    }
    return line;
  });

  return trimmedLines.join('\n');
}

/**
 * 替换文件内容中的字符串
 * 
 * @param content 原始内容
 * @param oldString 要替换的旧字符串
 * @param newString 新字符串
 * @param replaceAll 是否替换所有匹配（默认false，只替换第一个）
 * @returns 替换后的内容
 * 
 * 注意：
 * - 如果oldString为空，直接返回newString
 * - 如果oldString未找到，抛出错误
 * - 如果replaceAll=false且存在多个匹配，抛出错误（要求提供更多上下文）
 */
function replace(content: string, oldString: string, newString: string, replaceAll = false): string {
  if (oldString === newString) {
    throw new Error('oldString and newString must be different');
  }

  // 如果oldString为空，直接返回newString（相当于插入）
  if (oldString === '') {
    return newString;
  }

  const index = content.indexOf(oldString);
  if (index === -1) {
    throw new Error('oldString not found in content');
  }

  // 如果要求替换所有匹配
  if (replaceAll) {
    return content.split(oldString).join(newString);
  }

  // 检查是否存在多个匹配
  const lastIndex = content.lastIndexOf(oldString);
  if (index !== lastIndex) {
    throw new Error(
      'Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match.'
    );
  }

  // 替换第一个（也是唯一的）匹配
  return content.substring(0, index) + newString + content.substring(index + oldString.length);
}

/**
 * Edit 工具定义
 * 
 * 参数：
 * - filePath: 要编辑的文件路径
 * - oldString: 要替换的旧文本（建议包含足够的上下文以确保唯一匹配）
 * - newString: 新文本
 * - replaceAll: 是否替换所有匹配（可选，默认false）
 * 
 * 使用建议：
 * - 提供足够的上下文（前后几行）以确保oldString唯一匹配
 * - 如果文件中有多个相同的oldString，要么使用replaceAll，要么提供更多上下文
 */
export const EditTool = Tool.define('edit', {
  description: `Edit a file by replacing a specific string with a new string. Use this tool to make targeted edits to files. Provide enough context in oldString to uniquely identify the location to edit.`,
  parameters: z.object({
    filePath: z.string().describe('The absolute path to the file to modify'),
    oldString: z.string().describe('The text to replace'),
    newString: z.string().describe('The text to replace it with (must be different from oldString)'),
    replaceAll: z.boolean().optional().describe('Replace all occurrences of oldString (default false)'),
  }),
  async execute(params, ctx) {
    // 参数验证
    if (!params.filePath) {
      throw new Error('filePath is required');
    }

    if (params.oldString === params.newString) {
      throw new Error('oldString and newString must be different');
    }

    // 解析文件路径
    const workspaceDir = getWorkspaceDirectory();
    const filePath = path.isAbsolute(params.filePath)
      ? params.filePath
      : path.join(workspaceDir, params.filePath);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error(`File ${filePath} not found`);
    }

    // 检查是否为目录
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${filePath}`);
    }

    // 读取文件内容并执行替换
    const contentOld = fs.readFileSync(filePath, 'utf8');
    const contentNew = replace(contentOld, params.oldString, params.newString, params.replaceAll);

    // 生成文件差异（规范化行尾符后比较）
    const diff = trimDiff(
      createTwoFilesPatch(
        filePath,
        filePath,
        normalizeLineEndings(contentOld),
        normalizeLineEndings(contentNew)
      )
    );

    // 请求编辑权限（包含diff信息）
    await ctx.ask({
      permission: 'edit',
      patterns: [workspaceDir ? path.relative(workspaceDir, filePath) : filePath],
      always: ['*'],
      metadata: {
        filepath: filePath,
        diff,
      },
    });

    // 写入修改后的内容
    fs.writeFileSync(filePath, contentNew, 'utf8');

    // 统计变更行数
    const filediff = {
      file: filePath,
      before: contentOld,
      after: contentNew,
      additions: 0, // 新增行数
      deletions: 0, // 删除行数
    };

    // 计算新增和删除的行数
    for (const change of diffLines(contentOld, contentNew)) {
      if (change.added) filediff.additions += change.count || 0;
      if (change.removed) filediff.deletions += change.count || 0;
    }

    // 更新元数据（包含diff和统计信息）
    ctx.metadata({
      metadata: {
        diff,
        filediff,
        diagnostics: {},
      },
    });

    const title = workspaceDir ? path.relative(workspaceDir, filePath) : path.basename(filePath);
    const output = 'Edit applied successfully.';

    return {
      title,
      metadata: {
        diff,
        filediff,
      },
      output,
    };
  },
});
