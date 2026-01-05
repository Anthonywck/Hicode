# 命令管理系统

## 概述

本命令管理系统采用模块化设计，将命令的定义、注册和执行逻辑分离，便于维护和扩展。

## 架构设计

### 文件结构

```
src/commands/
├── index.ts           # 入口文件，导出所有公共 API
├── types.ts           # 类型定义
├── registry.ts        # 命令注册表
├── commandManager.ts  # 命令管理器
├── handlers.ts        # 命令处理器实现
└── README.md          # 本文档
```

### 核心组件

#### 1. types.ts - 类型定义
定义了命令系统的核心类型：
- `CommandHandler`: 命令处理器函数类型
- `CommandConfig`: 命令配置接口
- `CommandStats`: 命令统计信息接口

#### 2. registry.ts - 命令注册表
集中管理所有命令配置：
- `commandConfigs`: 所有命令的配置数组
- `getCommandConfig()`: 根据 ID 获取命令配置
- `getAllCommands()`: 获取所有命令
- `getCommandsByCategory()`: 按分类获取命令

#### 3. commandManager.ts - 命令管理器
负责命令的生命周期管理：
- 单例模式，全局唯一实例
- 使用 Map 精确管理 disposables
- 支持命令的注册、注销、启用、禁用
- 提供命令执行和统计功能
- 自动错误处理和日志记录

#### 4. handlers.ts - 命令处理器
实现所有命令的具体业务逻辑：
- 每个命令一个独立的处理函数
- 统一的错误处理
- 用户友好的提示信息

## 设计优化

相比参考项目，本设计做了以下优化：

### 1. 更精确的资源管理
- **问题**: 参考项目使用数组存储 disposables，难以精确管理单个命令
- **优化**: 使用 `Map<string, Disposable>` 存储，可以精确注销指定命令

### 2. 命令启用/禁用功能
- **新增**: 支持动态禁用/启用命令，无需注销
- **用途**: 根据上下文条件控制命令可用性

### 3. 更完善的错误处理
- **优化**: 在命令管理器层面统一包装错误处理
- **好处**: 避免每个处理器重复编写错误处理代码

### 4. 详细的统计信息
- **新增**: 提供按分类统计的命令信息
- **用途**: 便于监控和调试

### 5. 类型安全
- **优化**: 完整的 TypeScript 类型定义
- **好处**: 编译时类型检查，减少运行时错误

### 6. 模块化设计
- **优化**: 将类型、注册表、管理器、处理器分离
- **好处**: 职责清晰，易于测试和维护

### 7. 命令不直接在 activate 中注册
- **问题**: 参考项目在 activate 函数中直接注册命令，代码冗长
- **优化**: 命令配置集中在 registry.ts，activate 只需调用 `registerAllCommands()`
- **好处**: 代码更简洁，易于维护

## 使用方法

### 在扩展激活时注册命令

```typescript
import { commandManager } from './commands';

export function activate(context: vscode.ExtensionContext) {
  // 初始化命令管理器
  commandManager.initialize(context);
  
  // 注册所有命令
  commandManager.registerAllCommands();
  
  // 获取统计信息
  const stats = commandManager.getStats();
  console.log(`Registered ${stats.active} commands`);
}
```

### 添加新命令

1. 在 `handlers.ts` 中添加处理器函数：

```typescript
export async function myNewCommandHandler(): Promise<void> {
  try {
    // 命令逻辑
    vscode.window.showInformationMessage('My new command!');
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error}`);
    console.error('Error in myNewCommandHandler:', error);
  }
}
```

2. 在 `registry.ts` 的 `commandConfigs` 数组中添加配置：

```typescript
{
  command: 'hicode.myNewCommand',
  title: 'My New Command',
  category: 'HiCode',
  description: '我的新命令',
  handler: handlers.myNewCommandHandler,
  when: 'editorTextFocus'  // 可选
}
```

### 动态管理命令

```typescript
// 禁用命令
commandManager.disableCommand('hicode.someCommand');

// 启用命令
commandManager.enableCommand('hicode.someCommand');

// 检查命令状态
if (commandManager.isCommandRegistered('hicode.someCommand')) {
  console.log('Command is registered');
}

// 执行命令
await commandManager.executeCommand('hicode.someCommand', arg1, arg2);
```

### 清理资源

```typescript
export function deactivate() {
  // 自动清理所有命令
  commandManager.dispose();
}
```

## 最佳实践

1. **命令命名**: 使用 `hicode.` 前缀，采用驼峰命名法
2. **错误处理**: 在处理器中使用 try-catch，提供友好的错误提示
3. **日志记录**: 在关键操作处添加 console.log
4. **用户反馈**: 使用 `vscode.window.showInformationMessage/showWarningMessage/showErrorMessage`
5. **条件检查**: 在处理器开始时检查前置条件（如编辑器是否打开、是否有选中内容）
6. **异步操作**: 命令处理器应该是 async 函数，便于处理异步操作

## 与参考项目的对比

| 特性 | 参考项目 | 当前项目 | 优势 |
|------|---------|---------|------|
| Disposable 管理 | 数组 | Map | 精确管理单个命令 |
| 命令注册位置 | activate 函数中 | 独立的 registry.ts | 代码更简洁 |
| 错误处理 | 每个处理器自行处理 | 统一包装 | 减少重复代码 |
| 命令启用/禁用 | 不支持 | 支持 | 更灵活的控制 |
| 统计信息 | 简单计数 | 按分类统计 | 更详细的监控 |
| 类型定义 | 分散在多个文件 | 集中在 types.ts | 更好的类型安全 |

## 测试建议

1. **单元测试**: 测试每个命令处理器的逻辑
2. **集成测试**: 测试命令管理器的注册、注销功能
3. **端到端测试**: 在 VS Code 环境中测试命令的实际执行

## 未来扩展

1. **命令分组**: 支持命令的逻辑分组
2. **权限控制**: 根据用户权限控制命令可见性
3. **命令历史**: 记录命令执行历史
4. **性能监控**: 统计命令执行时间
5. **热重载**: 支持开发时动态重载命令
