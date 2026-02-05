/**
 * Bash tool - 执行命令工具
 * 
 * 功能：
 * - 执行shell命令（支持Windows和Unix系统）
 * - 支持超时控制
 * - 支持指定工作目录
 * - 实时输出命令执行结果
 * - 支持中止信号（AbortSignal）
 * - 自动处理进程清理
 */

import { z } from 'zod';
import { spawn } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { Tool } from '../tool';

// 默认超时时间：2分钟
const DEFAULT_TIMEOUT = 2 * 60 * 1000;
// 元数据中输出的最大长度（避免元数据过大）
const MAX_METADATA_LENGTH = 30_000;

/**
 * 获取工作区目录路径
 */
function getWorkspaceDirectory(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  return workspaceFolder?.uri.fsPath || '';
}

/**
 * 获取系统默认shell
 * 
 * Windows系统返回cmd.exe，Unix系统返回/bin/sh或$SHELL环境变量指定的shell
 * 
 * @returns shell命令路径
 */
function getShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/sh';
}

/**
 * 强制终止进程及其子进程
 * 
 * @param proc 进程对象
 * 
 * Windows系统使用taskkill命令，Unix系统使用进程组信号
 */
function killProcess(proc: any): void {
  if (process.platform === 'win32') {
    // Windows: 使用taskkill终止进程树
    spawn('taskkill', ['/pid', proc.pid.toString(), '/T', '/F']);
  } else {
    // Unix: 使用进程组信号终止整个进程树
    process.kill(-proc.pid, 'SIGTERM');
  }
}

/**
 * Bash 工具定义
 * 
 * 参数：
 * - command: 要执行的shell命令
 * - timeout: 超时时间（毫秒，可选）
 * - workdir: 工作目录（可选，默认使用工作区目录）
 * - description: 命令的简短描述（5-10个单词）
 * 
 * 注意：
 * - 使用workdir参数而不是在命令中使用cd
 * - 描述用于在UI中显示命令的目的
 */
export const BashTool = Tool.define('bash', {
  description: `Execute a shell command. Use this tool to run terminal commands, scripts, or any shell operations. Be careful with destructive commands.`,
  parameters: z.object({
    command: z.string().describe('The command to execute'),
    timeout: z.number().optional().describe('Optional timeout in milliseconds'),
    workdir: z
      .string()
      .optional()
      .describe(
        `The working directory to run the command in. Defaults to workspace directory. Use this instead of 'cd' commands.`
      ),
    description: z
      .string()
      .describe(
        'Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory \'foo\''
      ),
  }),
  async execute(params, ctx) {
    // 解析工作目录
    const workspaceDir = getWorkspaceDirectory();
    const cwd = params.workdir || workspaceDir;
    
    // 验证超时参数
    if (params.timeout !== undefined && params.timeout < 0) {
      throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`);
    }
    const timeout = params.timeout ?? DEFAULT_TIMEOUT;

    // 请求执行命令的权限
    await ctx.ask({
      permission: 'bash',
      patterns: [params.command],
      always: ['*'],
      metadata: {},
    });

    // 获取系统shell并启动进程
    const shell = getShell();
    const proc = spawn(params.command, {
      shell,
      cwd,
      env: {
        ...process.env, // 继承环境变量
      },
      stdio: ['ignore', 'pipe', 'pipe'], // 忽略stdin，捕获stdout和stderr
      detached: process.platform !== 'win32', // Unix系统使用detached模式以便正确终止进程树
    });

    // 收集命令输出
    let output = '';

    // 初始化元数据
    ctx.metadata({
      metadata: {
        output: '',
        description: params.description,
      },
    });

    // 实时追加输出并更新元数据
    const append = (chunk: Buffer) => {
      output += chunk.toString();
      // 如果输出过长，截断元数据（避免元数据过大）
      ctx.metadata({
        metadata: {
          output:
            output.length > MAX_METADATA_LENGTH
              ? output.slice(0, MAX_METADATA_LENGTH) + '\n\n...'
              : output,
          description: params.description,
        },
      });
    };

    // 监听stdout和stderr输出
    proc.stdout?.on('data', append);
    proc.stderr?.on('data', append);

    // 状态标志
    let timedOut = false; // 是否超时
    let aborted = false; // 是否被中止
    let exited = false; // 是否已退出

    // 终止进程的函数
    const kill = () => {
      if (!exited) {
        killProcess(proc);
      }
    };

    // 如果已经中止，立即终止进程
    if (ctx.abort.aborted) {
      aborted = true;
      await kill();
    }

    // 监听中止信号
    const abortHandler = () => {
      aborted = true;
      kill();
    };

    ctx.abort.addEventListener('abort', abortHandler, { once: true });

    // 设置超时定时器
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeout + 100); // 额外100ms缓冲

    // 等待进程退出
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutTimer);
        ctx.abort.removeEventListener('abort', abortHandler);
      };

      // 进程正常退出
      proc.once('exit', () => {
        exited = true;
        cleanup();
        resolve();
      });

      // 进程启动错误
      proc.once('error', (error) => {
        exited = true;
        cleanup();
        reject(error);
      });
    });

    // 收集结果元数据
    const resultMetadata: string[] = [];

    if (timedOut) {
      resultMetadata.push(`bash tool terminated command after exceeding timeout ${timeout} ms`);
    }

    if (aborted) {
      resultMetadata.push('User aborted the command');
    }

    // 如果有元数据，追加到输出
    if (resultMetadata.length > 0) {
      output += '\n\n<bash_metadata>\n' + resultMetadata.join('\n') + '\n</bash_metadata>';
    }

    return {
      title: params.description,
      metadata: {
        output:
          output.length > MAX_METADATA_LENGTH
            ? output.slice(0, MAX_METADATA_LENGTH) + '\n\n...'
            : output,
        exit: proc.exitCode, // 进程退出码
        description: params.description,
      },
      output,
    };
  },
});
