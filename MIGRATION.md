# 代码迁移说明

## 概述

本次迁移将 `src/index.ts` 中的扩展激活逻辑迁移到了 `src/extension.ts`，并优化了命令管理系统。

## 迁移内容

### 1. 文件职责重新划分

#### src/extension.ts（新的扩展入口）
- ✅ 扩展的 `activate()` 和 `deactivate()` 函数
- ✅ 懒加载模块的定义和初始化
- ✅ 所有 getter 函数（getConfigManager, getAPIClient 等）
- ✅ 命令系统初始化
- ✅ 提供器注册
- ✅ 配置加载
- ✅ 版本号定义

#### src/index.ts（公共 API 导出）
- ✅ 从 extension.ts 重新导出公共 API
- ✅ 导出性能工具类型
- ✅ 作为模块的公共接口

### 2. 删除的内容

从 `src/index.ts` 中删除了以下内容（已迁移到 extension.ts）：

- ❌ `activate()` 函数及其内部的命令注册逻辑
- ❌ `registerCommands()` 函数（已被命令管理系统替代）
- ❌ `registerProviders()` 函数（已迁移）
- ❌ `initializeLazyModules()` 函数（已迁移）
- ❌ 所有懒加载模块的变量定义（已迁移）
- ❌ 所有单例实例的变量定义（已迁移）
- ❌ 所有 getter 函数的实现（已迁移）
- ❌ `deactivate()` 函数（已迁移）

### 3. 新增的命令管理系统

创建了独立的命令管理模块：

```
src/commands/
├── index.ts           # 模块入口
├── types.ts           # 类型定义
├── registry.ts        # 命令注册表
├── commandManager.ts  # 命令管理器
├── handlers.ts        # 命令处理器
└── README.md          # 文档
```

## 优化点

### 1. 更清晰的职责分离

| 文件 | 职责 | 说明 |
|------|------|------|
| `extension.ts` | 扩展入口 | 负责激活、停用和生命周期管理 |
| `index.ts` | 公共 API | 导出供其他模块使用的接口 |
| `commands/` | 命令管理 | 独立的命令系统 |

### 2. 命令管理优化

**之前（在 activate 中直接注册）：**
```typescript
function registerCommands(context: vscode.ExtensionContext): void {
  const commands = [
    { id: 'hicode.showInlineChat', handler: async () => { ... } },
    { id: 'hicode.quickRefactor', handler: async () => { ... } },
    // ... 14 个命令
  ];
  
  commands.forEach(cmd => {
    const disposable = vscode.commands.registerCommand(cmd.id, cmd.handler);
    context.subscriptions.push(disposable);
  });
}
```

**现在（使用命令管理器）：**
```typescript
// 在 extension.ts 中
function initializeCommandSystem(context: vscode.ExtensionContext): void {
  commandManager.initialize(context);
  commandManager.registerAllCommands();
}
```

### 3. 更好的模块化

- 命令配置集中在 `commands/registry.ts`
- 命令处理器独立在 `commands/handlers.ts`
- 命令管理逻辑在 `commands/commandManager.ts`
- 类型定义在 `commands/types.ts`

### 4. 更完善的错误处理

命令管理器统一包装所有命令的错误处理，避免重复代码。

### 5. 更详细的中文注释

所有代码都添加了详细的中文注释，便于理解和维护。

## 使用方式

### 在其他模块中使用懒加载的管理器

```typescript
import { getAPIClient, getContextManager } from './index';

async function someFunction() {
  // 获取 API 客户端（首次调用时会加载模块）
  const apiClient = await getAPIClient();
  
  // 获取上下文管理器
  const contextMgr = await getContextManager();
  
  // 使用它们...
}
```

### 添加新命令

1. 在 `src/commands/handlers.ts` 中添加处理器
2. 在 `src/commands/registry.ts` 中添加配置
3. 无需修改 `extension.ts`

## 兼容性

- ✅ 所有公共 API 保持不变
- ✅ 其他模块的导入语句无需修改
- ✅ 测试文件无需修改
- ✅ 向后兼容

## 测试

编译成功：
```bash
npm run build
# ✓ 编译成功，无错误
```

## 下一步

1. 按 F5 启动调试，测试所有命令
2. 验证懒加载模块是否正常工作
3. 检查性能是否满足 < 1 秒的激活时间要求
