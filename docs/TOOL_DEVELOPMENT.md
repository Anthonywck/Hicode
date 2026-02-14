# 工具开发指南

## 概述

本文档介绍如何在 HiCode Agent 中开发和注册新工具。

## 工具定义

### 基本结构

使用 `Tool.define()` 定义工具：

```typescript
import { Tool } from '../tool';
import { z } from 'zod';

export const MyTool = Tool.define('my-tool', {
  description: 'Tool description',
  parameters: z.object({
    param1: z.string().describe('Parameter description'),
  }),
  async execute(params, ctx) {
    // 工具执行逻辑
    return {
      title: 'Result title',
      output: 'Result content',
      metadata: {
        // 可选元数据
      },
    };
  },
});
```

### 参数定义

使用 Zod schema 定义参数：

```typescript
parameters: z.object({
  // 字符串参数
  filePath: z.string().describe('File path'),
  
  // 数字参数（支持类型转换）
  offset: z.coerce.number().optional().describe('Offset'),
  
  // 枚举参数
  mode: z.enum(['read', 'write']).describe('Mode'),
  
  // 对象参数
  options: z.object({
    key: z.string(),
    value: z.string(),
  }).optional(),
}),
```

### 执行上下文

执行上下文 `ctx` 提供以下属性：

- `sessionID`: 会话 ID
- `messageID`: 消息 ID
- `ask()`: 请求权限的方法

```typescript
async execute(params, ctx) {
  // 请求权限
  await ctx.ask({
    permission: 'read',
    patterns: [params.filePath],
    always: ['*'],
    metadata: {},
  });
  
  // 执行操作
  // ...
}
```

## 工具返回值

### 基本返回值

```typescript
return {
  title: 'Result title',        // 结果标题
  output: 'Result content',     // 结果内容（文本）
  metadata: {                    // 可选元数据
    preview: 'Preview text',     // 预览文本
    truncated: false,             // 是否截断
  },
};
```

### 带附件的返回值

```typescript
return {
  title: 'Result title',
  output: 'Result content',
  attachments: [
    {
      id: 'part-1',
      sessionID: ctx.sessionID,
      messageID: ctx.messageID,
      type: 'file',
      mime: 'image/png',
      url: 'data:image/png;base64,...',
    },
  ],
};
```

## 权限请求

### 请求权限

```typescript
await ctx.ask({
  permission: 'read',           // 权限类型
  patterns: [filePath],         // 匹配模式列表
  always: ['*'],                 // 总是允许的模式
  metadata: {},                 // 元数据
  tool: {                        // 可选：工具调用信息
    messageID: ctx.messageID,
    callID: 'call-1',
  },
  message: 'Optional message',  // 可选：请求消息
});
```

### 权限类型

- `read`: 读取文件
- `write`: 写入文件
- `edit`: 编辑文件
- `bash`: 执行命令
- `grep`: 代码搜索
- `skill`: 使用技能

## 错误处理

### 抛出错误

```typescript
// 文件不存在
if (!fs.existsSync(filePath)) {
  throw new Error(`File not found: ${filePath}`);
}

// 权限被拒绝（会自动处理）
await ctx.ask({ ... }); // 如果用户拒绝，会抛出 RejectedError
```

### 错误消息

提供清晰的错误消息，帮助用户理解问题：

```typescript
if (!fs.existsSync(filePath)) {
  // 提供建议
  const suggestions = findSimilarFiles(filePath);
  if (suggestions.length > 0) {
    throw new Error(
      `File not found: ${filePath}\n\nDid you mean?\n${suggestions.join('\n')}`
    );
  }
  throw new Error(`File not found: ${filePath}`);
}
```

## 文件操作

### 读取文件

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

function getWorkspaceDirectory(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  return workspaceFolder?.uri.fsPath || '';
}

// 解析路径（支持相对路径）
let filepath = params.filePath;
if (!path.isAbsolute(filepath)) {
  const workspaceDir = getWorkspaceDirectory();
  filepath = path.resolve(workspaceDir, filepath);
}

// 读取文件
const content = fs.readFileSync(filepath, 'utf8');
```

### 写入文件

```typescript
// 创建目录（如果不存在）
const dir = path.dirname(filepath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// 写入文件
fs.writeFileSync(filepath, content, 'utf8');
```

## 工具注册

### 自动注册

工具定义后，在 `src/tool/builtin/index.ts` 导出：

```typescript
export { MyTool } from './my-tool';
```

工具会自动注册到工具注册表。

### 手动注册

```typescript
import { ToolRegistry } from '../tool/registry';
import { MyTool } from './my-tool';

const registry = new ToolRegistry();
registry.register(MyTool);
```

## 测试

### 单元测试

创建测试文件 `my-tool.test.ts`：

```typescript
import { MyTool } from './my-tool';
import * as fs from 'fs';

jest.mock('fs');

describe('MyTool', () => {
  let mockContext: any;

  beforeEach(() => {
    mockContext = {
      sessionID: 'session-1',
      messageID: 'msg-1',
      ask: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('should execute tool', async () => {
    const result = await MyTool.execute(
      { param1: 'value1' },
      mockContext
    );

    expect(result).toBeDefined();
    expect(result.output).toBeDefined();
  });
});
```

## 最佳实践

### 1. 参数验证

使用 Zod schema 进行严格的参数验证：

```typescript
parameters: z.object({
  filePath: z.string().min(1).describe('File path'),
  offset: z.coerce.number().int().min(0).optional(),
}),
```

### 2. 权限检查

始终在文件操作前请求权限：

```typescript
await ctx.ask({
  permission: 'read',
  patterns: [filePath],
  always: ['*'],
  metadata: {},
});
```

### 3. 错误处理

提供清晰的错误消息：

```typescript
if (!fs.existsSync(filePath)) {
  throw new Error(`File not found: ${filePath}`);
}
```

### 4. 大文件处理

对大文件进行截断：

```typescript
const limit = params.limit ?? DEFAULT_LIMIT;
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');
const truncated = lines.slice(0, limit);

if (lines.length > limit) {
  // 添加截断提示
}
```

### 5. 二进制文件检测

检测并拒绝二进制文件：

```typescript
function isBinaryFile(filepath: string): boolean {
  const buffer = fs.readFileSync(filepath);
  const bytes = new Uint8Array(buffer.slice(0, 4096));
  
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) return true;
  }
  
  return false;
}
```

## 参考示例

参考以下内置工具的实现：

- `read.ts`: 文件读取工具
- `write.ts`: 文件写入工具
- `edit.ts`: 文件编辑工具（支持 diff）
- `grep.ts`: 代码搜索工具
- `bash.ts`: 命令执行工具
