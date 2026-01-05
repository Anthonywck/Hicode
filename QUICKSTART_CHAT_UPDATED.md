# 聊天界面调试指南（更新版）

## 当前配置

已添加三种调试模式，可以逐步排查问题：

### 调试模式说明

在 `src/providers/chatWebviewProvider.ts` 的 `_getHtmlForWebview` 方法中：

```typescript
const DEBUG_MODE: string = 'debug'; // 可选值: 'test' | 'debug' | 'production'
```

1. **'test'** - 简单测试页面
   - 文件：`media/chatPage/test.html`
   - 用途：验证 Webview 基本功能、VS Code API、消息通信
   - 适用：首次调试，确认基础设施正常

2. **'debug'** - Vue 调试版本（当前默认）
   - 文件：`media/chatPage/index-debug.html`
   - 用途：使用相对路径（`./js/...`），格式化的 HTML，包含调试信息
   - 适用：Vue 应用加载调试，查看具体哪个资源加载失败

3. **'production'** - Vue 生产版本
   - 文件：`media/chatPage/index.html`
   - 用途：Vue 编译后的原始文件（压缩，绝对路径 `/js/...`）
   - 适用：确认最终生产环境是否正常

## 快速调试步骤

### 步骤 1：测试基本功能（test 模式）

1. 修改 `DEBUG_MODE` 为 `'test'`
2. 编译：`npm run build`
3. 按 F5 启动调试
4. 点击活动栏的 HiCode AI 图标
5. 应该看到：
   - ✓ Webview 加载成功
   - ✓ VS Code API 可用
   - ✓ 消息通信正常

**如果测试页面失败**：说明基础配置有问题，检查 `package.json` 和 `extension.ts`

### 步骤 2：调试 Vue 应用（debug 模式）

1. 修改 `DEBUG_MODE` 为 `'debug'`（默认）
2. 编译：`npm run build`
3. 重新加载扩展（Ctrl+R）
4. 打开 Webview 开发者工具：`Developer: Open Webview Developer Tools`
5. 查看：
   - 控制台是否有错误
   - 网络面板中资源加载状态
   - 是否显示"加载中..."或 Vue 应用界面

**常见问题**：
- 如果一直显示"加载中..."：JS 文件未加载或 Vue 未初始化
- 如果样式错误：CSS 文件加载失败
- 如果空白：HTML 未正确处理

### 步骤 3：测试生产版本（production 模式）

1. 修改 `DEBUG_MODE` 为 `'production'`
2. 编译：`npm run build`
3. 重新加载扩展
4. 确认 Vue 应用正常显示

## 调试日志查看

1. 按 `F5` 启动调试
2. 在扩展开发主机窗口中，打开 **输出** 面板（`Ctrl+Shift+U`）
3. 选择 **Extension Host** 频道
4. 查找以下日志：
   ```
   ChatWebviewProvider: Loading HTML from: ...
   ChatWebviewProvider: chatPageUri: ...
   ChatWebviewProvider: HTML loaded, length: ...
   ChatWebviewProvider: [script] /js/... -> vscode-webview://...
   ChatWebviewProvider: [link] /css/... -> vscode-webview://...
   ```

### 2. 查看 Webview 开发者工具

1. 点击活动栏的 **HiCode AI** 图标打开聊天界面
2. 打开命令面板（`Ctrl+Shift+P`）
3. 执行命令：`Developer: Open Webview Developer Tools`
4. 在控制台中查看：
   - 是否有 JavaScript 错误
   - 是否有资源加载失败（404 错误）
   - 网络面板中查看资源请求状态

### 3. 使用测试页面验证

如果 Vue 页面无法加载，可以先用测试页面验证基本功能：

1. 打开 `src/providers/chatWebviewProvider.ts`
2. 找到 `_getHtmlForWebview` 方法
3. 将 `USE_TEST_PAGE` 改为 `true`：
   ```typescript
   const USE_TEST_PAGE = true; // 使用测试页面
   ```
4. 重新编译：`npm run build`
5. 重新加载扩展（`Ctrl+R` 或 `Cmd+R`）
6. 打开聊天界面，应该看到测试页面

测试页面会显示：
- ✓ Webview 加载成功
- ✓ VS Code API 可用
- ✓ 消息通信正常

### 4. 常见问题排查

#### 问题 1：页面空白，无任何内容

**可能原因**：
- HTML 文件未找到
- 资源路径转换失败

**解决方法**：
1. 检查 `media/chatPage/index.html` 是否存在
2. 查看扩展主机日志中的路径信息
3. 使用测试页面验证基本加载

#### 问题 2：页面显示但样式错误

**可能原因**：
- CSS 文件加载失败
- CSP 策略阻止了样式

**解决方法**：
1. 打开 Webview 开发者工具
2. 查看网络面板，确认 CSS 文件是否加载成功
3. 查看控制台是否有 CSP 错误
4. 检查日志中的 `[link]` 路径转换

#### 问题 3：JavaScript 不执行

**可能原因**：
- JS 文件加载失败
- CSP 策略阻止了脚本执行
- nonce 不匹配

**解决方法**：
1. 打开 Webview 开发者工具
2. 查看网络面板，确认 JS 文件是否加载成功
3. 查看控制台是否有 CSP 错误
4. 检查日志中的 `[script]` 路径转换
5. 确认所有 `<script>` 标签都有正确的 nonce

#### 问题 4：Vue 应用未初始化

**可能原因**：
- Vue 文件加载顺序错误
- 缺少必要的全局变量
- 模块加载失败

**解决方法**：
1. 检查 `index.html` 中的脚本加载顺序
2. 确认 `type="module"` 和 `nomodule` 属性正确
3. 查看控制台的模块加载错误

## 调试日志示例

### 正常加载的日志：

```
ChatWebviewProvider: Loading HTML from: e:\workspace\hicode\media\chatPage\index.html
ChatWebviewProvider: chatPageUri: e:\workspace\hicode\media\chatPage
ChatWebviewProvider: Using test page: false
ChatWebviewProvider: HTML loaded, length: 623
ChatWebviewProvider: Processing HTML content...
ChatWebviewProvider: [script] /js/vendors.f100cf0a.js -> vscode-webview://xxx/js/vendors.f100cf0a.js
ChatWebviewProvider: [script] /js/app.6fe7eff5.js -> vscode-webview://xxx/js/app.6fe7eff5.js
ChatWebviewProvider: [link] /css/vendors.aec98d89.css -> vscode-webview://xxx/css/vendors.aec98d89.css
ChatWebviewProvider: [link] /css/app.42a44c83.css -> vscode-webview://xxx/css/app.42a44c83.css
ChatWebviewProvider: Resource paths processed
ChatWebviewProvider: HTML processed, length: 2156
ChatWebviewProvider: Webview resolved
Received message from webview: { type: 'ready' }
Webview is ready
```

### 错误加载的日志：

```
ChatWebviewProvider: Loading HTML from: e:\workspace\hicode\media\chatPage\index.html
Failed to read index.html: Error: ENOENT: no such file or directory
```

## 下一步

1. **如果测试页面正常**：说明基本机制工作，问题在于 Vue 页面的资源加载
2. **如果测试页面也失败**：说明 Webview 配置有问题，需要检查 `package.json` 和 `extension.ts`

## 需要提供的信息

如果问题仍未解决，请提供：

1. **扩展主机日志**：完整的 `ChatWebviewProvider` 相关日志
2. **Webview 控制台**：所有错误和警告信息
3. **网络面板**：失败的资源请求（URL 和状态码）
4. **测试页面结果**：测试页面是否能正常显示

## 临时解决方案

如果 Vue 页面始终无法加载，可以：

1. 检查 Vue 项目的构建配置（`vue.config.js` 或 `vite.config.js`）
2. 确认 `publicPath` 设置为相对路径（`./` 而不是 `/`）
3. 重新构建 Vue 项目
4. 将构建产物复制到 `media/chatPage/`

## 参考资料

- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Webview CSP](https://code.visualstudio.com/api/extension-guides/webview#content-security-policy)
- [Vue 构建配置](https://cli.vuejs.org/config/#publicpath)
