# HiCode AI Assistant - 配置指南

## 目录

1. [配置概述](#配置概述)
2. [模型配置](#模型配置)
3. [功能配置](#功能配置)
4. [性能配置](#性能配置)
5. [安全和隐私配置](#安全和隐私配置)
6. [高级配置](#高级配置)
7. [配置示例](#配置示例)

---

## 配置概述

HiCode AI Assistant 提供了丰富的配置选项，可以通过以下方式访问：

1. **VSCode 设置界面**：
   - 打开设置（`Ctrl+,` / `Cmd+,`）
   - 搜索 "HiCode"

2. **settings.json 文件**：
   - 打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）
   - 输入 "Preferences: Open Settings (JSON)"
   - 添加 HiCode 配置项

3. **工作区设置**：
   - 在项目根目录创建 `.vscode/settings.json`
   - 添加项目特定的配置

---

## 模型配置

### 配置结构

模型配置存储在 `hicode.modelConfigs` 数组中，每个模型包含以下字段：

```json
{
  "hicode.modelConfigs": [
    {
      "modelId": "string",           // 必填：唯一标识符
      "modelName": "string",          // 必填：API 模型名称
      "displayName": "string",        // 必填：UI 显示名称
      "vendor": "string",             // 必填：供应商（deepseek/openai/zhipuai/custom）
      "apiBaseUrl": "string",         // 必填：API 端点
      "maxContextTokens": number,     // 必填：最大上下文 token 数
      "supportMultimodal": boolean    // 必填：是否支持多模态
    }
  ]
}
```

### DeepSeek 配置

#### DeepSeek Chat

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

#### DeepSeek Coder

```json
{
  "modelId": "deepseek-coder",
  "modelName": "deepseek-coder",
  "displayName": "DeepSeek Coder",
  "vendor": "deepseek",
  "apiBaseUrl": "https://api.deepseek.com/v1",
  "maxContextTokens": 16000,
  "supportMultimodal": false
}
```

**获取 API Key**：
1. 访问 [DeepSeek 官网](https://platform.deepseek.com/)
2. 注册并登录
3. 在 API Keys 页面创建新密钥
4. 在 HiCode 中配置模型后，系统会提示输入 API Key

### OpenAI 配置

#### GPT-4

```json
{
  "modelId": "gpt-4",
  "modelName": "gpt-4",
  "displayName": "GPT-4",
  "vendor": "openai",
  "apiBaseUrl": "https://api.openai.com/v1",
  "maxContextTokens": 8000,
  "supportMultimodal": false
}
```

#### GPT-4 Turbo

```json
{
  "modelId": "gpt-4-turbo",
  "modelName": "gpt-4-turbo-preview",
  "displayName": "GPT-4 Turbo",
  "vendor": "openai",
  "apiBaseUrl": "https://api.openai.com/v1",
  "maxContextTokens": 128000,
  "supportMultimodal": true
}
```

#### GPT-3.5 Turbo

```json
{
  "modelId": "gpt-3.5-turbo",
  "modelName": "gpt-3.5-turbo",
  "displayName": "GPT-3.5 Turbo",
  "vendor": "openai",
  "apiBaseUrl": "https://api.openai.com/v1",
  "maxContextTokens": 16000,
  "supportMultimodal": false
}
```

**获取 API Key**：
1. 访问 [OpenAI Platform](https://platform.openai.com/)
2. 注册并登录
3. 在 API Keys 页面创建新密钥
4. 在 HiCode 中配置模型后输入 API Key

### 智谱 AI 配置

#### GLM-4

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

#### GLM-3 Turbo

```json
{
  "modelId": "glm-3-turbo",
  "modelName": "glm-3-turbo",
  "displayName": "GLM-3 Turbo",
  "vendor": "zhipuai",
  "apiBaseUrl": "https://open.bigmodel.cn/api/paas/v4",
  "maxContextTokens": 128000,
  "supportMultimodal": false
}
```

**获取 API Key**：
1. 访问 [智谱 AI 开放平台](https://open.bigmodel.cn/)
2. 注册并登录
3. 在 API Keys 页面创建新密钥
4. 在 HiCode 中配置模型后输入 API Key

### 自定义模型配置

如果您使用自托管模型或其他供应商：

```json
{
  "modelId": "my-custom-model",
  "modelName": "custom-model-name",
  "displayName": "My Custom Model",
  "vendor": "custom",
  "apiBaseUrl": "http://localhost:8000/v1",
  "maxContextTokens": 4096,
  "supportMultimodal": false
}
```

**要求**：
- API 必须兼容 OpenAI 格式
- 支持 `/chat/completions` 端点
- 支持流式响应（可选）

### 选择当前模型

配置模型后，设置默认使用的模型：

```json
{
  "hicode.currentModel": "deepseek-chat"
}
```

或使用命令：`HiCode: Switch AI Model`

---

## 功能配置

### 启用/禁用功能

```json
{
  "hicode.enableInlineChat": true,        // 启用内联聊天
  "hicode.enableCodeCompletion": true,    // 启用代码补全
  "hicode.enableAgent": true              // 启用 Agent 系统
}
```

**使用场景**：
- 如果只需要聊天功能，可以禁用补全和 Agent
- 如果担心性能，可以选择性禁用某些功能
- 在特定项目中可能只需要部分功能

### 内联聊天快捷命令

自定义内联聊天的快捷命令：

```json
{
  "hicode.inlineChatShortcuts": {
    "/refactor": "Refactor selected code",
    "/test": "Generate tests for selected code",
    "/explain": "Explain selected code",
    "/doc": "Generate documentation",
    "/fix": "Fix code issues",
    "/optimize": "Optimize code performance",
    "/review": "Review code quality",
    "/translate": "Translate code to another language"
  }
}
```

---

## 性能配置

### 代码补全性能

```json
{
  "hicode.completionDelay": 300,          // 触发延迟（毫秒）
  "hicode.completionMaxTokens": 500       // 最大生成 token 数
}
```

**调优建议**：
- **快速响应**：`completionDelay: 200`，`completionMaxTokens: 300`
- **平衡模式**：`completionDelay: 300`，`completionMaxTokens: 500`（默认）
- **高质量**：`completionDelay: 500`，`completionMaxTokens: 1000`

### 上下文管理

```json
{
  "hicode.contextMaxTokens": 4000,        // 最大上下文 token 数
  "hicode.enableContextCache": true       // 启用上下文缓存
}
```

**调优建议**：
- **小型项目**：`contextMaxTokens: 2000`
- **中型项目**：`contextMaxTokens: 4000`（默认）
- **大型项目**：`contextMaxTokens: 8000`（需要模型支持）

**缓存策略**：
- 启用缓存可以显著提高响应速度
- 缓存会在文件修改时自动更新
- 如果遇到上下文不准确，尝试禁用缓存

### 网络性能

```json
{
  "hicode.requestTimeout": 30000,         // 请求超时（毫秒）
  "hicode.maxRetries": 3                  // 最大重试次数
}
```

**调优建议**：
- **快速网络**：`requestTimeout: 15000`，`maxRetries: 2`
- **一般网络**：`requestTimeout: 30000`，`maxRetries: 3`（默认）
- **慢速网络**：`requestTimeout: 60000`，`maxRetries: 5`

---

## 安全和隐私配置

### 授权控制

```json
{
  "hicode.requireAuthorization": true     // 发送代码前需要授权
}
```

**说明**：
- 启用后，每次发送代码到 AI 前都会请求确认
- 适合处理敏感代码的场景
- 禁用后可以提高使用流畅度，但需要信任 AI 服务

### 本地模式

```json
{
  "hicode.enableLocalMode": true          // 启用本地模式
}
```

**使用场景**：
- 使用自托管的模型服务
- 需要完全的数据隐私
- 在内网环境中使用

**配置步骤**：
1. 启用本地模式
2. 配置自定义模型，指向本地服务
3. 确保本地服务兼容 OpenAI API 格式

### API 密钥管理

**安全存储**：
- API 密钥使用 VSCode SecretStorage 加密存储
- 不会出现在配置文件或日志中
- 每个用户需要单独配置

**更新密钥**：
1. 使用命令：`HiCode: Configure AI Models`
2. 选择模型
3. 输入新的 API Key

**删除密钥**：
1. 删除模型配置
2. 或在 VSCode 设置中清除 SecretStorage

---

## 高级配置

### 日志和调试

```json
{
  "hicode.logLevel": "info",              // 日志级别：debug/info/warn/error
  "hicode.enableDebugMode": false         // 启用调试模式
}
```

**日志级别说明**：
- **debug**：详细的调试信息，包括 API 请求/响应
- **info**：一般信息，包括操作记录
- **warn**：警告信息，包括性能问题
- **error**：仅错误信息

**调试模式**：
- 启用后会在输出面板显示详细日志
- 用于问题排查和性能分析
- 建议仅在需要时启用

### 历史记录管理

```json
{
  "hicode.autoSaveHistory": true,         // 自动保存对话历史
  "hicode.maxHistorySessions": 100        // 最大保存会话数
}
```

**存储位置**：
- 对话历史存储在 VSCode 的全局存储中
- 位置：`~/.config/Code/User/globalStorage/hicode.hicode-ai-integration/`

**清理历史**：
- 超过最大会话数时，最旧的会话会被自动删除
- 可以手动导出重要会话
- 可以使用命令清空所有历史

---

## 配置示例

### 示例 1：基础配置（单模型）

适合个人开发者，使用单一模型：

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
  "hicode.enableInlineChat": true,
  "hicode.enableCodeCompletion": true,
  "hicode.enableAgent": true
}
```

### 示例 2：多模型配置

适合需要切换不同模型的场景：

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
    },
    {
      "modelId": "gpt-4",
      "modelName": "gpt-4",
      "displayName": "GPT-4",
      "vendor": "openai",
      "apiBaseUrl": "https://api.openai.com/v1",
      "maxContextTokens": 8000,
      "supportMultimodal": false
    },
    {
      "modelId": "glm-4",
      "modelName": "glm-4",
      "displayName": "GLM-4",
      "vendor": "zhipuai",
      "apiBaseUrl": "https://open.bigmodel.cn/api/paas/v4",
      "maxContextTokens": 128000,
      "supportMultimodal": true
    }
  ],
  "hicode.currentModel": "deepseek-chat"
}
```

### 示例 3：性能优化配置

适合大型项目或性能敏感场景：

```json
{
  "hicode.completionDelay": 500,
  "hicode.completionMaxTokens": 300,
  "hicode.contextMaxTokens": 2000,
  "hicode.enableContextCache": true,
  "hicode.requestTimeout": 15000,
  "hicode.maxRetries": 2
}
```

### 示例 4：安全优先配置

适合处理敏感代码的场景：

```json
{
  "hicode.requireAuthorization": true,
  "hicode.enableLocalMode": true,
  "hicode.logLevel": "error",
  "hicode.enableDebugMode": false,
  "hicode.autoSaveHistory": false
}
```

### 示例 5：团队共享配置

在项目的 `.vscode/settings.json` 中：

```json
{
  "hicode.modelConfigs": [
    {
      "modelId": "team-model",
      "modelName": "gpt-4",
      "displayName": "Team GPT-4",
      "vendor": "openai",
      "apiBaseUrl": "https://api.openai.com/v1",
      "maxContextTokens": 8000,
      "supportMultimodal": false
    }
  ],
  "hicode.currentModel": "team-model",
  "hicode.contextMaxTokens": 4000,
  "hicode.completionDelay": 300,
  "hicode.inlineChatShortcuts": {
    "/refactor": "Refactor following team standards",
    "/test": "Generate tests using Jest",
    "/doc": "Generate JSDoc comments"
  }
}
```

**注意**：团队成员仍需各自配置 API Key。

### 示例 6：本地模型配置

使用自托管模型服务：

```json
{
  "hicode.enableLocalMode": true,
  "hicode.modelConfigs": [
    {
      "modelId": "local-llama",
      "modelName": "llama-2-70b",
      "displayName": "Local Llama 2",
      "vendor": "custom",
      "apiBaseUrl": "http://localhost:8000/v1",
      "maxContextTokens": 4096,
      "supportMultimodal": false
    }
  ],
  "hicode.currentModel": "local-llama",
  "hicode.requireAuthorization": false,
  "hicode.requestTimeout": 60000
}
```

---

## 配置最佳实践

### 1. 分层配置

- **用户级配置**：个人偏好（快捷键、日志级别等）
- **工作区配置**：项目特定设置（模型选择、上下文大小等）
- **团队配置**：共享的项目配置（不包括 API Key）

### 2. 性能优化

- 根据项目大小调整 `contextMaxTokens`
- 启用 `enableContextCache` 提高响应速度
- 合理设置 `completionDelay` 平衡响应速度和 API 调用频率

### 3. 安全考虑

- 敏感项目启用 `requireAuthorization`
- 使用本地模式处理机密代码
- 定期更新 API Key
- 不要在配置文件中硬编码 API Key

### 4. 成本控制

- 使用较小的 `contextMaxTokens` 减少 token 消耗
- 使用较小的 `completionMaxTokens` 控制补全长度
- 选择性启用功能
- 使用成本较低的模型进行日常开发

### 5. 调试和问题排查

- 遇到问题时启用 `enableDebugMode`
- 设置 `logLevel: "debug"` 获取详细日志
- 查看输出面板的日志信息
- 导出日志用于问题报告

---

## 配置迁移

### 从旧版本迁移

如果您从旧版本升级，可能需要更新配置格式：

**旧格式**：
```json
{
  "hicode.apiKey": "sk-xxx",
  "hicode.model": "gpt-4"
}
```

**新格式**：
```json
{
  "hicode.modelConfigs": [
    {
      "modelId": "gpt-4",
      "modelName": "gpt-4",
      "displayName": "GPT-4",
      "vendor": "openai",
      "apiBaseUrl": "https://api.openai.com/v1",
      "maxContextTokens": 8000,
      "supportMultimodal": false
    }
  ],
  "hicode.currentModel": "gpt-4"
}
```

API Key 需要通过命令重新配置。

### 导出和导入配置

**导出配置**：
1. 打开 settings.json
2. 复制所有 `hicode.*` 配置项
3. 保存到文件

**导入配置**：
1. 打开 settings.json
2. 粘贴配置项
3. 重新配置 API Key

---

## 故障排查

### 配置不生效

1. 检查配置语法是否正确（JSON 格式）
2. 重启 VSCode
3. 检查是否有工作区配置覆盖了用户配置
4. 查看输出面板的错误信息

### API Key 无法保存

1. 检查 VSCode 版本（需要 >= 1.85.0）
2. 检查系统权限
3. 尝试重新安装扩展
4. 查看 VSCode 日志

### 模型切换失败

1. 确认模型配置正确
2. 确认 API Key 已配置
3. 测试 API 连接
4. 查看详细错误信息

---

**版本**：0.1.0  
**最后更新**：2024-01-01
