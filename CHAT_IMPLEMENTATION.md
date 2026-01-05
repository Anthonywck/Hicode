# 聊天界面实现说明

## 功能概述

在 VS Code 活动栏中集成了 HiCode AI 聊天界面，加载 Vue 编译后的静态页面。

## 实现文件

### 1. `src/providers/chatWebviewProvider.ts`
聊天 Webview 提供器，负责：
- 加载 `media/chatPage/index.html` 页面
- 处理资源路径转换（支持 Vue 编译后的绝对路径格式）
- 管理 Webview 和扩展之间的消息通信
- 注入 VS Code API 和 CSP 安全策略

### 2. `src/extension.ts`
扩展入口文件，包含：
- `registerChatWebview()` 函数：注册 Webview 视图提供器
- `getChatWebviewProvider()` 函数：获取 Webview 提供器实例

### 3. `package.json`
扩展配置，注册了：
- **视图容器**：`hicode-ai-sidebar`（活动栏图标）
- **视图**：`hicode-ai-chat`（聊天界面）
- **图标**：`media/icon.svg`

## 关键技术点

### 1. 资源路径处理
Vue 编译后的 `index.html` 使用了以 `/` 开头的绝对路径（如 `/js/app.js`, `/css/app.css`）。

**解决方案**：
- 在 `_processHtmlContent()` 方法中，将以 `/` 开头的路径转换为相对路径
- 使用 `vscode.Uri.joinPath()` 和 `webview.asWebviewUri()` 转换为 Webview URI
- 自动处理 `<script>`, `<link>`, `<img>` 标签中的资源路径

```typescript
// 示例：/js/app.js -> vscode-webview://xxx/media/chatPage/js/app.js
const toWebviewUri = (path: string): string => {
  if (path.startsWith('/')) {
    path = path.substring(1); // 去掉开头的 /
  }
  const resourceUri = vscode.Uri.joinPath(chatPageUri, path);
  return webview.asWebviewUri(resourceUri).toString();
};
```

### 2. CSP 安全策略
为了支持 Vue 应用的正常运行，配置了适当的 CSP：
- `script-src 'nonce-xxx'`：允许带 nonce 的脚本执行
- `style-src 'unsafe-inline'`：允许内联样式（Vue 需要）
- `img-src https: data:`：允许图片加载

### 3. VS Code API 注入
在 HTML 中注入脚本，将 VS Code API 暴露给 Vue 应用：
```javascript
const vscode = acquireVsCodeApi();
window.vscode = vscode;
```

### 4. 消息通信
- **Webview → 扩展**：`vscode.postMessage({ type: 'xxx', data: ... })`
- **扩展 → Webview**：`webview.postMessage({ type: 'xxx', data: ... })`

支持的消息类型：
- `ready`：Webview 已准备就绪
- `sendMessage`：用户发送消息
- `receiveMessage`：接收 AI 响应
- `error`：错误信息

## 文件结构

```
media/chatPage/
├── index.html          # Vue 编译后的入口文件
├── js/
│   ├── app.js         # Vue 应用主文件
│   ├── vendors.js     # 第三方库
│   └── ...
└── css/
    ├── app.css        # 应用样式
    ├── vendors.css    # 第三方库样式
    └── ...
```

## 使用方法

1. **打开聊天界面**：
   - 点击活动栏的 HiCode AI 图标
   - 或执行命令：`HiCode: Open Chat`

2. **发送消息**：
   - 在聊天界面输入消息
   - Vue 应用通过 `vscode.postMessage()` 发送到扩展
   - 扩展处理后返回响应

## 调试

1. **查看 Webview 控制台**：
   - 打开命令面板（Ctrl+Shift+P）
   - 执行：`Developer: Open Webview Developer Tools`

2. **查看扩展日志**：
   - 打开输出面板（Ctrl+Shift+U）
   - 选择 "Extension Host" 频道

## 注意事项

1. **不要修改 `media/chatPage` 目录**：这是 Vue 编译后的文件，应该由 Vue 项目生成
2. **资源路径格式**：支持相对路径和以 `/` 开头的绝对路径
3. **CSP 限制**：如果 Vue 应用需要额外的权限，需要在 CSP 中添加
4. **状态保持**：设置了 `retainContextWhenHidden: true`，切换视图时保持状态

## 后续开发

- [ ] 实现完整的消息处理逻辑（调用 AI API）
- [ ] 添加聊天历史记录功能
- [ ] 支持代码块高亮和复制
- [ ] 添加设置面板
- [ ] 支持多轮对话上下文
