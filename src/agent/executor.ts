/**
 * Agent执行器
 * 负责执行Agent任务、生成代码差异、预览和应用更改
 */

import { CodeContext, ChatRequest, IAPIClient } from '../api/types';
import { AgentTask, AgentResult, CodeChange } from './types';
import { buildTaskPrompt } from './tasks';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Agent执行器
 */
export class AgentExecutor {
  constructor(private apiClient: IAPIClient) {}

  /**
   * 执行Agent任务
   * @param task 要执行的任务
   * @param context 代码上下文
   * @returns 执行结果
   */
  async execute(task: AgentTask, context: CodeContext): Promise<AgentResult> {
    try {
      // 构建提示词
      const code = context.selection?.content || context.currentFile.content;
      const language = context.currentFile.language;
      const prompt = buildTaskPrompt(task, code, language);

      // 调用API生成代码
      const request: ChatRequest = {
        messages: [
          {
            role: 'system',
            content: '你是一个专业的编程助手。请按照要求生成代码，只返回代码内容，不要包含额外的解释。'
          },
          {
            role: 'user',
            content: prompt,
            context
          }
        ],
        model: 'current', // 使用当前选中的模型
        stream: false
      };

      const response = await this.apiClient.sendChatRequest(request);

      // 提取生成的代码
      const generatedCode = this.extractCode(response.content);

      if (!generatedCode) {
        return {
          success: false,
          changes: [],
          message: '未能从响应中提取代码',
          error: '响应格式不正确'
        };
      }

      // 生成代码更改
      const change = this.createCodeChange(
        context.currentFile.path,
        code,
        generatedCode
      );

      return {
        success: true,
        changes: [change],
        message: `${task.name}执行成功`
      };
    } catch (error) {
      return {
        success: false,
        changes: [],
        message: '任务执行失败',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 预览更改
   * @param result Agent执行结果
   */
  async previewChanges(result: AgentResult): Promise<void> {
    // 在实际VSCode环境中，这里会使用vscode.commands.executeCommand
    // 显示diff编辑器。这里提供一个简化的实现
    
    for (const change of result.changes) {
      console.log(`\n=== Preview changes for ${change.file} ===`);
      console.log(change.diff);
    }
  }

  /**
   * 应用更改
   * @param result Agent执行结果
   */
  async applyChanges(result: AgentResult): Promise<void> {
    try {
      for (const change of result.changes) {
        // 写入新内容到文件
        await this.writeFile(change.file, change.newContent);
      }
    } catch (error) {
      // 如果应用失败，尝试回滚
      await this.undoChanges(result);
      throw new Error(`应用更改失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 撤销更改
   * @param result Agent执行结果
   */
  async undoChanges(result: AgentResult): Promise<void> {
    try {
      for (const change of result.changes) {
        // 恢复原始内容
        await this.writeFile(change.file, change.originalContent);
      }
    } catch (error) {
      throw new Error(`撤销更改失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从响应中提取代码
   * @param content 响应内容
   * @returns 提取的代码，如果没有找到则返回null
   */
  private extractCode(content: string): string | null {
    // 尝试提取代码块
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)\n```/;
    const match = content.match(codeBlockRegex);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // 如果没有代码块标记，检查是否整个内容都是代码
    // 这里使用简单的启发式方法
    const lines = content.trim().split('\n');
    const codeIndicators = [
      'function', 'class', 'const', 'let', 'var', 'import', 'export',
      'def', 'public', 'private', 'protected', 'interface', 'type'
    ];
    
    const hasCodeIndicators = lines.some(line => 
      codeIndicators.some(indicator => line.includes(indicator))
    );
    
    if (hasCodeIndicators) {
      return content.trim();
    }
    
    return null;
  }

  /**
   * 创建代码更改对象
   * @param filePath 文件路径
   * @param originalContent 原始内容
   * @param newContent 新内容
   * @returns 代码更改对象
   */
  private createCodeChange(
    filePath: string,
    originalContent: string,
    newContent: string
  ): CodeChange {
    const diff = this.generateDiff(originalContent, newContent);
    
    return {
      file: filePath,
      originalContent,
      newContent,
      diff
    };
  }

  /**
   * 生成差异文本
   * @param original 原始内容
   * @param modified 修改后的内容
   * @returns 差异文本
   */
  private generateDiff(original: string, modified: string): string {
    // 简化的diff生成
    // 在实际实现中，可以使用diff库如'diff'或'fast-diff'
    
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    
    const diffLines: string[] = [];
    diffLines.push('--- Original');
    diffLines.push('+++ Modified');
    
    const maxLines = Math.max(originalLines.length, modifiedLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const origLine = originalLines[i];
      const modLine = modifiedLines[i];
      
      if (origLine === modLine) {
        diffLines.push(`  ${origLine || ''}`);
      } else {
        if (origLine !== undefined) {
          diffLines.push(`- ${origLine}`);
        }
        if (modLine !== undefined) {
          diffLines.push(`+ ${modLine}`);
        }
      }
    }
    
    return diffLines.join('\n');
  }

  /**
   * 写入文件
   * @param filePath 文件路径
   * @param content 文件内容
   */
  private async writeFile(filePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFile(filePath, content, 'utf8', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 读取文件
   * @param filePath 文件路径
   * @returns 文件内容
   */
  private async readFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }
}
