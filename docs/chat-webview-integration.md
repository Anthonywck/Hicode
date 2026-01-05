# 聊天 Webview 集成指南

## 概述

HiCode AI 扩展使用 Webview 在 VS Code 活动栏中显示聊天界面。聊天界面使用 Vue.js 构建，编译后的静态文件加载到 Webview 中。

## 架构

```
┌─────────────────────────────────────────┐
│         VS Code Extension               │
│  ┌───────────────────────────────────┐  │
│  │   ChatWebviewProvider             │  │
│  │   - 管理 Webview 生命周期         │  │
│  │   - 处理消息通信                  │  │
│  │   - 加载 Vue 静态页面             │  │
│  └───────────────────────────────────┘  │
│              ↕ postMessage               │
│  ┌───────────────────────────────────┐  │
│  │   Webview (Vue App)               │  │
│  │   - 聊天界面 UI                   │  │
│  │   - 用户交互                      │  │
│  │   - 消息显示                      │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## 文件结构

```
hicode-ai-integration/
├── src/
│   ├── extension.ts                    # 扩展入口，注册 Webview
│   ├── providers/
│   │   └── chatWebviewProvider.ts      # Webview 提供器
│   └── commands/
│       └── handlers.ts                 # openChat 命令处理
├── media/
│   ├── icon.svg                        # 活动栏图标
│   └── chatPage/                       # Vue 编译后的文件
│       ├── assets/
│       │   ├── index.js                # Vue 应用主文件
│       │   └── index.css               # 样式文件
│       └── README.md                   # 集成说明
└── package.json                        # 注册视图容器和视图
```

## 实现细节

### 1. 视图注册（package.json）

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "hicode-sidebar",
          "title": "HiCode AI",
          "icon": "media/icon.svg"
        }
      ]
    },
    "views": {
      "hicode-sidebar": [
        {
          "type": "webview",
          "id": "hicode-chat",
          "name": "Chat",
          "icon": "media/icon.svg",
          "contextualTitle": "HiCode Chat"
        }
      ]
    }
  }
}
```

### 2. Webview 提供器（ChatWebviewProvider）

主要功能：

- **resolveWebviewView**: 创建和配置 Webview
- **_getHtmlForWebview**: 生成 HTML 内容，加载 Vue 应用
- **_handleMessage**: 处理来自 Vue 的消息
- **_sendMessage**: 向 Vue 发送消息

关键配置：

```typescript
webviewView.webview.options = {
  enableScripts: true,  // 允许执行 JavaScript
  localResourceRoots: [
    vscode.Uri.joinPath(this._extensionUri, 'media'),
    vscode.Uri.joinPath(this._extensionUri, 'dist')
  ]
};
```

### 3. 资源加载

所有本地资源必须通过 `webview.asWebviewUri()` 转换：

```typescript
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(chatPageUri, 'assets', 'index.js')
);
```

### 4. 内容安全策略（CSP）

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  style-src ${webview.cspSource} 'unsafe-inline';
  script-src 'nonce-${nonce}';
  img-src ${webview.cspSource} https: data:;
  font-src ${webview.cspSource};
  connect-src ${webview.cspSource};
">
```

### 5. 消息通信

#### Vue → Extension

```javascript
// 在 Vue 中
const vscode = window.vscode;

vscode.postMessage({
  type: 'sendMessage',
  data: { content: '你好' }
});
```

#### Extension → Vue

```typescript
// 在扩展中
chatWebviewProvider._sendMessage({
  type: 'receiveMessage',
  data: { content: 'AI 响应' }
});
```

## Vue 应用开发

### 1. 项目设置

创建 Vue 项目：

```bash
npm create vite@latest hicode-chat -- --template vue
cd hicode-chat
npm install
```

### 2. Vite 配置

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: path.resolve(__dirname, '../media/chatPage'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
})
```

### 3. 主入口（main.js）

```javascript
import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)
app.mount('#app')

// 暴露给扩展使用
window.__VUE_APP__ = {
  handleExtensionMessage(message) {
    // 处理来自扩展的消息
    app.config.globalProperties.$handleMessage(message)
  }
}

// 通知扩展准备就绪
if (window.vscode) {
  window.vscode.postMessage({ type: 'ready' })
}
```

### 4. 使用 VS Code API

创建 composable：

```javascript
// composables/useVscode.js
import { ref, onMounted, onUnmounted } from 'vue'

export function useVscode() {
  const vscode = window.vscode
  const messages = ref([])
  
  const sendMessage = (content) => {
    vscode.postMessage({
      type: 'sendMessage',
      data: { content, timestamp: new Date().toISOString() }
    })
  }
  
  const handleMessage = (event) => {
    const message = event.data
    
    if (message.type === 'receiveMessage') {
      messages.value.push(message.data)
    }
  }
  
  onMounted(() => {
    window.addEventListener('message', handleMessage)
  })
  
  onUnmounted(() => {
    window.removeEventListener('message', handleMessage)
  })
  
  return {
    messages,
    sendMessage
  }
}
```

### 5. 样式适配

使用 VS Code CSS 变量：

```css
.chat-container {
  background-color: var(--vscode-sideBar-background);
  color: var(--vscode-sideBar-foreground);
}

.message-input {
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
}

.message-input:focus {
  border-color: var(--vscode-focusBorder);
}

.send-button {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.send-button:hover {
  background-color: var(--vscode-button-hoverBackground);
}
```

## 部署流程

1. **开发 Vue 应用**
   ```bash
   cd hicode-chat
   npm run dev
   ```

2. **构建生产版本**
   ```bash
   npm run build
   ```

3. **验证文件**
   确保以下文件存在：
   - `media/chatPage/index.js`
   - `media/chatPage/index.css`

4. **编译扩展**
   ```bash
   cd ..
   npm run build
   ```

5. **测试**
   - 按 F5 启动调试
   - 点击活动栏的 HiCode 图标
   - 测试聊天功能

## 调试

### 扩展端调试

在 `src/providers/chatWebviewProvider.ts` 中添加日志：

```typescript
console.log('Received message:', message);
```

### Webview 端调试

1. 打开命令面板（Ctrl+Shift+P）
2. 运行 "Developer: Open Webview Developer Tools"
3. 在控制台查看 Vue 应用的日志

### 常见问题

**问题 1：资源加载失败**
- 检查 CSP 配置
- 确保使用 `webview.asWebviewUri()` 转换路径
- 检查 `localResourceRoots` 配置

**问题 2：消息通信失败**
- 确保 Vue 应用已挂载
- 检查 `window.vscode` 是否可用
- 验证消息格式

**问题 3：样式不正确**
- 使用 VS Code CSS 变量
- 检查 CSS 文件是否正确加载
- 验证 CSP 允许内联样式

## 最佳实践

1. **性能优化**
   - 使用代码分割
   - 懒加载组件
   - 优化打包体积

2. **用户体验**
   - 响应式设计
   - 加载状态提示
   - 错误处理

3. **安全性**
   - 严格的 CSP 配置
   - 输入验证
   - XSS 防护

4. **可维护性**
   - 清晰的消息协议
   - 完善的类型定义
   - 详细的文档

## 参考资料

- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Vue.js 文档](https://vuejs.org/)
- [Vite 文档](https://vitejs.dev/)
