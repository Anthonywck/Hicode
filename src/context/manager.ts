/**
 * Context Manager
 * 负责收集和管理代码上下文，为AI请求提供相关信息
 */

import * as vscode from 'vscode';
import { CodeContext } from '../api/types';
import { CodeAnalyzer } from './analyzer';
import { ContextCache } from './cache';

/**
 * 代码图谱接口
 * 用于表示项目的代码结构关系
 */
export interface CodeGraph {
  files: Map<string, FileNode>;
  dependencies: Map<string, string[]>;
}

/**
 * 文件节点接口
 * 表示代码图谱中的单个文件
 */
export interface FileNode {
  path: string;
  language: string;
  imports: string[];
  exports: string[];
  functions: string[];
  classes: string[];
}

/**
 * Context Manager接口
 * 定义上下文管理器的核心功能
 */
export interface IContextManager {
  /**
   * 获取当前上下文
   * @returns 当前编辑器的代码上下文
   */
  getCurrentContext(): Promise<CodeContext>;

  /**
   * 获取光标位置上下文（用于补全）
   * @returns 光标位置的代码上下文
   */
  getCursorContext(): Promise<CodeContext>;

  /**
   * 获取当前文件内容
   * @returns 当前活动编辑器的文件信息，如果没有活动编辑器则返回 null
   */
  getCurrentFileContent(): Promise<CodeContext['currentFile'] | null>;

  /**
   * 获取当前编辑器选中内容
   * @returns 当前编辑器的选中内容，如果没有选中则返回 null
   */
  getCurrentSelection(): Promise<CodeContext['selection'] | null>;

  /**
   * 分析相关文件
   * @param currentFile 当前文件路径
   * @returns 相关文件路径列表
   */
  analyzeRelatedFiles(currentFile: string): Promise<string[]>;

  /**
   * 构建代码图谱
   * @returns 项目的代码图谱
   */
  buildCodeGraph(): Promise<CodeGraph>;

  /**
   * 智能截断上下文
   * @param context 原始上下文
   * @param maxTokens 最大token数
   * @returns 截断后的上下文
   */
  truncateContext(context: CodeContext, maxTokens: number): CodeContext;
}

/**
 * Context Manager实现
 * 管理代码上下文的收集、分析和缓存
 */
export class ContextManager implements IContextManager {
  private codeGraph: CodeGraph | null = null;
  private cache: ContextCache;
  private analyzer: CodeAnalyzer;

  constructor() {
    this.cache = new ContextCache();
    this.analyzer = new CodeAnalyzer();
  }

  /**
   * 获取当前上下文
   * 收集当前编辑器的完整上下文信息
   */
  async getCurrentContext(): Promise<CodeContext> {
    // 获取当前文件内容和选中内容
    const currentFile = await this.getCurrentFileContent();
    const selection = await this.getCurrentSelection();

    // 如果没有活动编辑器，返回空上下文
    if (!currentFile) {
      return this.getEmptyContext();
    }

    // 构建上下文对象
    const context: CodeContext = {
      currentFile: currentFile
    };

    // 如果有选中内容，添加到上下文
    if (selection) {
      context.selection = selection;
    }

    // 获取光标位置上下文
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const position = editor.selection.active;
      const document = editor.document;
      const line = document.lineAt(position.line);
      const lineText = line.text;
      
      context.cursorContext = {
        line: position.line,
        column: position.character,
        beforeCursor: lineText.substring(0, position.character),
        afterCursor: lineText.substring(position.character)
      };
    }

    // 注意：以下操作可能会比较耗时，在实际实现中应该：
    // 1. 异步执行，不阻塞主流程
    // 2. 使用缓存避免重复分析
    // 3. 只在必要时才执行（例如用户选中了代码）

    // 分析相关文件（仅在必要时执行）
    if (context.currentFile.path) {
      try {
        const relatedFiles = await this.analyzeRelatedFiles(context.currentFile.path);
        context.relatedFiles = relatedFiles.map((filePath: string) => ({
          path: filePath,
          relevance: 1.0,
          excerpt: ''
        }));
      } catch (error) {
        // 分析失败不影响主流程
        console.warn('[ContextManager] Failed to analyze related files:', error);
      }
    }

    // 获取项目信息（快速返回，避免耗时操作）
    try {
      context.projectInfo = await this.getProjectInfo();
    } catch (error) {
      // 获取项目信息失败不影响主流程
      console.warn('[ContextManager] Failed to get project info:', error);
    }

    return context;
  }

  /**
   * 获取光标位置上下文
   * 用于代码补全场景
   */
  async getCursorContext(): Promise<CodeContext> {
    const context = await this.getCurrentContext();

    // 从VSCode API获取光标位置信息
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const position = editor.selection.active;
      const document = editor.document;
      const line = document.lineAt(position.line);
      const lineText = line.text;
      
      context.cursorContext = {
        line: position.line,
        column: position.character,
        beforeCursor: lineText.substring(0, position.character),
        afterCursor: lineText.substring(position.character)
      };
    } else {
      context.cursorContext = {
        line: 0,
        column: 0,
        beforeCursor: '',
        afterCursor: ''
      };
    }

    return context;
  }

  /**
   * 获取当前文件内容
   * 从活动编辑器获取文件路径、语言和内容
   */
  async getCurrentFileContent(): Promise<CodeContext['currentFile'] | null> {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
      return null;
    }

    const document = editor.document;
    const filePath = document.uri.fsPath;
    const language = document.languageId;
    const content = document.getText();

    return {
      path: filePath,
      language: language,
      content: content
    };
  }

  /**
   * 获取当前编辑器选中内容
   * 返回选中文本及其位置信息
   */
  async getCurrentSelection(): Promise<CodeContext['selection'] | null> {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
      return null;
    }

    const selection = editor.selection;
    
    // 如果没有选中内容（选择为空），返回 null
    if (selection.isEmpty) {
      return null;
    }

    const document = editor.document;
    const selectedText = document.getText(selection);
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    return {
      text: selectedText,
      startLine: startLine,
      endLine: endLine
    };
  }

  /**
   * 分析相关文件
   * 通过导入语句和依赖关系找到相关文件
   */
  async analyzeRelatedFiles(currentFile: string): Promise<string[]> {
    // 检查缓存
    const cacheKey = this.getCacheKey(`related:${currentFile}`);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.relatedFiles) {
      return cached.relatedFiles.map(f => f.path);
    }

    // 分析导入语句
    const imports = await this.analyzer.parseImports(currentFile);

    // 查找相关文件
    const relatedFiles: string[] = [];
    for (const importPath of imports) {
      const resolvedPath = await this.resolveImportPath(importPath, currentFile);
      if (resolvedPath) {
        relatedFiles.push(resolvedPath);
      }
    }

    return relatedFiles;
  }

  /**
   * 构建代码图谱
   * 分析整个项目的代码结构和依赖关系
   */
  async buildCodeGraph(): Promise<CodeGraph> {
    if (this.codeGraph) {
      return this.codeGraph;
    }

    const graph: CodeGraph = {
      files: new Map(),
      dependencies: new Map()
    };

    // 在实际实现中，这里会遍历项目文件并分析
    // 这里提供基础框架

    this.codeGraph = graph;
    return graph;
  }

  /**
   * 智能截断上下文
   * 根据优先级保留最重要的上下文信息
   */
  truncateContext(context: CodeContext, maxTokens: number): CodeContext {
    // 优先级：选中代码 > 光标上下文 > 当前文件 > 相关文件
    let currentTokens = 0;
    const truncated: CodeContext = {
      currentFile: context.currentFile
    };

    // 估算token数量（简化实现：1 token ≈ 4 字符）
    const estimateTokens = (text: string): number => {
      return Math.ceil(text.length / 4);
    };

    // 1. 保留选中代码（最高优先级）
    if (context.selection) {
      const selectionTokens = estimateTokens(context.selection.text);
      if (currentTokens + selectionTokens <= maxTokens) {
        truncated.selection = context.selection;
        currentTokens += selectionTokens;
      }
    }

    // 2. 保留光标上下文
    if (context.cursorContext) {
      const cursorTokens = estimateTokens(
        context.cursorContext.beforeCursor + context.cursorContext.afterCursor
      );
      if (currentTokens + cursorTokens <= maxTokens) {
        truncated.cursorContext = context.cursorContext;
        currentTokens += cursorTokens;
      }
    }

    // 3. 截断当前文件内容
    const fileTokens = estimateTokens(context.currentFile.content);
    if (currentTokens + fileTokens <= maxTokens) {
      truncated.currentFile = context.currentFile;
      currentTokens += fileTokens;
    } else {
      // 只保留部分文件内容
      const remainingTokens = maxTokens - currentTokens;
      const remainingChars = remainingTokens * 4;
      truncated.currentFile = {
        ...context.currentFile,
        content: context.currentFile.content.substring(0, remainingChars)
      };
      currentTokens = maxTokens;
    }

    // 4. 添加相关文件（如果还有空间）
    if (context.relatedFiles && currentTokens < maxTokens) {
      truncated.relatedFiles = [];
      for (const file of context.relatedFiles) {
        const fileTokens = estimateTokens(file.excerpt);
        if (currentTokens + fileTokens <= maxTokens) {
          truncated.relatedFiles.push(file);
          currentTokens += fileTokens;
        } else {
          break;
        }
      }
    }

    // 5. 保留项目信息（通常很小）
    if (context.projectInfo) {
      truncated.projectInfo = context.projectInfo;
    }

    return truncated;
  }

  /**
   * 解析导入路径
   * 将相对路径或模块名解析为绝对路径
   */
  private async resolveImportPath(
    importPath: string,
    currentFile: string
  ): Promise<string | null> {
    // 在实际实现中，这里会使用Node.js的路径解析逻辑
    // 处理相对路径、绝对路径和node_modules
    return null;
  }

  /**
   * 获取项目信息
   * 分析package.json等配置文件获取项目元数据
   */
  private async getProjectInfo(): Promise<CodeContext['projectInfo']> {
    // 在实际实现中，这里会读取package.json等文件
    return {
      name: '',
      dependencies: [],
      framework: undefined
    };
  }

  /**
   * 生成缓存键
   * 用于标识不同的上下文请求
   * 注意：使用固定键可以提高缓存命中率，避免每次都生成新键
   */
  private getCacheKey(identifier: string): string {
    // 使用固定键而不是时间戳，提高缓存命中率
    return `context:${identifier}`;
  }

  /**
   * 获取空上下文
   * 当没有活动编辑器时返回
   */
  private getEmptyContext(): CodeContext {
    return {
      currentFile: {
        path: '',
        language: '',
        content: ''
      }
    };
  }
}
export { CodeContext };

