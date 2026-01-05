# 快速开始：HiCode Chat 功能

## 🎯 目标

在 VS Code 活动栏中显示聊天界面，加载 Vue 编译后的静态页面。

## ✅ 已完成

所有必要的代码已经实现，现在只需要：
1. 部署 Vue 聊天应用
2. 测试功能

## 🚀 立即测试（使用占位页面）

### 1. 编译扩展
```bash
npm run build
```

### 2. 启动调试
按 **F5** 或运行调试配置 "运行扩展"

### 3. 打开聊天
- 点击活动栏的 HiCode 图标
- 或按 `Ctrl+Shift+H`
- 或命令面板输入 "HiCode: Open Chat"

### 4. 查看结果
你会看到一个占位页面，显示：
```
HiCode AI Chat
聊天界面正在开发中...
请将 Vue 编译后的文件放置到：media/chatPage/
```

## 📦 部署真实的 Vue 应用

### 方案 A：快速测试（推荐）

如果你已经有编译好的 Vue 应用：

1. **复制文件到指定位置**
   ```bash
   # 假设你的 Vue 项目编译输出在 dist/
   cp -r your-vue-project/dist/* media/chatPage/
   ```

2. **确保文件结构**
   ```
   media/chatPage/
   ├── assets/
   │   ├── index.js      # 主 JS 文件
   │   ├── index.css     # 样式文件
   │   └── ...           # 其他资源
   ```

3. **重新加载扩展**
   - 在调试窗口按 `Ctrl+R` 重新加载
   - 或重新按 F5

### 方案 B：从零开始创建

#### 1. 创建 Vue 项目
```bash
# 在项目根目录外创建
cd ..
npm create vite@latest hicode-chat -- --template vue
cd hicode-chat
npm install
```

#### 2. 配置 Vite
创建或修改 `vite.config.js`：

```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  base: './',  // 重要：使用相对路径
  build: {
    outDir: path.resolve(__dirname, '../hicode-ai-integration/media/chatPage'),
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

#### 3. 修改 main.js
```javascript
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

const app = createApp(App)
app.mount('#app')

// 暴露给扩展使用
window.__VUE_APP__ = {
  handleExtensionMessage(message) {
    console.log('Received from extension:', message)
    // TODO: 处理消息
  }
}

// 通知扩展准备就绪
if (window.vscode) {
  window.vscode.postMessage({ type: 'ready' })
}
```

#### 4. 创建简单的聊天组件
`src/App.vue`：

```vue
<template>
  <div class="chat-container">
    <div class="chat-header">
      <h2>HiCode AI Chat</h2>
    </div>
    
    <div class="chat-messages">
      <div 
        v-for="msg in messages" 
        :key="msg.id"
        :class="['message', msg.role]"
      >
        {{ msg.content }}
      </div>
    </div>
    
    <div class="chat-input">
      <input 
        v-model="inputText"
        @keyup.enter="sendMessage"
        placeholder="输入消息..."
      />
      <button @click="sendMessage">发送</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const messages = ref([])
const inputText = ref('')
const vscode = window.vscode

const sendMessage = () => {
  if (!inputText.value.trim()) return
  
  // 添加用户消息
  messages.value.push({
    id: Date.now(),
    role: 'user',
    content: inputText.value
  })
  
  // 发送到扩展
  vscode.postMessage({
    type: 'sendMessage',
    data: {
      content: inputText.value,
      timestamp: new Date().toISOString()
    }
  })
  
  inputText.value = ''
}

// 监听来自扩展的消息
onMounted(() => {
  window.addEventListener('message', (event) => {
    const message = event.data
    
    if (message.type === 'receiveMessage') {
      messages.value.push(message.data)
    }
  })
})
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--vscode-sideBar-background);
  color: var(--vscode-sideBar-foreground);
}

.chat-header {
  padding: 16px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.chat-header h2 {
  margin: 0;
  font-size: 16px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.message {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 4px;
}

.message.user {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  margin-left: 20%;
}

.message.assistant {
  background-color: var(--vscode-input-background);
  margin-right: 20%;
}

.chat-input {
  display: flex;
  padding: 16px;
  gap: 8px;
  border-top: 1px solid var(--vscode-panel-border);
}

.chat-input input {
  flex: 1;
  padding: 8px 12px;
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
}

.chat-input input:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}

.chat-input button {
  padding: 8px 16px;
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.chat-input button:hover {
  background-color: var(--vscode-button-hoverBackground);
}
</style>
```

#### 5. 构建
```bash
npm run build
```

#### 6. 测试
```bash
cd ../hicode-ai-integration
npm run build
# 按 F5 启动调试
```

## 🔍 验证清单

- [ ] 活动栏显示 HiCode 图标
- [ ] 点击图标打开聊天侧边栏
- [ ] 聊天界面正确显示
- [ ] 可以输入消息
- [ ] 点击发送按钮有响应
- [ ] 收到 AI 回复（测试响应）

## 🐛 常见问题

### 问题 1：看不到活动栏图标
**解决方案：**
- 检查 `package.json` 中的 `viewsContainers` 配置
- 重新加载窗口（Ctrl+R）

### 问题 2：Webview 显示空白
**解决方案：**
- 打开 Webview 开发者工具查看错误
- 检查 `media/chatPage/` 下是否有文件
- 查看控制台是否有 CSP 错误

### 问题 3：资源加载失败
**解决方案：**
- 确保使用相对路径（`base: './'`）
- 检查文件名是否为 `index.js` 和 `index.css`
- 验证 `localResourceRoots` 配置

### 问题 4：消息通信不工作
**解决方案：**
- 确保 Vue 应用已挂载
- 检查 `window.vscode` 是否可用
- 在两端添加 console.log 调试

## 📚 更多信息

- 详细文档：`docs/chat-webview-integration.md`
- 实现总结：`CHAT_IMPLEMENTATION.md`
- Vue 集成说明：`media/chatPage/README.md`

## 🎉 完成！

现在你已经有了一个完整的聊天界面集成！

下一步可以：
1. 美化 UI
2. 添加 Markdown 渲染
3. 实现代码高亮
4. 连接真实的 AI API
5. 添加历史记录功能
