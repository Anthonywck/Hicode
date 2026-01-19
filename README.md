# HiCode AI Assistant

<div align="center">

**A powerful VSCode extension integrating multiple AI models for intelligent code assistance**

[English](#english) | [中文](#中文)

</div>

---

<a name="english"></a>
## English

### Overview

HiCode AI Assistant is a comprehensive VSCode extension that integrates multiple AI models (DeepSeek, OpenAI, ZhipuAI) to provide intelligent programming assistance. It offers conversational AI chat, code completion, inline chat, and an automated Agent system for various programming tasks.

### Features

#### 🗨️ Chat Interface
- **Conversational AI**: Interactive chat in VSCode sidebar
- **Streaming Responses**: Real-time streaming of AI responses
- **Markdown Support**: Rich markdown rendering with code highlighting
- **Conversation History**: Automatic history management and persistence
- **Context Awareness**: Automatically includes selected code as context

#### 💡 Code Completion
- **AI-Powered Suggestions**: Context-aware intelligent code completions
- **Multi-line Support**: Suggestions spanning multiple lines
- **Fast Response**: Sub-500ms response time
- **Language Support**: Works with all major programming languages

#### 💬 Inline Chat
- **Editor Integration**: Interact with AI directly in the editor
- **Diff Preview**: Visual diff preview for code suggestions
- **Quick Commands**: Shortcut commands (`/refactor`, `/test`, `/explain`, etc.)
- **Intent Recognition**: Smart routing to Chat or Agent based on intent
- **Multi-turn Conversations**: Support for follow-up questions

#### 🤖 Agent System
Automated programming tasks with preview and undo support:
- **Refactor**: Improve code structure and readability
- **Test Generation**: Generate unit tests automatically
- **Documentation**: Create documentation comments
- **Bug Fixing**: Identify and fix code issues
- **Optimization**: Improve code performance

#### 🔄 Multi-Model Support
- **DeepSeek**: DeepSeek Chat, DeepSeek Coder
- **OpenAI**: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- **ZhipuAI**: GLM-4, GLM-3 Turbo
- **Custom Models**: Self-hosted models with OpenAI-compatible API

### Quick Start

#### Installation

1. Install from VSCode Marketplace
   - Search for "HiCode AI Assistant"
   - Click "Install"
   - Reload VSCode if needed

2. Configure AI Models
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run `HiCode: Configure AI Models`
   - Add at least one AI model configuration with API key

#### First Use

**Open Chat**: `Ctrl+Shift+H` / `Cmd+Shift+H`  
**Inline Chat**: Select code, then `Ctrl+Shift+I` / `Cmd+Shift+I`  
**Code Completion**: Start typing, suggestions appear automatically  
**Agent Actions**: Select code, then use shortcuts (see below)

### Keyboard Shortcuts

#### Global Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Open Chat | `Ctrl+Shift+H` | `Cmd+Shift+H` |
| Inline Chat | `Ctrl+Shift+I` | `Cmd+Shift+I` |
| Trigger Completion | `Ctrl+Space` | `Cmd+Space` |
| Undo Agent Action | `Ctrl+Shift+Z` | `Cmd+Shift+Z` |
| Confirm Code Change | `Ctrl+Shift+Y` | `Cmd+Shift+Y` |
| Cancel Code Change | `Ctrl+Shift+N` | `Cmd+Shift+N` |

#### Agent Shortcuts (with code selected)

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Refactor | `Ctrl+Shift+R` | `Cmd+Shift+R` |
| Generate Tests | `Ctrl+Shift+T` | `Cmd+Shift+T` |
| Explain Code | `Ctrl+Shift+E` | `Cmd+Shift+E` |
| Generate Docs | `Ctrl+Shift+D` | `Cmd+Shift+D` |
| Fix Code | `Ctrl+Shift+F` | `Cmd+Shift+F` |
| Optimize Code | `Ctrl+Shift+O` | `Cmd+Shift+O` |

See [Shortcuts Reference](docs/shortcuts-reference.md) for complete list.

### Configuration

#### Model Configuration Example

```json
{
  "hicode.modelConfigs": [
    {
      "modelId": "deepseek-chat",
      "modelName": "deepseek-chat",
      "displayName": "DeepSeek Chat",
      "vendor": "deepseek",
      "apiBaseUrl": "https://api.deepseek.com/v1",
      "maxContextTokens": 32000,
      "supportMultimodal": false
    }
  ],
  "hicode.currentModel": "deepseek-chat",
  "hicode.chatMode": "chat",
  "hicode.enableInlineChat": true,
  "hicode.enableCodeCompletion": true,
  "hicode.enableAgent": true
}
```

#### Key Configuration Options

- `hicode.modelConfigs`: Array of AI model configurations
- `hicode.currentModel`: Currently selected model ID
- `hicode.chatMode`: `"chat"` or `"agent"` mode
- `hicode.enableInlineChat`: Enable/disable inline chat
- `hicode.enableCodeCompletion`: Enable/disable code completion
- `hicode.enableAgent`: Enable/disable Agent system
- `hicode.completionDelay`: Delay before triggering completion (ms)
- `hicode.completionMaxTokens`: Maximum tokens for completions
- `hicode.contextMaxTokens`: Maximum tokens for code context
- `hicode.requireAuthorization`: Require authorization before sending code

See [Configuration Guide](docs/configuration-guide.md) for detailed options.

### Development

#### Prerequisites

- Node.js >= 18.x
- VSCode >= 1.85.0
- TypeScript >= 5.3.3

#### Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode for development
npm run watch
```

#### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

#### Packaging

Before packaging the extension, ensure that:

1. **Build the frontend assets** (if using hicode-vue):
   ```bash
   cd ../hicode-vue
   pnpm install
   pnpm run build:copy  # This builds and copies assets to hicode/media/
   cd ../hicode
   ```

2. **Build the extension**:
   ```bash
   npm run build
   ```

3. **Package the extension**:
   ```bash
   # Package with current version
   npm run package

   # Package with version bump
   npm run package:major  # 1.0.0 -> 2.0.0
   npm run package:minor  # 1.0.0 -> 1.1.0
   npm run package:patch  # 1.0.0 -> 1.0.1
   ```

   This will create a `.vsix` file in the project root (e.g., `hicode-ai-integration-0.1.0.vsix`).

4. **Install the packaged extension**:
   ```bash
   # Install locally for testing
   code --install-extension hicode-ai-integration-0.1.0.vsix

   # Or use VS Code: Extensions > ... > Install from VSIX...
   ```

5. **Publish to VS Code Marketplace** (optional):
   ```bash
   # First, install vsce globally if not already installed
   npm install -g @vscode/vsce

   # Login to VS Code Marketplace
   vsce login <publisher-name>

   # Publish
   vsce publish
   ```

**Note**: Make sure the `media/` directory contains the built frontend assets before packaging. The `.vscodeignore` file excludes source files but includes the necessary built assets.

#### Project Structure

```
.
├── src/                    # Source code
│   ├── api/               # API client and adapters
│   │   ├── adapters/      # Model-specific adapters
│   │   ├── client.ts      # API client manager
│   │   └── types.ts       # Type definitions
│   ├── agent/             # Agent system
│   │   ├── executor.ts    # Task executor
│   │   ├── system.ts      # Agent system core
│   │   └── tasks.ts        # Task definitions
│   ├── commands/          # Command handlers
│   │   ├── handlers.ts    # Command implementations
│   │   └── commandManager.ts
│   ├── config/            # Configuration management
│   │   ├── manager.ts     # Config manager
│   │   └── modelManager.ts
│   ├── context/           # Context management
│   │   ├── analyzer.ts    # Code analyzer
│   │   ├── cache.ts       # Context cache
│   │   └── manager.ts     # Context manager
│   ├── history/           # Conversation history
│   │   └── manager.ts     # History manager
│   ├── intent/            # Intent routing
│   │   └── router.ts      # Intent router
│   ├── message/           # Message handling
│   │   ├── messageHandler.ts
│   │   ├── webviewMessageHandler.ts
│   │   └── markdownRenderer.ts
│   ├── providers/         # VSCode providers
│   │   ├── completionProvider.ts
│   │   └── inline.ts      # Inline chat provider
│   ├── prompts/           # Prompt templates
│   ├── security/          # Security features
│   │   ├── authorization.ts
│   │   └── localMode.ts
│   ├── utils/             # Utilities
│   │   ├── logger.ts      # Logging
│   │   └── codeDiffPreview.ts
│   └── extension.ts       # Extension entry point
├── docs/                  # Documentation
│   ├── user-guide.md
│   ├── configuration-guide.md
│   ├── troubleshooting.md
│   └── shortcuts-reference.md
├── dist/                  # Compiled output
├── media/                 # Webview assets (built from hicode-vue)
├── jest.config.js         # Jest configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Project dependencies
```

### Testing Framework

This project uses:
- **Jest**: Testing framework with TypeScript support via ts-jest
- **fast-check**: Property-based testing library for comprehensive test coverage
- **axios**: HTTP client for API requests
- **eventsource**: Server-Sent Events client for streaming responses

See [Testing Guide](docs/testing-guide.md) for testing best practices.

### Security and Privacy

- **Secure Storage**: API keys stored using VSCode SecretStorage
- **Authorization**: Optional authorization before sending code to AI
- **Local Mode**: Support for local/self-hosted models
- **Log Filtering**: Sensitive information filtered from logs
- **Privacy Control**: User controls what code is sent to AI

### Documentation

- **[User Guide](docs/user-guide.md)** - Complete feature documentation and usage instructions
- **[Configuration Guide](docs/configuration-guide.md)** - Detailed configuration options and examples
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions
- **[Shortcuts Reference](docs/shortcuts-reference.md)** - Quick reference for all keyboard shortcuts
- **[Testing Guide](docs/testing-guide.md)** - Testing framework and guidelines

### Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

### Support

- **Documentation**: See [docs/](docs/) directory
- **Issues**: Report bugs on GitHub Issues
- **Discussions**: Join GitHub Discussions for questions

### License

[License information]

---

<a name="中文"></a>
## 中文

### 概述

HiCode AI Assistant 是一款功能强大的 VSCode 扩展，集成了多个 AI 模型（DeepSeek、OpenAI、智谱AI），为开发者提供智能化的编程辅助功能。它提供对话式 AI 聊天、代码补全、内联聊天以及用于各种编程任务的自动化 Agent 系统。

### 功能特性

#### 🗨️ 聊天界面
- **对话式 AI**：在 VSCode 侧边栏中进行交互式聊天
- **流式响应**：AI 响应的实时流式传输
- **Markdown 支持**：丰富的 Markdown 渲染和代码高亮
- **对话历史**：自动历史管理和持久化
- **上下文感知**：自动包含选中的代码作为上下文

#### 💡 代码补全
- **AI 驱动建议**：上下文感知的智能代码补全
- **多行支持**：跨多行的代码建议
- **快速响应**：500 毫秒内响应
- **语言支持**：支持所有主流编程语言

#### 💬 内联聊天
- **编辑器集成**：直接在编辑器中与 AI 交互
- **差异预览**：代码建议的可视化差异预览
- **快捷命令**：快捷命令（`/refactor`、`/test`、`/explain` 等）
- **意图识别**：根据意图智能路由到聊天或 Agent
- **多轮对话**：支持后续问题

#### 🤖 Agent 系统
支持预览和撤销的自动化编程任务：
- **重构**：改进代码结构和可读性
- **测试生成**：自动生成单元测试
- **文档编写**：创建文档注释
- **错误修复**：识别并修复代码问题
- **性能优化**：改进代码性能

#### 🔄 多模型支持
- **DeepSeek**：DeepSeek Chat、DeepSeek Coder
- **OpenAI**：GPT-4、GPT-4 Turbo、GPT-3.5 Turbo
- **智谱AI**：GLM-4、GLM-3 Turbo
- **自定义模型**：支持 OpenAI 兼容 API 的自托管模型

### 快速开始

#### 安装

1. 从 VSCode 市场安装
   - 搜索 "HiCode AI Assistant"
   - 点击"安装"
   - 如需要，重新加载 VSCode

2. 配置 AI 模型
   - 打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）
   - 运行 `HiCode: Configure AI Models`
   - 添加至少一个带有 API 密钥的 AI 模型配置

#### 首次使用

**打开聊天**：`Ctrl+Shift+H` / `Cmd+Shift+H`  
**内联聊天**：选择代码，然后 `Ctrl+Shift+I` / `Cmd+Shift+I`  
**代码补全**：开始输入，建议会自动出现  
**Agent 操作**：选择代码，然后使用快捷键（见下方）

### 键盘快捷键

#### 全局快捷键

| 操作 | Windows/Linux | macOS |
|------|---------------|-------|
| 打开聊天 | `Ctrl+Shift+H` | `Cmd+Shift+H` |
| 内联聊天 | `Ctrl+Shift+I` | `Cmd+Shift+I` |
| 触发补全 | `Ctrl+Space` | `Cmd+Space` |
| 撤销 Agent 操作 | `Ctrl+Shift+Z` | `Cmd+Shift+Z` |
| 确认代码更改 | `Ctrl+Shift+Y` | `Cmd+Shift+Y` |
| 取消代码更改 | `Ctrl+Shift+N` | `Cmd+Shift+N` |

#### Agent 快捷键（选中代码时）

| 操作 | Windows/Linux | macOS |
|------|---------------|-------|
| 重构 | `Ctrl+Shift+R` | `Cmd+Shift+R` |
| 生成测试 | `Ctrl+Shift+T` | `Cmd+Shift+T` |
| 解释代码 | `Ctrl+Shift+E` | `Cmd+Shift+E` |
| 生成文档 | `Ctrl+Shift+D` | `Cmd+Shift+D` |
| 修复代码 | `Ctrl+Shift+F` | `Cmd+Shift+F` |
| 优化代码 | `Ctrl+Shift+O` | `Cmd+Shift+O` |

完整列表请参见[快捷键参考](docs/shortcuts-reference.md)。

### 配置

#### 模型配置示例

```json
{
  "hicode.modelConfigs": [
    {
      "modelId": "deepseek-chat",
      "modelName": "deepseek-chat",
      "displayName": "DeepSeek Chat",
      "vendor": "deepseek",
      "apiBaseUrl": "https://api.deepseek.com/v1",
      "maxContextTokens": 32000,
      "supportMultimodal": false
    }
  ],
  "hicode.currentModel": "deepseek-chat",
  "hicode.chatMode": "chat",
  "hicode.enableInlineChat": true,
  "hicode.enableCodeCompletion": true,
  "hicode.enableAgent": true
}
```

#### 主要配置选项

- `hicode.modelConfigs`：AI 模型配置数组
- `hicode.currentModel`：当前选中的模型 ID
- `hicode.chatMode`：`"chat"` 或 `"agent"` 模式
- `hicode.enableInlineChat`：启用/禁用内联聊天
- `hicode.enableCodeCompletion`：启用/禁用代码补全
- `hicode.enableAgent`：启用/禁用 Agent 系统
- `hicode.completionDelay`：触发补全前的延迟（毫秒）
- `hicode.completionMaxTokens`：补全的最大 token 数
- `hicode.contextMaxTokens`：代码上下文的最大 token 数
- `hicode.requireAuthorization`：发送代码前是否需要授权

详细选项请参见[配置指南](docs/configuration-guide.md)。

### 开发

#### 前置要求

- Node.js >= 18.x
- VSCode >= 1.85.0
- TypeScript >= 5.3.3

#### 设置

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 开发模式（监听文件变化）
npm run watch
```

#### 测试

```bash
# 运行所有测试
npm test

# 监听模式运行测试
npm run test:watch

# 运行测试并生成覆盖率报告
npm run test:coverage
```

#### 打包插件

打包扩展前，请确保：

1. **构建前端资源**（如果使用 hicode-vue）：
   ```bash
   cd ../hicode-vue
   pnpm install
   pnpm run build:copy  # 这会构建并将资源复制到 hicode/media/
   cd ../hicode
   ```

2. **构建扩展**：
   ```bash
   npm run build
   ```

3. **打包扩展**：
   ```bash
   # 使用当前版本打包
   npm run package

   # 打包并更新版本号
   npm run package:major  # 1.0.0 -> 2.0.0
   npm run package:minor  # 1.0.0 -> 1.1.0
   npm run package:patch  # 1.0.0 -> 1.0.1
   ```

   这将在项目根目录创建一个 `.vsix` 文件（例如：`hicode-ai-integration-0.1.0.vsix`）。

4. **安装打包的扩展**：
   ```bash
   # 本地安装用于测试
   code --install-extension hicode-ai-integration-0.1.0.vsix

   # 或使用 VS Code：扩展 > ... > 从 VSIX 安装...
   ```

5. **发布到 VS Code 市场**（可选）：
   ```bash
   # 首先，如果尚未安装，全局安装 vsce
   npm install -g @vscode/vsce

   # 登录 VS Code 市场
   vsce login <发布者名称>

   # 发布
   vsce publish
   ```

**注意**：打包前请确保 `media/` 目录包含构建好的前端资源。`.vscodeignore` 文件会排除源文件，但会包含必要的构建资源。

#### 项目结构

```
.
├── src/                    # 源代码
│   ├── api/               # API 客户端和适配器
│   │   ├── adapters/      # 模型特定适配器
│   │   ├── client.ts      # API 客户端管理器
│   │   └── types.ts       # 类型定义
│   ├── agent/             # Agent 系统
│   │   ├── executor.ts    # 任务执行器
│   │   ├── system.ts      # Agent 系统核心
│   │   └── tasks.ts        # 任务定义
│   ├── commands/          # 命令处理器
│   │   ├── handlers.ts    # 命令实现
│   │   └── commandManager.ts
│   ├── config/            # 配置管理
│   │   ├── manager.ts     # 配置管理器
│   │   └── modelManager.ts
│   ├── context/           # 上下文管理
│   │   ├── analyzer.ts    # 代码分析器
│   │   ├── cache.ts       # 上下文缓存
│   │   └── manager.ts     # 上下文管理器
│   ├── history/           # 对话历史
│   │   └── manager.ts     # 历史管理器
│   ├── intent/            # 意图路由
│   │   └── router.ts      # 意图路由器
│   ├── message/           # 消息处理
│   │   ├── messageHandler.ts
│   │   ├── webviewMessageHandler.ts
│   │   └── markdownRenderer.ts
│   ├── providers/         # VSCode 提供器
│   │   ├── completionProvider.ts
│   │   └── inline.ts      # 内联聊天提供器
│   ├── prompts/           # 提示模板
│   ├── security/          # 安全功能
│   │   ├── authorization.ts
│   │   └── localMode.ts
│   ├── utils/             # 工具函数
│   │   ├── logger.ts      # 日志记录
│   │   └── codeDiffPreview.ts
│   └── extension.ts       # 扩展入口点
├── docs/                  # 文档
│   ├── user-guide.md
│   ├── configuration-guide.md
│   ├── troubleshooting.md
│   └── shortcuts-reference.md
├── dist/                  # 编译输出
├── media/                 # Webview 资源（从 hicode-vue 构建）
├── jest.config.js         # Jest 配置
├── tsconfig.json          # TypeScript 配置
└── package.json           # 项目依赖
```

### 测试框架

本项目使用：
- **Jest**：通过 ts-jest 支持 TypeScript 的测试框架
- **fast-check**：用于全面测试覆盖的属性测试库
- **axios**：用于 API 请求的 HTTP 客户端
- **eventsource**：用于流式响应的服务器发送事件客户端

测试最佳实践请参见[测试指南](docs/testing-guide.md)。

### 安全与隐私

- **安全存储**：使用 VSCode SecretStorage 存储 API 密钥
- **授权机制**：在发送代码到 AI 前可选的授权
- **本地模式**：支持本地/自托管模型
- **日志过滤**：从日志中过滤敏感信息
- **隐私控制**：用户控制哪些代码发送到 AI

### 文档

- **[用户指南](docs/user-guide.md)** - 完整的功能文档和使用说明
- **[配置指南](docs/configuration-guide.md)** - 详细的配置选项和示例
- **[故障排查](docs/troubleshooting.md)** - 常见问题和解决方案
- **[快捷键参考](docs/shortcuts-reference.md)** - 所有键盘快捷键的快速参考
- **[测试指南](docs/testing-guide.md)** - 测试框架和指南

### 贡献

欢迎贡献！提交 PR 前请阅读我们的贡献指南。

### 支持

- **文档**：参见 [docs/](docs/) 目录
- **问题反馈**：在 GitHub Issues 上报告错误
- **讨论**：加入 GitHub Discussions 提问

### 许可证

[许可证信息]

---

<div align="center">

**Version**: 0.1.0  
**Last Updated**: 2024-12

Made with ❤️ by HiCode Team

</div>
