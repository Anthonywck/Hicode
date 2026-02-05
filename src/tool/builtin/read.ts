/**
 * Read tool - 读取文件内容工具
 * 
 * 功能：
 * - 读取文件内容，支持指定起始行和行数限制
 * - 自动检测二进制文件并拒绝读取
 * - 支持图片和PDF文件的base64编码返回
 * - 对大文件进行截断处理，避免超出限制
 * - 提供文件不存在时的智能建议
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Tool } from '../tool';

// 默认读取行数限制
const DEFAULT_READ_LIMIT = 2000;
// 单行最大长度限制
const MAX_LINE_LENGTH = 2000;
// 最大字节数限制（50KB）
const MAX_BYTES = 50 * 1024;

/**
 * 获取工作区目录路径
 * @returns 工作区目录路径，如果不存在则返回空字符串
 */
function getWorkspaceDirectory(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  return workspaceFolder?.uri.fsPath || '';
}

/**
 * 判断文件是否为二进制文件
 * @param filepath 文件路径
 * @returns 如果是二进制文件返回 true，否则返回 false
 * 
 * 判断逻辑：
 * 1. 首先检查文件扩展名，常见二进制扩展名直接返回 true
 * 2. 读取文件前4KB内容
 * 3. 检查是否包含空字节（0x00），如果有则判定为二进制
 * 4. 统计不可打印字符比例，超过30%则判定为二进制
 */
function isBinaryFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  // 常见二进制文件扩展名列表
  const binaryExtensions = [
    '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.class', '.jar', '.war',
    '.7z', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods',
    '.odp', '.bin', '.dat', '.obj', '.o', '.a', '.lib', '.wasm', '.pyc', '.pyo',
  ];
  if (binaryExtensions.includes(ext)) {
    return true;
  }

  if (!fs.existsSync(filepath)) {
    return false;
  }

  const stats = fs.statSync(filepath);
  // 空文件视为文本文件
  if (stats.size === 0) return false;

  // 读取前4KB内容进行检测
  const bufferSize = Math.min(4096, stats.size);
  const buffer = fs.readFileSync(filepath, { flag: 'r' });
  const bytes = new Uint8Array(buffer.slice(0, bufferSize));

  let nonPrintableCount = 0;
  for (let i = 0; i < bytes.length; i++) {
    // 如果包含空字节，肯定是二进制文件
    if (bytes[i] === 0) return true;
    // 统计不可打印字符（除了制表符、换行符、回车符）
    if (bytes[i] < 9 || (bytes[i] > 13 && bytes[i] < 32)) {
      nonPrintableCount++;
    }
  }
  // 如果不可打印字符超过30%，判定为二进制文件
  return nonPrintableCount / bytes.length > 0.3;
}

/**
 * Read 工具定义
 * 
 * 参数：
 * - filePath: 要读取的文件路径（相对或绝对路径）
 * - offset: 起始行号（0-based，可选）
 * - limit: 读取行数（可选，默认2000行）
 */
export const ReadTool = Tool.define('read', {
  description: `Read a file from the filesystem. Use this tool to read file contents. You can specify an offset (line number, 0-based) and limit (number of lines) to read specific portions of large files.`,
  parameters: z.object({
    filePath: z.string().describe('The path to the file to read'),
    offset: z.coerce.number().optional().describe('The line number to start reading from (0-based)'),
    limit: z.coerce.number().optional().describe('The number of lines to read (defaults to 2000)'),
  }),
  async execute(params, ctx) {
    // 解析文件路径：如果是相对路径，则相对于工作区目录解析
    let filepath = params.filePath;
    if (!path.isAbsolute(filepath)) {
      const workspaceDir = getWorkspaceDirectory();
      filepath = path.resolve(workspaceDir, filepath);
    }

    // 生成显示标题（相对于工作区的路径）
    const workspaceDir = getWorkspaceDirectory();
    const title = workspaceDir ? path.relative(workspaceDir, filepath) : path.basename(filepath);

    // 请求读取权限
    await ctx.ask({
      permission: 'read',
      patterns: [filepath],
      always: ['*'],
      metadata: {},
    });

    // 检查文件是否存在
    if (!fs.existsSync(filepath)) {
      const dir = path.dirname(filepath);
      const base = path.basename(filepath);

      // 如果目录存在，尝试提供相似文件建议
      if (fs.existsSync(dir)) {
        const dirEntries = fs.readdirSync(dir);
        // 查找名称相似的文件（最多3个）
        const suggestions = dirEntries
          .filter(
            (entry) =>
              entry.toLowerCase().includes(base.toLowerCase()) ||
              base.toLowerCase().includes(entry.toLowerCase())
          )
          .map((entry) => path.join(dir, entry))
          .slice(0, 3);

        if (suggestions.length > 0) {
          throw new Error(
            `File not found: ${filepath}\n\nDid you mean one of these?\n${suggestions.join('\n')}`
          );
        }
      }

      throw new Error(`File not found: ${filepath}`);
    }

    // 检查是否为目录
    const stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${filepath}`);
    }

    // 检查文件类型，处理图片和PDF
    const fileType = path.extname(filepath).toLowerCase();
    const isImage =
      ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(fileType) &&
      fileType !== '.svg'; // SVG是文本格式，不按图片处理
    const isPdf = fileType === '.pdf';

    // 如果是图片或PDF，返回base64编码的附件
    if (isImage || isPdf) {
      const mime = isImage ? `image/${fileType.slice(1)}` : 'application/pdf';
      const buffer = fs.readFileSync(filepath);
      const base64 = buffer.toString('base64');
      const msg = `${isImage ? 'Image' : 'PDF'} read successfully`;
      return {
        title,
        output: msg,
        metadata: {
          preview: msg,
          truncated: false,
        },
        attachments: [
          {
            id: `part_${Date.now()}`,
            sessionID: ctx.sessionID,
            messageID: ctx.messageID,
            type: 'file',
            mime,
            url: `data:${mime};base64,${base64}`,
          },
        ],
      };
    }

    // 检查是否为二进制文件
    if (isBinaryFile(filepath)) {
      throw new Error(`Cannot read binary file: ${filepath}`);
    }

    // 读取文本文件内容
    const limit = params.limit ?? DEFAULT_READ_LIMIT;
    const offset = params.offset || 0;
    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.split('\n');

    // 按行读取，同时检查字节数限制
    const raw: string[] = [];
    let bytes = 0;
    let truncatedByBytes = false;
    for (let i = offset; i < Math.min(lines.length, offset + limit); i++) {
      // 如果单行过长，进行截断
      const line =
        lines[i].length > MAX_LINE_LENGTH
          ? lines[i].substring(0, MAX_LINE_LENGTH) + '...'
          : lines[i];
      // 计算字节数（包括换行符）
      const size = Buffer.byteLength(line, 'utf-8') + (raw.length > 0 ? 1 : 0);
      // 如果超过最大字节数限制，停止读取
      if (bytes + size > MAX_BYTES) {
        truncatedByBytes = true;
        break;
      }
      raw.push(line);
      bytes += size;
    }

    // 格式化输出：添加行号前缀
    const contentLines = raw.map((line, index) => {
      return `${(index + offset + 1).toString().padStart(5, '0')}| ${line}`;
    });
    // 预览内容（前20行）
    const preview = raw.slice(0, 20).join('\n');

    // 构建输出内容
    let output = '<file>\n';
    output += contentLines.join('\n');

    const totalLines = lines.length;
    const lastReadLine = offset + raw.length;
    const hasMoreLines = totalLines > lastReadLine;
    const truncated = hasMoreLines || truncatedByBytes;

    // 添加截断提示信息
    if (truncatedByBytes) {
      output += `\n\n(Output truncated at ${MAX_BYTES} bytes. Use 'offset' parameter to read beyond line ${lastReadLine})`;
    } else if (hasMoreLines) {
      output += `\n\n(File has more lines. Use 'offset' parameter to read beyond line ${lastReadLine})`;
    } else {
      output += `\n\n(End of file - total ${totalLines} lines)`;
    }
    output += '\n</file>';

    return {
      title,
      output,
      metadata: {
        preview,
        truncated,
      },
    };
  },
});
