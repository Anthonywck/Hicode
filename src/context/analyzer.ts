/**
 * Code Analyzer
 * 负责解析代码文件，提取导入语句、函数定义、类定义等信息
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * 解析结果接口
 * 包含从代码中提取的结构化信息
 */
export interface ParseResult {
  /** 导入语句列表 */
  imports: string[];
  /** 导出语句列表 */
  exports: string[];
  /** 函数定义列表 */
  functions: FunctionInfo[];
  /** 类定义列表 */
  classes: ClassInfo[];
}

/**
 * 函数信息接口
 */
export interface FunctionInfo {
  /** 函数名 */
  name: string;
  /** 参数列表 */
  parameters: string[];
  /** 起始行号 */
  startLine: number;
  /** 结束行号 */
  endLine: number;
  /** 是否为异步函数 */
  isAsync: boolean;
}

/**
 * 类信息接口
 */
export interface ClassInfo {
  /** 类名 */
  name: string;
  /** 方法列表 */
  methods: string[];
  /** 属性列表 */
  properties: string[];
  /** 起始行号 */
  startLine: number;
  /** 结束行号 */
  endLine: number;
  /** 继承的父类 */
  extends?: string;
  /** 实现的接口 */
  implements?: string[];
}

/**
 * Code Analyzer类
 * 提供代码解析和分析功能
 */
export class CodeAnalyzer {
  /**
   * 解析导入语句
   * 支持多种导入语法（ES6, CommonJS, TypeScript）
   */
  async parseImports(filePath: string): Promise<string[]> {
    try {
      const content = await this.readFile(filePath);
      const imports: string[] = [];

      // ES6 import语句
      // import ... from 'module'
      const es6ImportRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
      let match;
      while ((match = es6ImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }

      // CommonJS require语句
      // require('module')
      const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }

      // TypeScript import type
      // import type ... from 'module'
      const typeImportRegex = /import\s+type\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
      while ((match = typeImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }

      // 去重
      return Array.from(new Set(imports));
    } catch (error) {
      console.error(`Error parsing imports from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * 解析导出语句
   * 提取文件中的所有导出项
   */
  async parseExports(filePath: string): Promise<string[]> {
    try {
      const content = await this.readFile(filePath);
      const exports: string[] = [];

      // export { name }
      const namedExportRegex = /export\s+\{\s*([^}]+)\s*\}/g;
      let match;
      while ((match = namedExportRegex.exec(content)) !== null) {
        const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]);
        exports.push(...names);
      }

      // export const/let/var name
      const varExportRegex = /export\s+(?:const|let|var)\s+(\w+)/g;
      while ((match = varExportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }

      // export function name
      const funcExportRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
      while ((match = funcExportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }

      // export class name
      const classExportRegex = /export\s+class\s+(\w+)/g;
      while ((match = classExportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }

      // export default
      if (/export\s+default/.test(content)) {
        exports.push('default');
      }

      return Array.from(new Set(exports));
    } catch (error) {
      console.error(`Error parsing exports from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * 解析函数定义
   * 提取文件中的所有函数信息
   */
  async parseFunctions(filePath: string): Promise<FunctionInfo[]> {
    try {
      const content = await this.readFile(filePath);
      const functions: FunctionInfo[] = [];
      const lines = content.split('\n');

      // 匹配函数声明
      // function name(params) { ... }
      // async function name(params) { ... }
      // const name = function(params) { ... }
      // const name = (params) => { ... }
      const functionRegex = /(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))\s*\(([^)]*)\)/g;

      let match;
      while ((match = functionRegex.exec(content)) !== null) {
        const name = match[1] || match[2];
        const params = match[3]
          ? match[3].split(',').map(p => p.trim().split(/[=:]/)[0].trim())
          : [];
        const isAsync = /async/.test(match[0]);

        // 找到函数的起始行
        const startPos = match.index;
        const startLine = content.substring(0, startPos).split('\n').length;

        // 简化实现：假设函数在接下来的50行内结束
        const endLine = Math.min(startLine + 50, lines.length);

        functions.push({
          name,
          parameters: params,
          startLine,
          endLine,
          isAsync
        });
      }

      return functions;
    } catch (error) {
      console.error(`Error parsing functions from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * 解析类定义
   * 提取文件中的所有类信息
   */
  async parseClasses(filePath: string): Promise<ClassInfo[]> {
    try {
      const content = await this.readFile(filePath);
      const classes: ClassInfo[] = [];
      const lines = content.split('\n');

      // 匹配类声明
      // class Name { ... }
      // class Name extends Parent { ... }
      // class Name implements Interface { ... }
      const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w\s,]+))?\s*\{/g;

      let match;
      while ((match = classRegex.exec(content)) !== null) {
        const name = match[1];
        const extendsClass = match[2];
        const implementsInterfaces = match[3]
          ? match[3].split(',').map(i => i.trim())
          : undefined;

        // 找到类的起始行
        const startPos = match.index;
        const startLine = content.substring(0, startPos).split('\n').length;

        // 找到类的结束位置（匹配大括号）
        const endLine = this.findClassEndLine(content, startPos, lines);

        // 提取类的方法和属性
        const classContent = content.substring(
          startPos,
          this.getPositionFromLine(content, endLine)
        );
        const methods = this.extractMethods(classContent);
        const properties = this.extractProperties(classContent);

        classes.push({
          name,
          methods,
          properties,
          startLine,
          endLine,
          extends: extendsClass,
          implements: implementsInterfaces
        });
      }

      return classes;
    } catch (error) {
      console.error(`Error parsing classes from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * 完整解析文件
   * 返回文件的所有结构化信息
   */
  async parseFile(filePath: string): Promise<ParseResult> {
    const [imports, exports, functions, classes] = await Promise.all([
      this.parseImports(filePath),
      this.parseExports(filePath),
      this.parseFunctions(filePath),
      this.parseClasses(filePath)
    ]);

    return {
      imports,
      exports,
      functions,
      classes
    };
  }

  /**
   * 分析相关文件
   * 基于导入关系找到相关文件
   */
  async analyzeRelatedFiles(
    filePath: string,
    workspaceRoot: string
  ): Promise<string[]> {
    const imports = await this.parseImports(filePath);
    const relatedFiles: string[] = [];

    for (const importPath of imports) {
      // 跳过node_modules中的模块
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
        continue;
      }

      // 解析相对路径
      const resolvedPath = this.resolveRelativePath(importPath, filePath, workspaceRoot);
      if (resolvedPath && await this.fileExists(resolvedPath)) {
        relatedFiles.push(resolvedPath);
      }
    }

    return relatedFiles;
  }

  /**
   * 读取文件内容
   */
  private async readFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf-8', (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      fs.access(filePath, fs.constants.F_OK, (err) => {
        resolve(!err);
      });
    });
  }

  /**
   * 解析相对路径
   */
  private resolveRelativePath(
    importPath: string,
    currentFile: string,
    workspaceRoot: string
  ): string | null {
    try {
      const currentDir = path.dirname(currentFile);
      let resolvedPath = path.resolve(currentDir, importPath);

      // 尝试添加常见的文件扩展名
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
      for (const ext of extensions) {
        const pathWithExt = resolvedPath + ext;
        if (fs.existsSync(pathWithExt)) {
          return pathWithExt;
        }
      }

      // 尝试index文件
      for (const ext of extensions) {
        const indexPath = path.join(resolvedPath, `index${ext}`);
        if (fs.existsSync(indexPath)) {
          return indexPath;
        }
      }

      return resolvedPath;
    } catch (error) {
      return null;
    }
  }

  /**
   * 找到类定义的结束行
   */
  private findClassEndLine(content: string, startPos: number, lines: string[]): number {
    let braceCount = 0;
    let inClass = false;

    for (let i = startPos; i < content.length; i++) {
      const char = content[i];
      if (char === '{') {
        braceCount++;
        inClass = true;
      } else if (char === '}') {
        braceCount--;
        if (inClass && braceCount === 0) {
          // 找到类的结束位置
          return content.substring(0, i).split('\n').length;
        }
      }
    }

    // 如果没有找到，返回文件末尾
    return lines.length;
  }

  /**
   * 从行号获取字符位置
   */
  private getPositionFromLine(content: string, line: number): number {
    const lines = content.split('\n');
    let position = 0;
    for (let i = 0; i < Math.min(line, lines.length); i++) {
      position += lines[i].length + 1; // +1 for newline
    }
    return position;
  }

  /**
   * 提取类的方法
   */
  private extractMethods(classContent: string): string[] {
    const methods: string[] = [];
    const methodRegex = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>[\]|]+\s*)?{/g;
    let match;

    while ((match = methodRegex.exec(classContent)) !== null) {
      const methodName = match[1];
      // 排除构造函数和常见的非方法关键字
      if (methodName !== 'constructor' && methodName !== 'if' && methodName !== 'for') {
        methods.push(methodName);
      }
    }

    return Array.from(new Set(methods));
  }

  /**
   * 提取类的属性
   */
  private extractProperties(classContent: string): string[] {
    const properties: string[] = [];
    
    // 匹配类属性声明
    // private/public/protected name: type
    // name: type
    const propertyRegex = /(?:private|public|protected)?\s+(\w+)\s*(?::\s*[\w<>[\]|]+)?(?:\s*=|;)/g;
    let match;

    while ((match = propertyRegex.exec(classContent)) !== null) {
      properties.push(match[1]);
    }

    return Array.from(new Set(properties));
  }
}
