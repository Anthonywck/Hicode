# HiCode AI Assistant - 用户指南

## 目录

1. [简介](#简介)
2. [功能概览](#功能概览)
3. [快速开始](#快速开始)
4. [配置指南](#配置指南)
5. [功能使用说明](#功能使用说明)
6. [快捷命令参考](#快捷命令参考)
7. [故障排查](#故障排查)
8. [常见问题](#常见问题)

---

## 简介

HiCode AI Assistant 是一款强大的 VSCode 扩展，集成了多个主流大语言模型（DeepSeek、ChatGPT、智谱AI），为开发者提供智能化的编程辅助功能。

### 核心功能

- **普通问答**：在侧边栏聊天界面与 AI 进行对话
- **代码补全**：AI 驱动的智能代码补全建议
- **内联聊天**：在编辑器中直接与 AI 交互
- **Agent 系统**：自动化执行编程任务（重构、测试生成、文档编写等）

---

## 功能概览

### 1. 聊天界面（Chat）

在 VSCode 侧边栏中与 AI 进行对话，获取编程帮助和建议。

**特性：**
- 流式响应显示
- Markdown 格式支持
- 代码高亮显示
- 对话历史保存
- 自动包含选中代码作为上下文

### 2. 代码补全（Code Completion）

在编写代码时自动获得 AI 驱动的智能补全建议。

**特性：**
- 上下文感知补全
- 多行代码建议
- 500ms 内响应
- 支持多种编程语言

### 3. 内联聊天（Inline Chat）

在编辑器中直接与 AI 交互，无需离开编辑上下文。

**特性：**
- 代码选择后即时交互
- 差异预览（Diff Preview）
- 快捷命令支持
- 智能意图识别
- 自动路由到 Chat 或 Agent

### 4. Agent 系统（Ambient Programming）

AI 作为智能代理自动执行编程任务。

**特性：**
- 代码重构
- 测试生成
- 文档编写
- 代码修复
- 性能优化
- 预览和撤销支持

---

## 快速开始

### 安装

1. 在 VSCode 扩展市场搜索 "HiCode AI Assistant"
2. 点击"安装"按钮
3. 重启 VSCode（如需要）

### 首次配置

1. 打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）
2. 输入 "HiCode: Configure AI Models"
3. 添加至少一个 AI 模型配置：
   - 模型 ID：唯一标识符（如 `deepseek-chat`）
   - 模型名称：API 模型名称
   - 显示名称：UI 中显示的名称
   - 供应商：选择 `deepseek`、`openai`、`zhipuai` 或 `custom`
   - API Base URL：API 端点地址
   - API Key：您的 API 密钥（安全存储）

### 第一次使用

1. **打开聊天界面**：
   - 快捷键：`Ctrl+Shift+H` / `Cmd+Shift+H`
   - 或命令面板：`HiCode: Open Chat`

2. **尝试内联聊天**：
   - 选中一段代码
   - 快捷键：`Ctrl+Shift+I` / `Cmd+Shift+I`
   - 输入问题或使用快捷命令（如 `/explain`）

3. **体验代码补全**：
   - 开始编写代码
   - 补全建议会自动出现
   - 或手动触发：`Ctrl+Space` / `Cmd+Space`

---

## 配置指南

### 模型配置

#### 添加 DeepSeek 模型

```json
{
  "modelId": "deepseek-chat",
  "modelName": "deepseek-chat",
  "displayName": "DeepSeek Chat",
  "vendor": "deepseek",
  "apiBaseUrl": "https://api.deepseek.com/v1",
  "maxContextTokens": 32000,
  "supportMultimodal": false
}
```

#### 添加 OpenAI 模型

```json
{
  "modelId": "gpt-4",
  "modelName": "gpt-4",
  "displayName": "GPT-4",
  "vendor": "openai",
  "apiBaseUrl": "https://api.openai.com/v1",
  "maxContextTokens": 8000,
  "supportMultimodal": true
}
```

#### 添加智谱 AI 模型

```json
{
  "modelId": "glm-4",
  "modelName": "glm-4",
  "displayName": "GLM-4",
  "vendor": "zhipuai",
  "apiBaseUrl": "https://open.bigmodel.cn/api/paas/v4",
  "maxContextTokens": 128000,
  "supportMultimodal": true
}
```

### 扩展设置

在 VSCode 设置中搜索 "HiCode" 可以找到所有配置项：

#### 功能开关

- `hicode.enableInlineChat`：启用内联聊天（默认：true）
- `hicode.enableCodeCompletion`：启用代码补全（默认：true）
- `hicode.enableAgent`：启用 Agent 系统（默认：true）

#### 性能设置

- `hicode.completionDelay`：补全触发延迟（毫秒，默认：300）
- `hicode.completionMaxTokens`：补全最大 token 数（默认：500）
- `hicode.contextMaxTokens`：上下文最大 token 数（默认：4000）
- `hicode.enableContextCache`：启用上下文缓存（默认：true）

#### 网络设置

- `hicode.requestTimeout`：API 请求超时（毫秒，默认：30000）
- `hicode.maxRetries`：最大重试次数（默认：3）

#### 安全和隐私

- `hicode.enableLocalMode`：启用本地模式（默认：false）
- `hicode.requireAuthorization`：发送代码前需要授权（默认：true）

#### 日志和调试

- `hicode.logLevel`：日志级别（debug/info/warn/error，默认：info）
- `hicode.enableDebugMode`：启用调试模式（默认：false）

#### 历史记录

- `hicode.autoSaveHistory`：自动保存对话历史（默认：true）
- `hicode.maxHistorySessions`：最大保存会话数（默认：100）

---

## 功能使用说明

### 聊天界面使用

#### 基本对话

1. 打开聊天界面（`Ctrl+Shift+H` / `Cmd+Shift+H`）
2. 在输入框中输入问题
3. 按 Enter 发送
4. AI 响应会流式显示

#### 包含代码上下文

1. 在编辑器中选中代码
2. 打开聊天界面
3. 输入问题，选中的代码会自动作为上下文发送

#### 管理对话

- **新建对话**：`Ctrl+Shift+N` / `Cmd+Shift+N`
- **查看历史**：命令面板 → `HiCode: Show Conversation History`
- **切换模型**：命令面板 → `HiCode: Switch AI Model`

#### Markdown 支持

聊天界面支持完整的 Markdown 格式：

- 代码块会自动高亮
- 支持表格、列表、链接等
- 可以复制代码块内容

### 内联聊天使用指南

内联聊天是 HiCode 的核心功能之一，让您无需离开编辑器即可与 AI 交互。

#### 启动内联聊天

**方法 1：快捷键**
1. 选中代码（可选）
2. 按 `Ctrl+Shift+I` / `Cmd+Shift+I`
3. 输入问题或命令

**方法 2：右键菜单**
1. 选中代码
2. 右键点击
3. 选择 "HiCode: Show Inline Chat"

**方法 3：命令面板**
1. 打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）
2. 输入 "HiCode: Show Inline Chat"

#### 使用快捷命令

内联聊天支持快捷命令，快速触发特定操作：

- `/refactor` - 重构选中的代码
- `/test` - 为选中的代码生成测试
- `/explain` - 解释选中的代码
- `/doc` - 生成文档注释
- `/fix` - 修复代码问题
- `/optimize` - 优化代码性能

**示例：**
```
选中一个函数 → Ctrl+Shift+I → 输入 "/test" → Enter
```

#### 查看和应用建议

当 AI 返回代码建议时：

1. **差异预览**：会自动显示原代码和建议代码的对比
2. **选择操作**：
   - **接受**：应用建议到编辑器
   - **拒绝**：关闭预览，保持原代码
   - **在 Chat 中继续讨论**：转到聊天界面深入讨论

#### 意图识别和自动路由

内联聊天会智能识别您的意图：

- **简单问答**：直接在内联显示答案
- **代码操作**：自动调用 Agent 系统执行
- **复杂讨论**：自动转到 Chat 侧边栏
- **代码解释**：在单独窗口显示详细解释

**示例：**
- 输入 "重构这个函数" → 自动调用 Agent 重构
- 输入 "详细解释这段代码的工作原理" → 转到 Chat
- 输入 "这里有什么问题？" → 内联显示简短答案

#### 多轮对话

内联聊天支持多轮对话：

1. 第一次提问后，可以继续追问
2. 对话历史会保持
3. 会话结束后自动保存到历史记录

### 代码补全使用

#### 自动触发

代码补全会在您输入时自动触发：

1. 开始输入代码
2. 等待 300ms（可配置）
3. 补全建议自动出现
4. 使用 Tab 或 Enter 接受建议

#### 手动触发

如果补全没有自动出现：

1. 按 `Ctrl+Space` / `Cmd+Space`
2. 或使用命令：`HiCode: Trigger AI Completion`

#### 补全上下文

补全会自动分析：
- 当前文件的导入语句
- 函数和类定义
- 变量声明
- 光标前后的代码

#### 拒绝建议

如果补全建议不合适：
- 按 Esc 关闭
- 继续输入会自动关闭
- 拒绝记录会用于改进建议质量

### Agent 系统使用

#### 可用的 Agent 任务

1. **代码重构**（`Ctrl+Shift+R` / `Cmd+Shift+R`）
   - 改善代码结构
   - 提高可读性
   - 应用最佳实践

2. **生成测试**（`Ctrl+Shift+T` / `Cmd+Shift+T`）
   - 为函数生成单元测试
   - 覆盖边界情况
   - 遵循测试框架规范

3. **解释代码**（`Ctrl+Shift+E` / `Cmd+Shift+E`）
   - 详细解释代码功能
   - 说明实现原理
   - 指出潜在问题

4. **生成文档**（`Ctrl+Shift+D` / `Cmd+Shift+D`）
   - 生成函数/类注释
   - 符合文档规范
   - 包含参数和返回值说明

5. **修复代码**（`Ctrl+Shift+F` / `Cmd+Shift+F`）
   - 识别并修复错误
   - 改进代码逻辑
   - 处理边界情况

6. **优化性能**（`Ctrl+Shift+O` / `Cmd+Shift+O`）
   - 改进算法效率
   - 减少资源消耗
   - 优化数据结构

#### 使用 Agent 的步骤

1. **选中代码**：选择要处理的代码片段
2. **触发 Agent**：使用快捷键或右键菜单
3. **查看预览**：Agent 会显示建议的更改（diff 视图）
4. **确认或拒绝**：
   - 点击"接受"应用更改
   - 点击"拒绝"取消操作
5. **撤销（如需要）**：`Ctrl+Shift+Z` / `Cmd+Shift+Z`

#### 自定义 Agent 任务

您可以创建自定义 Agent 任务模板：

1. 打开设置
2. 搜索 `hicode.customAgentTasks`
3. 添加自定义任务配置

---

## 快捷命令参考

### 全局快捷键

| 功能 | Windows/Linux | macOS |
|------|---------------|-------|
| 打开聊天 | `Ctrl+Shift+H` | `Cmd+Shift+H` |
| 内联聊天 | `Ctrl+Shift+I` | `Cmd+Shift+I` |
| 新建对话 | `Ctrl+Shift+N` | `Cmd+Shift+N` |
| 触发补全 | `Ctrl+Space` | `Cmd+Space` |
| 撤销 Agent 操作 | `Ctrl+Shift+Z` | `Cmd+Shift+Z` |

### Agent 快捷键（需要选中代码）

| 功能 | Windows/Linux | macOS |
|------|---------------|-------|
| 重构代码 | `Ctrl+Shift+R` | `Cmd+Shift+R` |
| 生成测试 | `Ctrl+Shift+T` | `Cmd+Shift+T` |
| 解释代码 | `Ctrl+Shift+E` | `Cmd+Shift+E` |
| 生成文档 | `Ctrl+Shift+D` | `Cmd+Shift+D` |
| 修复代码 | `Ctrl+Shift+F` | `Cmd+Shift+F` |
| 优化性能 | `Ctrl+Shift+O` | `Cmd+Shift+O` |

### 内联聊天快捷命令

在内联聊天输入框中输入：

| 命令 | 功能 |
|------|------|
| `/refactor` | 重构选中的代码 |
| `/test` | 生成测试代码 |
| `/explain` | 解释代码功能 |
| `/doc` | 生成文档注释 |
| `/fix` | 修复代码问题 |
| `/optimize` | 优化代码性能 |

### 命令面板命令

打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`），输入：

- `HiCode: Open Chat` - 打开聊天界面
- `HiCode: Show Inline Chat` - 显示内联聊天
- `HiCode: New Conversation` - 新建对话
- `HiCode: Show Conversation History` - 查看历史记录
- `HiCode: Switch AI Model` - 切换 AI 模型
- `HiCode: Configure AI Models` - 配置 AI 模型
- `HiCode: Trigger AI Completion` - 触发代码补全
- `HiCode: Undo Last Agent Action` - 撤销最后的 Agent 操作
- `HiCode: Quick Refactor` - 快速重构
- `HiCode: Generate Tests` - 生成测试
- `HiCode: Explain Code` - 解释代码
- `HiCode: Generate Documentation` - 生成文档
- `HiCode: Fix Code` - 修复代码
- `HiCode: Optimize Code` - 优化代码

---

## 故障排查

### 常见问题和解决方案

#### 1. 扩展激活失败

**症状**：VSCode 启动后扩展无法使用

**解决方案**：
1. 检查 VSCode 版本（需要 >= 1.85.0）
2. 查看输出面板（View → Output → HiCode）
3. 重启 VSCode
4. 重新安装扩展

#### 2. API 调用失败

**症状**：聊天或补全无响应，显示错误

**可能原因和解决方案**：

**API 密钥无效**
- 检查 API 密钥是否正确
- 重新输入 API 密钥
- 确认密钥有足够的配额

**网络连接问题**
- 检查网络连接
- 检查防火墙设置
- 尝试使用代理（如需要）

**API 端点错误**
- 确认 API Base URL 正确
- 检查模型名称是否匹配

**超时**
- 增加 `hicode.requestTimeout` 设置
- 检查网络速度

#### 3. 代码补全不工作

**症状**：输入代码时没有补全建议

**解决方案**：
1. 确认 `hicode.enableCodeCompletion` 为 true
2. 检查是否选择了当前模型
3. 手动触发补全（`Ctrl+Space`）
4. 查看输出面板的错误信息
5. 增加 `hicode.completionDelay` 值

#### 4. 内联聊天无响应

**症状**：按快捷键后没有反应

**解决方案**：
1. 确认 `hicode.enableInlineChat` 为 true
2. 确认光标在编辑器中
3. 检查快捷键是否冲突
4. 使用命令面板触发
5. 查看输出面板的错误信息

#### 5. Agent 操作失败

**症状**：Agent 任务执行失败或结果不正确

**解决方案**：
1. 确认 `hicode.enableAgent` 为 true
2. 确认选中了有效的代码
3. 检查 API 配额
4. 尝试使用不同的模型
5. 查看详细错误信息

#### 6. 性能问题

**症状**：扩展响应缓慢，VSCode 卡顿

**解决方案**：
1. 启用上下文缓存：`hicode.enableContextCache: true`
2. 减少上下文大小：降低 `hicode.contextMaxTokens`
3. 增加补全延迟：增加 `hicode.completionDelay`
4. 关闭不需要的功能
5. 检查系统资源使用情况

#### 7. 历史记录丢失

**症状**：对话历史无法找到

**解决方案**：
1. 确认 `hicode.autoSaveHistory` 为 true
2. 检查 VSCode 存储目录权限
3. 尝试导出/导入会话
4. 检查是否达到最大会话数限制

### 调试模式

启用调试模式获取详细信息：

1. 打开设置
2. 设置 `hicode.enableDebugMode: true`
3. 设置 `hicode.logLevel: "debug"`
4. 查看输出面板（View → Output → HiCode）
5. 复制日志信息用于问题报告

### 导出日志

如需报告问题：

1. 启用调试模式
2. 重现问题
3. 打开输出面板
4. 复制相关日志
5. 在 GitHub 提交 Issue

---

## 常见问题

### Q: HiCode 支持哪些编程语言？

A: HiCode 支持所有主流编程语言，包括但不限于：
- JavaScript/TypeScript
- Python
- Java
- C/C++
- Go
- Rust
- PHP
- Ruby
- 等等

代码补全和 Agent 功能会根据语言自动调整。

### Q: API 密钥如何存储？安全吗？

A: API 密钥使用 VSCode 的 SecretStorage API 安全存储，采用系统级加密。密钥不会出现在日志或配置文件中。

### Q: 可以使用自托管的模型吗？

A: 可以。设置 `hicode.enableLocalMode: true`，然后配置自定义模型，将 `apiBaseUrl` 指向您的本地服务。

### Q: 代码会被发送到哪里？

A: 代码会发送到您配置的 AI 模型 API 端点。如果启用了 `hicode.requireAuthorization`，每次发送前都会请求您的授权。

### Q: 如何切换不同的 AI 模型？

A: 使用命令 `HiCode: Switch AI Model` 或在聊天界面的模型选择器中切换。

### Q: 补全建议的质量如何提高？

A: 
- 确保代码上下文清晰（良好的命名、注释）
- 选择更强大的模型（如 GPT-4）
- 增加 `hicode.contextMaxTokens` 提供更多上下文
- 拒绝不好的建议（系统会学习）

### Q: Agent 操作可以撤销吗？

A: 可以。使用 `Ctrl+Shift+Z` / `Cmd+Shift+Z` 或命令 `HiCode: Undo Last Agent Action` 撤销最后的操作。

### Q: 如何导出对话历史？

A: 使用命令 `HiCode: Show Conversation History`，选择会话，然后选择"导出"选项。

### Q: 扩展会影响 VSCode 性能吗？

A: HiCode 采用延迟加载和缓存机制，确保激活时间在 1 秒内，对性能影响最小。如果遇到性能问题，请参考故障排查部分。

### Q: 支持团队共享配置吗？

A: 可以。将模型配置（不包括 API 密钥）添加到工作区设置（`.vscode/settings.json`），团队成员可以共享配置，但需要各自输入 API 密钥。

### Q: 如何报告 Bug 或请求新功能？

A: 请在 GitHub 仓库提交 Issue，包含：
- 问题描述
- 重现步骤
- 预期行为
- 实际行为
- 日志信息（如有）
- VSCode 和扩展版本

---

## 更多资源

- **GitHub 仓库**：[链接]
- **问题反馈**：[链接]
- **更新日志**：[链接]
- **API 文档**：[链接]

---

**版本**：0.1.0  
**最后更新**：2024-01-01
