/**
 * Context Manager
 * 负责收集和管理代码上下文，为AI请求提供相关信息
 */

import * as vscode from 'vscode';
import { CodeContext, DependencySymbol } from '../api/types';
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
      const document = editor.document;
      
      if (selection) {
        // 如果有选中内容，beforeCursor 是选中区域之前的内容（从文档开始到选中区域开始）
        // afterCursor 是选中区域之后的内容（从选中区域结束到文档末尾）
        const editorSelection = editor.selection;
        const selectionStart = editorSelection.start;
        const selectionEnd = editorSelection.end;
        
        // beforeCursor: 从文档开始到选中区域开始
        const beforeRange = new vscode.Range(
          new vscode.Position(0, 0),
          selectionStart
        );
        const beforeCursor = document.getText(beforeRange);
        
        // afterCursor: 从选中区域结束到文档末尾
        const lastLine = document.lineCount - 1;
        const lastLineLength = document.lineAt(lastLine).text.length;
        const afterRange = new vscode.Range(
          selectionEnd,
          new vscode.Position(lastLine, lastLineLength)
        );
        const afterCursor = document.getText(afterRange);
        
        const language = document.languageId;
        const filePath = document.uri.fsPath;
        context.cursorContext = {
          line: selection.startLine,
          column: 0,
          beforeCursor: beforeCursor,
          afterCursor: afterCursor,
          language: language,
          path: filePath
        };
      } else {
        // 如果没有选中内容，使用光标位置
        const position = editor.selection.active;
        const line = document.lineAt(position.line);
        const lineText = line.text;
        const language = document.languageId;
        const filePath = document.uri.fsPath;
        
        context.cursorContext = {
          line: position.line,
          column: position.character,
          beforeCursor: lineText.substring(0, position.character),
          afterCursor: lineText.substring(position.character),
          language: language,
          path: filePath
        };
      }
    }

    // 注意：以下操作可能会比较耗时，在实际实现中应该：
    // 1. 异步执行，不阻塞主流程
    // 2. 使用缓存避免重复分析
    // 3. 只在必要时才执行（例如用户选中了代码）

    // 分析相关文件（仅在必要时执行）
    if (context.currentFile.path) {
      try {
        // 如果有选中代码，使用依赖符号分析（更精确，包含符号内容）
        if (selection) {
          const dependencySymbols = await this.getDependencySymbols();
          context.relatedFiles = await this.formatDependencySymbolsAsRelatedFiles(dependencySymbols);
        } else {
          // 如果没有选中代码，使用原有的文件导入分析
          const relatedFiles = await this.analyzeRelatedFiles(context.currentFile.path);
          context.relatedFiles = await this.formatRelatedFilesWithoutSelection(relatedFiles);
        }
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
      
      const language = document.languageId;
      const filePath = document.uri.fsPath;
      context.cursorContext = {
        line: position.line,
        column: position.character,
        beforeCursor: lineText.substring(0, position.character),
        afterCursor: lineText.substring(position.character),
        language: language,
        path: filePath
      };
    } else {
      context.cursorContext = {
        line: 0,
        column: 0,
        beforeCursor: '',
        afterCursor: '',
        language: context.currentFile?.language || '',
        path: context.currentFile?.path || ''
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
    const filePath = document.uri.fsPath;
    const language = document.languageId;
    const selectedText = document.getText(selection);
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    return {
      content: selectedText,
      startLine: startLine,
      endLine: endLine,
      path: filePath,
      language: language
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
      const selectionTokens = estimateTokens(context.selection.content);
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
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
      }
      
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      
      // 使用 CodeAnalyzer 的 analyzeRelatedFiles 方法，它内部会调用 resolveRelativePath
      // 或者直接使用 path 模块解析
      const path = require('path');
      const fs = require('fs');
      
      const currentDir = path.dirname(currentFile);
      let resolvedPath = path.resolve(currentDir, importPath);
      
      // 跳过 node_modules 中的模块
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
        return null;
      }
      
      // 尝试添加常见的文件扩展名
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
      for (const ext of extensions) {
        const pathWithExt = resolvedPath + ext;
        if (fs.existsSync(pathWithExt)) {
          return pathWithExt;
        }
      }
      
      // 尝试 index 文件
      for (const ext of extensions) {
        const indexPath = path.join(resolvedPath, `index${ext}`);
        if (fs.existsSync(indexPath)) {
          return indexPath;
        }
      }
      
      // 如果解析后的路径存在（可能是目录）
      if (fs.existsSync(resolvedPath)) {
        return resolvedPath;
      }
      
      return null;
    } catch (error) {
      return null;
    }
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

  /**
   * 获取选中代码中依赖的方法和变量内容
   * 自动去重：如果方法已包含在类中，则只返回类定义
   * @returns 依赖的方法和变量信息（已去重）
   */
  async getDependencySymbols(): Promise<DependencySymbol[]> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return [];
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
      return [];
    }

    const document = editor.document;
    const selectedText = document.getText(selection);
    
    // 1. 从选中代码中提取使用的标识符（变量、类型、函数等）
    const identifiers = this.extractIdentifiersFromSelection(document, selection, selectedText);
    
    if (identifiers.length === 0) {
      return [];
    }

    // 2. 查找每个标识符的定义位置
    const allDefinitions: DependencySymbol[] = [];
    const processedDefinitions = new Set<string>(); // 用于去重定义位置
    
    for (const identifier of identifiers) {
      try {
        const definitions = await this.findSymbolDefinitions(document, identifier.position);
        
        for (const definition of definitions) {
          // 检查 definition 是否有效
          if (!definition || !definition.uri) {
            continue;
          }
          
          // 使用 URI + 行号作为唯一标识，避免重复处理同一个定义
          const defKey = `${definition.uri.toString()}:${definition.range.start.line}:${definition.range.start.character}`;
          if (processedDefinitions.has(defKey)) {
            continue;
          }
          processedDefinitions.add(defKey);
          
          const symbolContent = await this.getSymbolContent(definition, identifier.kind);
          if (symbolContent) {
            allDefinitions.push(symbolContent);
          }
        }
      } catch (error) {
        // 忽略单个标识符的定义查找错误
      }
    }

    if (allDefinitions.length === 0) {
      return [];
    }

    // 3. 去重：移除已包含在类中的方法和属性
    const deduplicated = this.deduplicateSymbols(allDefinitions);

    // 4. 按优先级排序（类 > 方法 > 变量）
    return this.sortSymbolsByPriority(deduplicated);
  }

  /**
   * 从选中代码中提取使用的标识符
   * 提取选中文本中的所有标识符（变量、类型、函数等），然后查找它们的定义
   */
  private extractIdentifiersFromSelection(
    document: vscode.TextDocument,
    selection: vscode.Selection,
    selectedText: string
  ): Array<{ name: string; position: vscode.Position; kind: vscode.SymbolKind }> {
    const identifiers: Array<{ name: string; position: vscode.Position; kind: vscode.SymbolKind }> = [];
    const seen = new Set<string>(); // 用于去重
    
    // 获取语言ID，用于确定标识符规则
    const languageId = document.languageId;
    
    // TypeScript/JavaScript 标识符正则：支持 $ 符号
    // 匹配：字母、数字、下划线、$，但不能以数字开头
    const identifierRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;
    
    let match;
    let totalMatches = 0;
    while ((match = identifierRegex.exec(selectedText)) !== null) {
      totalMatches++;
      const name = match[0];
      
      // 跳过关键字和常见的内置对象
      if (this.isKeyword(name, languageId) || this.isBuiltin(name, languageId)) {
        continue;
      }
      
      // 计算在文档中的实际位置
      const startOffset = document.offsetAt(selection.start) + match.index;
      const position = document.positionAt(startOffset);
      
      // 去重：同一个位置和名称只添加一次
      const key = `${position.line}:${position.character}:${name}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      
      // 尝试从 Language Server 获取符号类型（如果可用）
      // 默认使用 Variable 类型，后续查找定义时会更新
      identifiers.push({
        name: name,
        position: position,
        kind: vscode.SymbolKind.Variable // 默认类型，会在查找定义时更新
      });
    }
    
    return identifiers;
  }

  /**
   * 判断是否为关键字
   */
  private isKeyword(name: string, languageId: string): boolean {
    const keywords: string[] = [
      // TypeScript/JavaScript 关键字
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
      'return', 'function', 'class', 'interface', 'type', 'const', 'let', 'var',
      'import', 'export', 'from', 'as', 'default', 'async', 'await', 'try', 'catch',
      'finally', 'throw', 'new', 'this', 'super', 'extends', 'implements', 'static',
      'public', 'private', 'protected', 'readonly', 'abstract', 'enum', 'namespace',
      'typeof', 'instanceof', 'in', 'of', 'void', 'null', 'undefined', 'true', 'false'
    ];
    return keywords.includes(name);
  }

  /**
   * 判断是否为内置对象
   */
  private isBuiltin(name: string, languageId: string): boolean {
    const builtins: string[] = [
      // JavaScript/TypeScript 内置对象
      'console', 'window', 'document', 'global', 'process', 'Buffer', 'Array',
      'Object', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON', 'Promise',
      'Set', 'Map', 'RegExp', 'Error', 'TypeError', 'ReferenceError', 'NaN',
      'Infinity', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'eval', 'decodeURI',
      'encodeURI', 'decodeURIComponent', 'encodeURIComponent'
    ];
    return builtins.includes(name);
  }

  /**
   * 查找符号的定义位置
   */
  private async findSymbolDefinitions(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Location[]> {
    try {
      // 使用 VSCode Language Server API 获取定义
      // 注意：executeDefinitionProvider 可能返回 Location[] 或 LocationLink[]
      const definitions = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
        'vscode.executeDefinitionProvider',
        document.uri,
        position
      );
      
      if (!definitions || definitions.length === 0) {
        return [];
      }
      
      // 转换为 Location[] 格式
      const locations: vscode.Location[] = [];
      for (const def of definitions) {
        let uri: vscode.Uri | undefined;
        let range: vscode.Range | undefined;
        
        // 检查是否是 LocationLink（有 targetUri 和 targetRange）
        if ('targetUri' in def && def.targetUri) {
          uri = def.targetUri;
          range = def.targetRange || def.targetSelectionRange || new vscode.Range(position, position);
        } 
        // 检查是否是 Location（有 uri 和 range）
        else if ('uri' in def && def.uri) {
          uri = def.uri;
          range = def.range;
        }
        
        if (!uri || !range) {
          continue;
        }
        
        const location: vscode.Location = {
          uri: uri,
          range: range
        };
        
        locations.push(location);
      }
      
      return locations;
    } catch (error) {
      console.error(`[ContextManager] Error finding symbol definitions at line ${position.line}, column ${position.character}:`, error);
      return [];
    }
  }

  /**
   * 获取符号的完整内容
   */
  private async getSymbolContent(
    location: vscode.Location,
    symbolKind: vscode.SymbolKind
  ): Promise<DependencySymbol | null> {
    try {
      // 打开定义文件
      const document = await vscode.workspace.openTextDocument(location.uri);
      const filePath = location.uri.fsPath;
      
      // 获取符号所在行的内容
      const range = location.range;
      const startLine = range.start.line;
      const endLine = range.end.line;
      
      // 尝试获取完整的符号定义（函数、类、变量等）
      const symbolText = document.getText(range);
      
      if (!symbolText || symbolText.trim().length === 0) {
        return null;
      }
      
      // 获取文件的全部内容作为 context
      const contextText = document.getText();
      
      // 尝试获取更完整的定义（例如整个函数体或类体）
      const fullDefinition = await this.getFullSymbolDefinition(document, range);
      
      // 尝试获取父符号（如果该符号是类的方法或属性）
      const parentSymbol = await this.findParentSymbol(document, range, symbolKind);
      
      const symbolName = symbolText.split(/[\s(]/)[0] || 'unknown';
      
      return {
        name: symbolName,
        filePath: filePath,
        startLine: startLine,
        endLine: endLine,
        content: fullDefinition || symbolText,
        context: contextText,
        uri: location.uri.toString(),
        kind: symbolKind,
        parentName: parentSymbol?.name
      };
    } catch (error) {
      console.error(`[ContextManager] Error getting symbol content from ${location.uri.fsPath}:`, error);
      return null;
    }
  }

  /**
   * 获取完整的符号定义（例如整个函数体或类体）
   */
  private async getFullSymbolDefinition(
    document: vscode.TextDocument,
    range: vscode.Range
  ): Promise<string | null> {
    try {
      // 使用 DocumentSymbol API 获取更详细的信息
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );
      
      if (!symbols) {
        return null;
      }
      
      // 查找包含该位置的符号
      const symbol = this.findSymbolAtPosition(symbols, range.start);
      if (symbol) {
        return document.getText(symbol.range);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting full symbol definition:', error);
      return null;
    }
  }

  /**
   * 在符号树中查找指定位置的符号
   */
  private findSymbolAtPosition(
    symbols: vscode.DocumentSymbol[],
    position: vscode.Position
  ): vscode.DocumentSymbol | null {
    for (const symbol of symbols) {
      if (symbol.range.contains(position)) {
        // 检查子符号（更精确的匹配）
        if (symbol.children && symbol.children.length > 0) {
          const childSymbol = this.findSymbolAtPosition(symbol.children, position);
          if (childSymbol) {
            return childSymbol;
          }
        }
        return symbol;
      }
    }
    return null;
  }

  /**
   * 查找父符号（例如类的方法，返回类名）
   */
  private async findParentSymbol(
    document: vscode.TextDocument,
    range: vscode.Range,
    symbolKind: vscode.SymbolKind
  ): Promise<{ name: string; kind: vscode.SymbolKind } | null> {
    // 只有方法和属性需要查找父符号
    if (symbolKind !== vscode.SymbolKind.Method && 
        symbolKind !== vscode.SymbolKind.Property &&
        symbolKind !== vscode.SymbolKind.Field) {
      return null;
    }

    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );
      
      if (!symbols) {
        return null;
      }
      
      // 查找包含该符号的父符号（类或接口）
      const findParent = (symbols: vscode.DocumentSymbol[], position: vscode.Position): vscode.DocumentSymbol | null => {
        for (const symbol of symbols) {
          if (symbol.range.contains(position) && 
              (symbol.kind === vscode.SymbolKind.Class || 
               symbol.kind === vscode.SymbolKind.Interface ||
               symbol.kind === vscode.SymbolKind.Namespace)) {
            // 检查是否有子符号包含该位置
            if (symbol.children && symbol.children.length > 0) {
              const childContains = symbol.children.some(child => child.range.contains(position));
              if (childContains) {
                return symbol; // 找到了父符号
              }
            }
          }
          
          // 递归查找
          if (symbol.children && symbol.children.length > 0) {
            const parent = findParent(symbol.children, position);
            if (parent) {
              return parent;
            }
          }
        }
        return null;
      };
      
      const parent = findParent(symbols, range.start);
      if (parent) {
        return { name: parent.name, kind: parent.kind };
      }
      
      return null;
    } catch (error) {
      console.error('Error finding parent symbol:', error);
      return null;
    }
  }

  /**
   * 去重符号：移除已包含在类中的方法和属性
   */
  private deduplicateSymbols(symbols: DependencySymbol[]): DependencySymbol[] {
    const result: DependencySymbol[] = [];
    const processed = new Set<string>(); // 用于跟踪已处理的符号

    // 首先，收集所有类符号
    const classSymbols = symbols.filter(s => 
      s.kind === vscode.SymbolKind.Class || 
      s.kind === vscode.SymbolKind.Interface ||
      s.kind === vscode.SymbolKind.Namespace
    );

    // 为每个类创建唯一标识（文件路径 + 类名）
    const classKeys = new Set<string>();
    for (const classSymbol of classSymbols) {
      const key = `${classSymbol.filePath}:${classSymbol.name}`;
      classKeys.add(key);
      processed.add(key);
      result.push(classSymbol);
    }

    // 然后处理方法和属性
    for (const symbol of symbols) {
      // 跳过已经处理的类
      const key = `${symbol.filePath}:${symbol.name}`;
      if (processed.has(key)) {
        continue;
      }

      // 如果是方法或属性，检查是否已包含在类中
      if (symbol.kind === vscode.SymbolKind.Method || 
          symbol.kind === vscode.SymbolKind.Property ||
          symbol.kind === vscode.SymbolKind.Field) {
        
        // 检查是否有父符号（类）
        if (symbol.parentName) {
          const parentKey = `${symbol.filePath}:${symbol.parentName}`;
          if (classKeys.has(parentKey)) {
            // 该符号已包含在类中，跳过
            continue;
          }
        }

        // 检查符号是否在某个类的范围内
        const isContainedInClass = classSymbols.some(classSymbol => {
          if (classSymbol.filePath !== symbol.filePath) {
            return false;
          }
          // 检查符号的行号是否在类的范围内
          return symbol.startLine >= classSymbol.startLine && 
                 symbol.endLine <= classSymbol.endLine;
        });

        if (isContainedInClass) {
          // 该符号已包含在类中，跳过
          continue;
        }
      }

      // 添加到结果中
      processed.add(key);
      result.push(symbol);
    }

    return result;
  }

  /**
   * 按优先级排序符号（类 > 方法 > 变量）
   */
  private sortSymbolsByPriority(symbols: DependencySymbol[]): DependencySymbol[] {
    const getPriority = (kind: vscode.SymbolKind): number => {
      // 优先级：类/接口 > 方法 > 变量/属性
      if (kind === vscode.SymbolKind.Class || 
          kind === vscode.SymbolKind.Interface ||
          kind === vscode.SymbolKind.Namespace) {
        return 1;
      }
      if (kind === vscode.SymbolKind.Method || 
          kind === vscode.SymbolKind.Function) {
        return 2;
      }
      if (kind === vscode.SymbolKind.Variable ||
          kind === vscode.SymbolKind.Property ||
          kind === vscode.SymbolKind.Field) {
        return 3;
      }
      return 4; // 其他类型
    };

    return symbols.sort((a, b) => {
      const priorityA = getPriority(a.kind);
      const priorityB = getPriority(b.kind);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // 如果优先级相同，按文件路径和名称排序
      if (a.filePath !== b.filePath) {
        return a.filePath.localeCompare(b.filePath);
      }
      
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * 检查两个范围是否重叠
   */
  private rangesOverlap(range1: vscode.Range, range2: vscode.Range): boolean {
    return range1.start.isBeforeOrEqual(range2.end) && range1.end.isAfterOrEqual(range2.start);
  }

  /**
   * 将依赖符号格式化为 relatedFiles 格式
   * 按文件分组，每个文件包含该文件中所有相关符号的内容
   * 保留现有的格式：Array<{path: string, relevance: number, excerpt: string}>
   */
  private async formatDependencySymbolsAsRelatedFiles(
    symbols: DependencySymbol[]
  ): Promise<CodeContext['relatedFiles']> {
    if (symbols.length === 0) {
      return [];
    }

    // 按文件路径分组
    const fileMap = new Map<string, DependencySymbol[]>();
    for (const symbol of symbols) {
      const filePath = symbol.filePath;
      if (!fileMap.has(filePath)) {
        fileMap.set(filePath, []);
      }
      fileMap.get(filePath)!.push(symbol);
    }

    // 转换为 relatedFiles 格式
    const relatedContext: CodeContext['relatedFiles'] = [];
    
    for (const [filePath, fileSymbols] of fileMap.entries()) {
      // 按符号类型和位置排序
      const sortedSymbols = fileSymbols.sort((a, b) => {
        // 先按行号排序
        if (a.startLine !== b.startLine) {
          return a.startLine - b.startLine;
        }
        // 再按名称排序
        return a.name.localeCompare(b.name);
      });

      // 构建 excerpt：包含所有符号的定义内容
      // 保持与 contextCollector 中使用的格式一致：`${file.path}:\n${file.excerpt}`
      const excerptParts: string[] = [];
      
      for (const symbol of sortedSymbols) {
        // 添加符号标题
        const symbolType = this.getSymbolTypeName(symbol.kind);
        excerptParts.push(`// ${symbolType}: ${symbol.name} (line ${symbol.startLine + 1}-${symbol.endLine + 1})`);
        
        // 添加符号内容
        excerptParts.push(symbol.content);
        
        // 添加分隔线（最后一个符号不添加）
        if (symbol !== sortedSymbols[sortedSymbols.length - 1]) {
          excerptParts.push('');
        }
      }

      const excerpt = excerptParts.join('\n');
      
      // 计算相关性分数（基于符号数量和类型）
      const relevance = this.calculateRelevance(fileSymbols);

      // 选择主要符号（优先级：类/接口 > 方法 > 变量）
      // 如果文件中有多个符号，选择最重要的一个作为主要符号
      const primarySymbol = sortedSymbols[0]; // 已按优先级排序，第一个就是最重要的
      
      // 计算所有符号的行号范围
      const minStartLine = Math.min(...sortedSymbols.map(s => s.startLine));
      const maxEndLine = Math.max(...sortedSymbols.map(s => s.endLine));
      
      // 获取文件的全部内容作为 context
      let mergedContext = '';
      if (sortedSymbols.length > 0) {
        try {
          const firstSymbolUri = vscode.Uri.parse(sortedSymbols[0].uri);
          const document = await vscode.workspace.openTextDocument(firstSymbolUri);
          mergedContext = document.getText(); // 文件的全部内容
        } catch (error) {
          // 如果无法获取文档，使用第一个符号的上下文
          mergedContext = primarySymbol.context || '';
        }
      }

      // 获取文件的 languageId
      let language: string | undefined;
      try {
        const uri = vscode.Uri.parse(primarySymbol.uri);
        const document = await vscode.workspace.openTextDocument(uri);
        language = document.languageId;
      } catch (error) {
        // 如果无法获取，尝试从文件路径推断
        language = this.getLanguageIdFromPath(filePath);
      }
      
      relatedContext.push({
        path: filePath,
        relevance: relevance,
        excerpt: excerpt,
        language: language,
        // 主要符号的信息
        name: primarySymbol.name,
        startLine: minStartLine,
        endLine: maxEndLine,
        content: primarySymbol.content, // 主要符号的内容
        context: mergedContext, // 合并后的上下文
        uri: primarySymbol.uri,
        kind: primarySymbol.kind,
        parentName: primarySymbol.parentName
      });
    }

    // 按相关性排序
    return relatedContext.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * 格式化未选中代码时的相关文件
   * 保持与选中代码时的结构一致，字段没有的就给空字符串
   * context 包含文件的全部内容
   * excerpt 只包含框架和声明（导入、导出、类、方法、变量等）
   */
  private async formatRelatedFilesWithoutSelection(
    filePaths: string[]
  ): Promise<CodeContext['relatedFiles']> {
    const relatedFiles: CodeContext['relatedFiles'] = [];
    
    for (const filePath of filePaths) {
      try {
        // 将文件路径转换为 URI
        const uri = vscode.Uri.file(filePath);
        
        // 读取文件的全部内容
        let fileContent = '';
        try {
          const document = await vscode.workspace.openTextDocument(uri);
          fileContent = document.getText();
        } catch (docError) {
          // 如果无法通过 VSCode API 打开，尝试使用 fs 读取
          try {
            const fs = require('fs');
            if (fs.existsSync(filePath)) {
              fileContent = fs.readFileSync(filePath, 'utf-8');
            }
          } catch (fsError) {
            // 如果都失败了，使用空字符串
            fileContent = '';
          }
        }
        
        // 提取文件的摘要（只包含框架和声明）
        const excerpt = await this.extractFileSummary(filePath, fileContent);
        
        // 获取文件的 languageId
        let language: string | undefined;
        try {
          const document = await vscode.workspace.openTextDocument(uri);
          language = document.languageId;
        } catch (error) {
          // 如果无法获取，尝试从文件路径推断
          language = this.getLanguageIdFromPath(filePath);
        }
        
        relatedFiles.push({
          path: filePath,
          relevance: 1.0,
          excerpt: excerpt, // 只包含框架和声明
          language: language,
          name: '',
          startLine: undefined,
          endLine: undefined,
          content: '',
          context: fileContent, // 文件的全部内容作为 context
          uri: uri.toString(),
          kind: undefined,
          parentName: undefined
        });
      } catch (error) {
        // 如果文件路径无效，仍然添加但使用空值
        const language = this.getLanguageIdFromPath(filePath);
        relatedFiles.push({
          path: filePath,
          relevance: 1.0,
          excerpt: '',
          language: language,
          name: '',
          startLine: undefined,
          endLine: undefined,
          content: '',
          context: '',
          uri: '',
          kind: undefined,
          parentName: undefined
        });
      }
    }
    
    return relatedFiles;
  }

  /**
   * 提取文件的摘要
   * 使用 VSCode Language Server API 提取符号信息，兼容多种语言
   * 只保留导入、导出、类、方法、变量等框架和声明，去除实现细节
   */
  private async extractFileSummary(filePath: string, fileContent: string): Promise<string> {
    if (!fileContent || fileContent.trim().length === 0) {
      return '';
    }

    try {
      // 使用 VSCode 的 DocumentSymbolProvider 获取符号信息
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );

      if (!symbols || symbols.length === 0) {
        // 如果 Language Server 不支持，回退到正则表达式
        return this.extractSummaryWithRegex(fileContent, this.getLanguageIdFromPath(filePath));
      }

      const summaryParts: string[] = [];
      
      // 1. 提取导入语句（从文件内容中提取，因为符号提供者通常不包含导入）
      const importLines = this.extractImportLines(fileContent.split('\n'), this.getLanguageIdFromPath(filePath));
      if (importLines.length > 0) {
        summaryParts.push(...importLines);
        summaryParts.push('');
      }

      // 2. 遍历符号，按类型分类处理
      const processedSymbols = this.processSymbols(symbols, document);
      summaryParts.push(...processedSymbols);

      return summaryParts.join('\n').trim();
    } catch (error) {
      // 如果 Language Server 失败，回退到正则表达式
      return this.extractSummaryWithRegex(fileContent, this.getLanguageIdFromPath(filePath));
    }
  }

  /**
   * 处理符号，生成摘要内容
   */
  private processSymbols(symbols: vscode.DocumentSymbol[], document: vscode.TextDocument): string[] {
    const summaryParts: string[] = [];
    
    // 保持源文件中的原始顺序，只按位置排序
    const sortedSymbols = symbols.sort((a, b) => a.range.start.line - b.range.start.line);
    
    for (const symbol of sortedSymbols) {
      const symbolSummary = this.formatSymbolAsSummary(symbol, document);
      if (symbolSummary) {
        summaryParts.push(symbolSummary);
        
        // 如果是类或接口，处理其子符号（方法、属性等）
        if (symbol.kind === vscode.SymbolKind.Class || 
            symbol.kind === vscode.SymbolKind.Interface ||
            symbol.kind === vscode.SymbolKind.Struct) {
          if (symbol.children && symbol.children.length > 0) {
            const childSummaries = this.processChildSymbols(symbol.children, document);
            summaryParts.push(...childSummaries);
          }
        }
        
        summaryParts.push(''); // 添加空行分隔
      }
    }
    
    return summaryParts;
  }

  /**
   * 处理子符号（类/接口内部的方法、属性等）
   * 保持源文件中的原始顺序
   */
  private processChildSymbols(children: vscode.DocumentSymbol[], document: vscode.TextDocument): string[] {
    const summaries: string[] = [];
    // 保持源文件中的原始顺序，只按位置排序
    const sorted = children.sort((a, b) => a.range.start.line - b.range.start.line);
    
    for (const child of sorted) {
      const summary = this.formatSymbolAsSummary(child, document, true);
      if (summary) {
        summaries.push(summary);
      }
    }
    
    return summaries;
  }

  /**
   * 格式化符号为摘要格式
   */
  private formatSymbolAsSummary(
    symbol: vscode.DocumentSymbol, 
    document: vscode.TextDocument,
    isChild: boolean = false
  ): string {
    const indent = isChild ? '  ' : '';
    const range = symbol.range;
    const startLine = range.start.line;
    const endLine = range.end.line;
    
    // 获取符号的完整文本
    const fullText = document.getText(symbol.range);
    
    switch (symbol.kind) {
      case vscode.SymbolKind.Class:
      case vscode.SymbolKind.Interface:
      case vscode.SymbolKind.Struct:
        // 类/接口：只保留声明行，不包含方法体
        const classLine = document.lineAt(startLine).text;
        return indent + classLine.trim();
        
      case vscode.SymbolKind.Function:
      case vscode.SymbolKind.Method:
        // 方法/函数：保留签名，方法体用 ... 代替
        return this.formatMethodSignature(symbol, document, indent);
        
      case vscode.SymbolKind.Variable:
      case vscode.SymbolKind.Property:
      case vscode.SymbolKind.Field:
        // 变量/属性：保留声明，去除初始化
        return this.formatVariableSignature(symbol, document, indent);
        
      case vscode.SymbolKind.Constant:
        // 常量：保留完整声明
        return indent + document.lineAt(startLine).text.trim();
        
      case vscode.SymbolKind.Namespace:
      case vscode.SymbolKind.Module:
        // 命名空间/模块：保留声明
        return indent + document.lineAt(startLine).text.trim();
        
      default:
        // 其他类型：保留第一行
        return indent + document.lineAt(startLine).text.trim();
    }
  }

  /**
   * 格式化方法签名为摘要格式
   * 例如：getRegisteredAdapters(): string[] { ... }
   */
  private formatMethodSignature(
    symbol: vscode.DocumentSymbol,
    document: vscode.TextDocument,
    indent: string
  ): string {
    const range = symbol.range;
    const startLine = range.start.line;
    const endLine = range.end.line;
    
    // 获取方法的完整签名（从开始到方法体开始）
    let signature = '';
    let foundOpeningBrace = false;
    
    // 逐行读取，直到找到方法体的开始 { 或到达方法结束
    for (let i = startLine; i <= endLine; i++) {
      const line = document.lineAt(i).text;
      const trimmed = line.trim();
      
      // 跳过注释
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**')) {
        continue;
      }
      
      // 检查是否包含方法体的开始
      if (trimmed.includes('{')) {
        // 提取到 { 之前的部分
        const beforeBrace = line.split('{')[0].trim();
        if (beforeBrace) {
          signature += (signature ? ' ' : '') + beforeBrace;
        }
        foundOpeningBrace = true;
        break;
      } else {
        // 继续累积签名行
        signature += (signature ? ' ' : '') + trimmed;
      }
    }
    
    // 如果没有找到 {，说明可能是抽象方法或接口方法
    if (!foundOpeningBrace) {
      // 尝试从符号名称和范围构建签名
      const firstLine = document.lineAt(startLine).text.trim();
      signature = firstLine;
      if (!signature.endsWith(';')) {
        signature += ';';
      }
    } else {
      // 确保格式为 methodName(...): ReturnType { ... }
      signature = signature.trim();
      if (signature && !signature.endsWith('{')) {
        signature += ' { ... }';
      }
    }
    
    return indent + signature;
  }

  /**
   * 格式化变量/属性签名为摘要格式
   */
  private formatVariableSignature(
    symbol: vscode.DocumentSymbol,
    document: vscode.TextDocument,
    indent: string
  ): string {
    const range = symbol.range;
    const startLine = range.start.line;
    
    // 获取变量声明行
    let declaration = document.lineAt(startLine).text.trim();
    
    // 如果有初始化，只保留到 = 之前，或者保留类型注解
    if (declaration.includes('=')) {
      // 如果有类型注解，保留类型部分
      if (declaration.includes(':')) {
        const parts = declaration.split('=');
        declaration = parts[0].trim() + ';';
      } else {
        declaration = declaration.split('=')[0].trim() + ';';
      }
    } else if (!declaration.endsWith(';')) {
      declaration += ';';
    }
    
    return indent + declaration;
  }

  /**
   * 按符号类型排序
   */
  private sortSymbolsByKind(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
    const kindPriority: Record<number, number> = {
      [vscode.SymbolKind.Class]: 1,
      [vscode.SymbolKind.Interface]: 1,
      [vscode.SymbolKind.Struct]: 1,
      [vscode.SymbolKind.Namespace]: 2,
      [vscode.SymbolKind.Module]: 2,
      [vscode.SymbolKind.Function]: 3,
      [vscode.SymbolKind.Method]: 3,
      [vscode.SymbolKind.Variable]: 4,
      [vscode.SymbolKind.Property]: 4,
      [vscode.SymbolKind.Field]: 4,
      [vscode.SymbolKind.Constant]: 5,
    };
    
    return symbols.sort((a, b) => {
      const priorityA = kindPriority[a.kind] || 99;
      const priorityB = kindPriority[b.kind] || 99;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      // 相同优先级按位置排序
      return a.range.start.line - b.range.start.line;
    });
  }

  /**
   * 使用正则表达式提取摘要（主要方法）
   * 提取导入、类声明、方法签名等框架信息
   */
  private extractSummaryWithRegex(fileContent: string, languageId: string): string {
    const summaryParts: string[] = [];
    const lines = fileContent.split('\n');
    
    // 1. 提取完整的导入语句（支持多行）
    const importBlocks: string[] = [];
    let currentImport: string[] = [];
    let inImport = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // 导入开始
      if (trimmed.startsWith('import ') || trimmed.startsWith('import type ')) {
        inImport = true;
        currentImport = [line];
        
        // 单行导入
        if (trimmed.includes(' from ') && (trimmed.includes("'") || trimmed.includes('"'))) {
          importBlocks.push(line);
          currentImport = [];
          inImport = false;
        }
      }
      // 继续收集多行导入
      else if (inImport) {
        currentImport.push(line);
        
        // 导入结束（包含 from 和引号）
        if (trimmed.includes(' from ') && (trimmed.includes("'") || trimmed.includes('"'))) {
          importBlocks.push(currentImport.join('\n'));
          currentImport = [];
          inImport = false;
        }
      }
    }
    
    if (importBlocks.length > 0) {
      summaryParts.push(...importBlocks);
      summaryParts.push('');
    }
    
    // 2. 提取类和接口声明及其方法签名
    const classRegex = /^(export\s+)?(class|interface)\s+\w+[^{]*\{/gm;
    let classMatch;
    
    while ((classMatch = classRegex.exec(fileContent)) !== null) {
      const classStart = classMatch.index;
      const classLine = classMatch[0];
      
      // 提取类声明
      summaryParts.push(classLine);
      
      // 提取类内部的方法和属性（只保留签名）
      const classContent = fileContent.substring(classStart);
      let braceCount = 0;
      let inClass = false;
      const classLines = classContent.split('\n');
      
      for (let i = 0; i < classLines.length; i++) {
        const line = classLines[i];
        const trimmed = line.trim();
        
        // 找到类开始
        if (trimmed.includes('class ') || trimmed.includes('interface ')) {
          inClass = true;
          // 计算初始大括号
          for (const char of line) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
          }
          continue;
        }
        
        if (inClass) {
          // 计算大括号
          for (const char of line) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
          }
          
          // 类结束
          if (braceCount === 0) {
            summaryParts.push('}');
            break;
          }
          
          // 在类的最外层（braceCount === 1），提取方法和属性
          if (braceCount === 1) {
            // 跳过注释和空行
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**') || trimmed === '') {
              continue;
            }
            
            // 检查是否是方法：包含 ( 和 )，且后面有 { 或 ;
            // 方法格式：methodName(params): ReturnType { 或 methodName(params) {
            const hasParentheses = trimmed.includes('(') && trimmed.includes(')');
            const hasMethodBody = trimmed.includes('{') || trimmed.endsWith(';');
            
            // 检查是否是构造函数
            const isConstructor = /^\s*constructor\s*\(/.test(trimmed);
            
            // 检查是否是 getter/setter
            const isAccessor = /^\s*(?:public|private|protected|static)?\s*(get|set)\s+\w+\s*\(/.test(trimmed);
            
            // 检查是否是方法（有括号，有方法体）
            // 方法特征：methodName(...) 或 methodName(...): ReturnType
            // 排除：属性赋值中包含括号的情况
            const methodNameMatch = trimmed.match(/^\s*(?:public|private|protected|static|readonly|async)?\s*(\w+)\s*\(/);
            const isMethod = hasParentheses && hasMethodBody && methodNameMatch && 
                            !trimmed.match(/^\s*(?:public|private|protected|static|readonly)?\s*\w+\s*:\s*[^=]+=\s*[^(]+\(/);
            
            // 检查是否是属性声明（包含 : 但不包含 (，或者包含 = new）
            const isProperty = trimmed.includes(':') && !trimmed.includes('(') && 
                              (trimmed.includes('=') || trimmed.endsWith(';') || trimmed.match(/:\s*\w+/));
            
            if (isConstructor || isAccessor || isMethod) {
              // 提取方法签名（到第一个 { 之前）
              const signature = line.split('{')[0].trim();
              if (signature && signature.length > 0) {
                // 确保以分号结尾
                const finalSignature = signature.endsWith(';') ? signature : signature + ';';
                summaryParts.push('  ' + finalSignature);
              }
            } else if (isProperty) {
              // 提取属性声明（到第一个 = 或 ; 之前，保留类型注解）
              let signature = line.split('=')[0].split(';')[0].trim();
              // 如果包含类型注解，保留完整的类型部分
              if (signature.includes(':')) {
                const parts = signature.split(':');
                if (parts.length >= 2) {
                  signature = parts[0].trim() + ': ' + parts.slice(1).join(':').trim();
                }
              }
              if (signature && signature.length > 0 && !signature.includes('(')) {
                const finalSignature = signature.endsWith(';') ? signature : signature + ';';
                summaryParts.push('  ' + finalSignature);
              }
            }
          }
        }
      }
      
      summaryParts.push(''); // 类之间添加空行
    }
    
    // 3. 提取独立函数声明（不在类中的）
    const functionRegex = /^(export\s+)?(async\s+)?function\s+\w+\s*\([^)]*\)\s*[^{]*\{/gm;
    const functions = fileContent.match(functionRegex);
    if (functions) {
      summaryParts.push(...functions.map(f => {
        const signature = f.split('{')[0].trim();
        return signature + ';';
      }));
    }
    
    // 4. 提取导出语句
    const exportRegex = /^export\s+.*$/gm;
    const exports = fileContent.match(exportRegex);
    if (exports) {
      // 过滤掉已经在类声明中包含的 export class
      const filteredExports = exports.filter(e => !e.includes('export class') && !e.includes('export interface'));
      if (filteredExports.length > 0) {
        if (summaryParts.length > 0 && summaryParts[summaryParts.length - 1] !== '') {
          summaryParts.push('');
        }
        summaryParts.push(...filteredExports);
      }
    }
    
    return summaryParts.join('\n').trim();
  }

  /**
   * 从文件路径获取语言ID
   */
  private getLanguageIdFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const extMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescriptreact',
      'js': 'javascript',
      'jsx': 'javascriptreact',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp'
    };
    return extMap[ext] || 'typescript';
  }

  /**
   * 提取导入语句（支持多行导入）
   */
  private extractImportLines(lines: string[], languageId: string): string[] {
    const importLines: string[] = [];
    let currentImport: string[] = [];
    let inImport = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // TypeScript/JavaScript 导入开始
      if (trimmed.startsWith('import ') || trimmed.startsWith('import type ')) {
        inImport = true;
        currentImport = [line];
        
        // 检查是否是单行导入（包含 from 和引号）
        if (trimmed.includes(' from ') && (trimmed.includes("'") || trimmed.includes('"'))) {
          importLines.push(line);
          currentImport = [];
          inImport = false;
          continue;
        }
      }
      // 如果正在导入中，继续收集
      else if (inImport) {
        currentImport.push(line);
        
        // 检查导入是否结束（包含 from 和引号）
        if (trimmed.includes(' from ') && (trimmed.includes("'") || trimmed.includes('"'))) {
          importLines.push(currentImport.join('\n'));
          currentImport = [];
          inImport = false;
          continue;
        }
      }
      // CommonJS require
      else if (trimmed.includes('require(') && !inImport) {
        importLines.push(line);
      }
      // Python import
      else if (languageId === 'python' && (trimmed.startsWith('import ') || trimmed.startsWith('from ')) && !inImport) {
        importLines.push(line);
      }
      // Java import
      else if (languageId === 'java' && trimmed.startsWith('import ') && !inImport) {
        importLines.push(line);
      }
    }
    
    // 如果还有未完成的导入，也添加进去
    if (currentImport.length > 0) {
      importLines.push(currentImport.join('\n'));
    }
    
    return importLines;
  }

  /**
   * 提取类声明（只保留类签名和方法/属性签名，不包含方法体）
   */
  private extractClassDeclaration(lines: string[], classInfo: any): string[] {
    const classLines: string[] = [];
    const startLine = classInfo.startLine;
    const endLine = Math.min(classInfo.endLine, lines.length - 1);
    
    if (startLine >= lines.length) {
      return classLines;
    }
    
    // 提取类声明行（可能跨多行）
    let braceCount = 0;
    let inClass = false;
    let classDeclarationStart = startLine;
    
    // 首先找到类声明开始
    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      if (trimmed.includes('class ') || trimmed.includes('interface ')) {
        inClass = true;
        classDeclarationStart = i;
        // 计算大括号
        for (const char of line) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
        // 添加类声明行
        classLines.push(line);
        break;
      }
    }
    
    if (!inClass) {
      return classLines;
    }
    
    // 提取类内部的方法和属性（只保留签名）
    let methodBraceCount = 0; // 用于跟踪方法体的大括号
    let inMethod = false;
    
    for (let i = classDeclarationStart + 1; i <= endLine; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // 跳过注释和空行
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**') || trimmed === '') {
        continue;
      }
      
      // 计算类级别的大括号
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
      
      // 类结束
      if (braceCount === 0) {
        classLines.push('}');
        break;
      }
      
      // 在类的最外层（braceCount === 1），提取方法和属性声明
      if (braceCount === 1 && !inMethod) {
        // 匹配方法声明：methodName(params): ReturnType { 或 methodName(params) {
        // 支持 async、public/private/protected、返回类型等
        const methodMatch = trimmed.match(/^\s*(?:public|private|protected|static|readonly|async)?\s*(?:\w+\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^;{]+)?\s*[;{]/);
        // 匹配构造函数：constructor(params) {
        const constructorMatch = trimmed.match(/^\s*constructor\s*\([^)]*\)\s*[;{]/);
        // 匹配 getter/setter：get propertyName() 或 set propertyName()
        const accessorMatch = trimmed.match(/^\s*(?:public|private|protected|static)?\s*(get|set)\s+(\w+)\s*\([^)]*\)\s*[;{]/);
        // 匹配属性声明：propertyName: Type 或 propertyName = value（但不在方法中）
        const propertyMatch = !trimmed.includes('(') && trimmed.match(/^\s*(?:public|private|protected|static|readonly)?\s*(\w+)\s*[:=]/);
        
        if (methodMatch || constructorMatch || accessorMatch) {
          // 提取方法签名（到第一个 { 之前）
          const signature = line.split('{')[0].trim();
          if (signature) {
            classLines.push('  ' + signature + ';');
            // 如果这行包含 {，说明方法体开始了
            if (line.includes('{')) {
              inMethod = true;
              methodBraceCount = 1;
            }
          }
        } else if (propertyMatch) {
          // 提取属性声明（到第一个 = 或 ; 之前，保留类型注解）
          let signature = line.split('=')[0].split(';')[0].trim();
          // 如果包含类型注解，保留它
          if (signature.includes(':')) {
            const parts = signature.split(':');
            signature = parts[0].trim() + ': ' + parts.slice(1).join(':').trim();
          }
          if (signature && !signature.endsWith(';')) {
            classLines.push('  ' + signature + ';');
          } else if (signature) {
            classLines.push('  ' + signature);
          }
        }
      }
      
      // 跟踪方法体的大括号（跳过方法体内容）
      if (inMethod) {
        for (const char of line) {
          if (char === '{') methodBraceCount++;
          if (char === '}') methodBraceCount--;
        }
        // 方法体结束
        if (methodBraceCount === 0) {
          inMethod = false;
        }
      }
    }
    
    // 确保类有结束大括号
    if (classLines.length > 0 && !classLines[classLines.length - 1].trim().endsWith('}')) {
      classLines.push('}');
    }
    
    return classLines;
  }

  /**
   * 提取函数声明（只保留签名，不包含函数体）
   */
  private extractFunctionDeclaration(lines: string[], funcInfo: any): string {
    const startLine = funcInfo.startLine;
    const endLine = Math.min(funcInfo.endLine, lines.length - 1);
    
    if (startLine >= lines.length) {
      return '';
    }
    
    // 提取函数签名（可能跨多行）
    let signature = '';
    let braceCount = 0;
    
    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i];
      signature += (signature ? ' ' : '') + line.trim();
      
      // 计算大括号
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
      
      // 找到函数体开始（第一个 {），提取签名
      if (braceCount > 0) {
        const signaturePart = signature.split('{')[0].trim();
        if (signaturePart) {
          return signaturePart + ';';
        }
        break;
      }
      
      // 如果是箭头函数，提取到 => 之前
      if (line.includes('=>')) {
        const signaturePart = signature.split('=>')[0].trim();
        if (signaturePart) {
          return signaturePart + ' => ...;';
        }
        break;
      }
    }
    
    // 如果没有找到函数体，返回整个声明（可能是接口中的方法声明）
    if (signature && (signature.includes('function ') || signature.includes('('))) {
      return signature.split('{')[0].trim() + ';';
    }
    
    return '';
  }

  /**
   * 提取导出语句
   */
  private extractExportLines(lines: string[], exports: string[], languageId: string): string[] {
    const exportLines: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      // TypeScript/JavaScript export
      if (trimmed.startsWith('export ')) {
        exportLines.push(line);
      }
      // Python __all__ 或其他导出方式
      else if (languageId === 'python' && trimmed.includes('__all__')) {
        exportLines.push(line);
      }
    }
    
    return exportLines;
  }

  /**
   * 获取符号类型名称
   */
  private getSymbolTypeName(kind: vscode.SymbolKind): string {
    switch (kind) {
      case vscode.SymbolKind.Class:
        return 'Class';
      case vscode.SymbolKind.Interface:
        return 'Interface';
      case vscode.SymbolKind.Function:
      case vscode.SymbolKind.Method:
        return 'Function';
      case vscode.SymbolKind.Variable:
      case vscode.SymbolKind.Property:
      case vscode.SymbolKind.Field:
        return 'Variable';
      case vscode.SymbolKind.Namespace:
        return 'Namespace';
      default:
        return 'Symbol';
    }
  }

  /**
   * 计算文件的相关性分数
   * 基于符号数量和类型权重
   */
  private calculateRelevance(symbols: DependencySymbol[]): number {
    let score = 0;
    
    for (const symbol of symbols) {
      switch (symbol.kind) {
        case vscode.SymbolKind.Class:
        case vscode.SymbolKind.Interface:
          score += 10; // 类/接口权重最高
          break;
        case vscode.SymbolKind.Method:
        case vscode.SymbolKind.Function:
          score += 5; // 方法/函数权重中等
          break;
        case vscode.SymbolKind.Variable:
        case vscode.SymbolKind.Property:
        case vscode.SymbolKind.Field:
          score += 2; // 变量权重较低
          break;
        default:
          score += 1;
      }
    }
    
    // 归一化到 0-1 范围（简单实现）
    return Math.min(1.0, score / 20);
  }
}
export { CodeContext };

