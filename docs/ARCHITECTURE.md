# HiCode Agent 架构文档

## 概述

HiCode Agent 是一个基于 VSCode 扩展的 AI 编程助手系统，采用模块化架构设计，支持多种 AI 模型、工具调用和权限管理。

## 系统架构

### 核心模块

#### 1. 会话管理系统 (Session)

**位置**: `src/session/`

**核心组件**:
- `session-core.ts`: 会话核心类，管理会话状态和消息
- `session-manager.ts`: 会话管理器，提供会话的创建、获取、删除等操作
- `storage.ts`: 会话持久化存储
- `message.ts`: 消息模型定义
- `message-v2.ts`: 消息 V2 版本，支持 parts 结构
- `processor.ts`: 会话处理器，处理 LLM 流式响应和工具调用
- `prompt.ts`: 主循环和消息处理入口
- `llm.ts`: LLM 调用封装

**关键功能**:
- 会话创建、更新、删除
- 消息流式存储和检索
- 会话状态管理（idle, busy, completed）
- 工具调用和响应处理

#### 2. Agent 管理系统

**位置**: `src/agent/`

**核心组件**:
- `agent.ts`: Agent 定义和配置
- `registry.ts`: Agent 注册表
- `system.ts`: Agent 系统核心（旧版，逐步迁移）

**Agent 类型**:
- `build`: 默认 Agent，执行工具
- `plan`: 计划模式，禁止编辑工具
- `general`: 通用 Agent，用于复杂任务
- `explore`: 探索 Agent，快速搜索代码库

**关键功能**:
- Agent 配置（权限、提示词、模型）
- Agent 模式（primary, subagent, all）
- 默认 Agent 选择逻辑

#### 3. 工具系统

**位置**: `src/tool/`

**核心组件**:
- `tool.ts`: 工具基类和接口
- `registry.ts`: 工具注册表
- `context.ts`: 工具执行上下文
- `builtin/`: 内置工具目录
  - `read.ts`: 读取文件
  - `write.ts`: 写入文件
  - `edit.ts`: 编辑文件（支持 diff）
  - `bash.ts`: 执行命令
  - `grep.ts`: 代码搜索
  - `glob.ts`: 文件匹配
  - `task.ts`: 任务工具（调用子 Agent）
  - `webfetch.ts`: 网页获取
  - `todo.ts`: 待办事项

**关键功能**:
- 工具注册和发现
- 工具执行上下文
- 工具权限检查
- 工具结果格式化

#### 4. 权限系统

**位置**: `src/permission/`

**核心组件**:
- `permission.ts`: 权限核心管理器
- `ruleset.ts`: 权限规则集
- `evaluator.ts`: 权限评估器

**权限类型**:
- `read`: 读取文件
- `write`: 写入文件
- `edit`: 编辑文件
- `bash`: 执行命令
- `grep`: 代码搜索
- `skill`: 使用技能
- `doom_loop`: 死循环检测

**权限动作**:
- `allow`: 允许
- `deny`: 拒绝
- `ask`: 询问用户

#### 5. MCP 集成

**位置**: `src/mcp/`

**核心组件**:
- `client.ts`: MCP 客户端管理器
- `tools.ts`: MCP 工具转换
- `resources.ts`: MCP 资源处理
- `config.ts`: MCP 配置管理
- `auth.ts`: MCP 认证
- `oauth-provider.ts`: OAuth 提供者
- `oauth-callback.ts`: OAuth 回调处理

**关键功能**:
- MCP 服务器连接（stdio, HTTP, SSE）
- MCP 工具发现和转换
- MCP 资源读取
- OAuth 认证支持

#### 6. Skills 系统

**位置**: `src/skill/`

**核心组件**:
- `skill.ts`: 技能管理

**关键功能**:
- 技能发现（从配置目录）
- 技能加载和解析（Markdown）
- 技能权限控制

## 数据流

### 消息处理流程

```
用户输入 → prompt() → 创建用户消息 → loop() → SessionProcessor.process() 
→ LLM 流式调用 → 工具调用 → 权限检查 → 工具执行 → 结果返回 → 继续循环或完成
```

### 工具调用流程

```
LLM 请求工具 → 解析工具调用 → 权限检查 → 执行工具 → 返回结果 → 继续 LLM 调用
```

## 配置管理

### Agent 配置

配置文件: `opencode.json` 或 `.hicode/agents.json`

```json
{
  "agents": [
    {
      "name": "build",
      "description": "Default agent",
      "permission": [],
      "prompt": "...",
      "model": null,
      "mode": "primary"
    }
  ]
}
```

### MCP 配置

配置文件: `opencode.json`

```json
{
  "mcp": {
    "servers": {
      "server-name": {
        "type": "local",
        "command": ["node", "server.js"],
        "enabled": true
      }
    }
  }
}
```

### Skills 配置

Skills 目录: `skills/`

每个技能是一个 Markdown 文件，包含技能描述和使用说明。

## 扩展点

### 添加新工具

1. 在 `src/tool/builtin/` 创建新工具文件
2. 使用 `Tool.define()` 定义工具
3. 在 `src/tool/builtin/index.ts` 导出工具
4. 工具会自动注册到工具注册表

### 添加新 Agent

1. 在 Agent 配置中添加新 Agent
2. 配置权限规则和提示词
3. Agent 会自动注册到 Agent 注册表

### 添加 MCP 服务器

1. 在 MCP 配置中添加服务器配置
2. MCP 客户端会自动连接并发现工具

## 测试

### 单元测试

- 位置: `src/**/*.test.ts`
- 覆盖率目标: > 80%

### 集成测试

- 位置: `src/__tests__/integration/`
- 测试端到端流程

## 性能优化

### 会话存储

- 使用增量更新减少存储开销
- 支持会话压缩（compaction）

### 工具执行

- 异步执行工具调用
- 并发控制避免资源竞争

### 流式响应

- 使用流式处理减少内存占用
- 增量更新消息内容

## 安全考虑

### 权限控制

- 细粒度权限检查
- 用户确认机制
- 权限规则持久化

### 代码执行

- 命令执行权限检查
- 文件操作权限检查
- 敏感操作确认

## 参考

- [OpenCode 架构](https://github.com/opencode-ai/opencode)
- [MCP 规范](https://modelcontextprotocol.io/)
