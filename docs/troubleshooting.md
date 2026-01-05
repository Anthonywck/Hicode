# HiCode AI Assistant - 故障排查指南

## 目录

1. [快速诊断](#快速诊断)
2. [常见问题](#常见问题)
3. [错误代码参考](#错误代码参考)
4. [性能问题](#性能问题)
5. [网络问题](#网络问题)
6. [调试工具](#调试工具)
7. [获取帮助](#获取帮助)

---

## 快速诊断

### 诊断检查清单

在深入排查前，请先完成以下检查：

- [ ] VSCode 版本 >= 1.85.0
- [ ] HiCode 扩展已启用
- [ ] 至少配置了一个 AI 模型
- [ ] API Key 已正确配置
- [ ] 网络连接正常
- [ ] 没有防火墙阻止连接
- [ ] 查看了输出面板的错误信息

### 快速修复步骤

1. **重启 VSCode**：解决大多数临时问题
2. **重新加载窗口**：`Ctrl+Shift+P` → "Developer: Reload Window"
3. **禁用其他扩展**：排除扩展冲突
4. **清除缓存**：删除 VSCode 缓存目录
5. **重新安装扩展**：完全卸载后重新安装

---

## 常见问题

### 1. 扩展无法激活

#### 症状
- VSCode 启动后扩展不可用
- 命令面板中找不到 HiCode 命令
- 状态栏没有 HiCode 图标

#### 可能原因
1. VSCode 版本过低
2. 扩展安装不完整
3. 扩展激活失败
4. 依赖项缺失

#### 解决方案

**检查 VSCode 版本**
```bash
# 在 VSCode 中
Help → About
# 确保版本 >= 1.85.0
```

**查看扩展状态**
1. 打开扩展面板（`Ctrl+Shift+X`）
2. 搜索 "HiCode"
3. 确认扩展已启用

**查看激活错误**
1. 打开输出面板（`Ctrl+Shift+U`）
2. 选择 "HiCode" 频道
3. 查看错误信息

**重新安装扩展**
1. 卸载 HiCode 扩展
2. 重启 VSCode
3. 重新安装扩展
4. 重启 VSCode

### 2. API 调用失败

#### 症状
- 聊天无响应
- 补全不工作
- 显示 API 错误

#### 错误类型和解决方案

**错误：401 Unauthorized**

原因：API Key 无效或过期

解决方案：
1. 检查 API Key 是否正确
2. 确认 API Key 有效期
3. 重新配置 API Key：
   ```
   命令面板 → HiCode: Configure AI Models
   → 选择模型 → 输入新的 API Key
   ```

**错误：403 Forbidden**

原因：API Key 权限不足或配额用尽

解决方案：
1. 检查 API 配额
2. 访问模型提供商控制台查看使用情况
3. 升级账户或购买更多配额

**错误：404 Not Found**

原因：API 端点或模型名称错误

解决方案：
1. 检查 `apiBaseUrl` 是否正确
2. 检查 `modelName` 是否匹配
3. 参考配置指南中的正确配置

**错误：429 Too Many Requests**

原因：请求频率超过限制

解决方案：
1. 增加 `completionDelay` 设置
2. 减少并发请求
3. 等待一段时间后重试
4. 升级 API 账户

**错误：500 Internal Server Error**

原因：API 服务器错误

解决方案：
1. 等待几分钟后重试
2. 检查模型提供商状态页面
3. 切换到其他模型
4. 联系模型提供商支持

**错误：503 Service Unavailable**

原因：API 服务暂时不可用

解决方案：
1. 等待服务恢复
2. 检查模型提供商状态
3. 使用备用模型

#### 网络相关错误

**错误：ECONNREFUSED**

原因：无法连接到 API 服务器

解决方案：
1. 检查网络连接
2. 检查 API Base URL 是否正确
3. 检查防火墙设置
4. 尝试使用代理

**错误：ETIMEDOUT**

原因：请求超时

解决方案：
1. 增加 `requestTimeout` 设置：
   ```json
   {
     "hicode.requestTimeout": 60000
   }
   ```
2. 检查网络速度
3. 切换到更快的网络
4. 使用本地模型

**错误：ENOTFOUND**

原因：DNS 解析失败

解决方案：
1. 检查网络连接
2. 检查 DNS 设置
3. 尝试使用其他 DNS 服务器
4. 检查 API Base URL 拼写

### 3. 代码补全不工作

#### 症状
- 输入代码时没有补全建议
- 补全建议不相关
- 补全响应缓慢

#### 诊断步骤

**1. 检查功能是否启用**
```json
{
  "hicode.enableCodeCompletion": true
}
```

**2. 检查模型是否选择**
```
命令面板 → HiCode: Switch AI Model
→ 确认已选择模型
```

**3. 手动触发补全**
```
Ctrl+Space / Cmd+Space
或
命令面板 → HiCode: Trigger AI Completion
```

**4. 查看输出面板**
```
Ctrl+Shift+U → 选择 "HiCode"
→ 查看错误信息
```

#### 常见原因和解决方案

**原因：延迟设置过高**

解决方案：
```json
{
  "hicode.completionDelay": 200  // 减少延迟
}
```

**原因：上下文不足**

解决方案：
```json
{
  "hicode.contextMaxTokens": 6000  // 增加上下文
}
```

**原因：API 配额用尽**

解决方案：
1. 检查 API 使用情况
2. 购买更多配额
3. 切换到其他模型

**原因：语言不支持**

解决方案：
- 补全支持所有主流语言
- 如果特定语言不工作，报告问题

**原因：缓存问题**

解决方案：
```json
{
  "hicode.enableContextCache": false  // 临时禁用缓存
}
```

### 4. 内联聊天无响应

#### 症状
- 按快捷键无反应
- 输入框不出现
- 输入后无响应

#### 诊断步骤

**1. 检查功能是否启用**
```json
{
  "hicode.enableInlineChat": true
}
```

**2. 检查快捷键冲突**
```
File → Preferences → Keyboard Shortcuts
→ 搜索 "hicode.showInlineChat"
→ 检查是否有冲突
```

**3. 使用命令面板触发**
```
Ctrl+Shift+P → HiCode: Show Inline Chat
```

**4. 检查编辑器焦点**
- 确保光标在编辑器中
- 不在终端或其他面板

#### 解决方案

**快捷键冲突**
1. 打开键盘快捷键设置
2. 搜索冲突的快捷键
3. 修改 HiCode 或冲突扩展的快捷键

**扩展冲突**
1. 禁用其他 AI 辅助扩展
2. 逐个启用，找出冲突扩展
3. 调整配置或选择保留一个

**权限问题**
1. 检查 VSCode 权限
2. 以管理员身份运行 VSCode（Windows）
3. 检查文件系统权限

### 5. Agent 操作失败

#### 症状
- Agent 任务无法执行
- 预览不显示
- 应用更改失败

#### 诊断步骤

**1. 检查功能是否启用**
```json
{
  "hicode.enableAgent": true
}
```

**2. 检查代码选择**
- 确保选中了有效的代码
- 不要选择空白或注释

**3. 查看错误信息**
- 输出面板中的详细错误
- 通知中的错误提示

#### 常见问题和解决方案

**问题：预览不显示**

解决方案：
1. 检查是否有其他 diff 窗口打开
2. 关闭其他 diff 窗口
3. 重试 Agent 操作

**问题：应用更改失败**

解决方案：
1. 检查文件是否只读
2. 检查文件权限
3. 保存文件后重试
4. 检查是否有未保存的更改

**问题：撤销失败**

解决方案：
1. 确认有可撤销的操作
2. 检查操作历史
3. 手动撤销（Ctrl+Z）

**问题：生成的代码不正确**

解决方案：
1. 提供更清晰的代码上下文
2. 使用更强大的模型
3. 在内联聊天中提供更详细的说明
4. 手动调整生成的代码

### 6. 性能问题

#### 症状
- VSCode 响应缓慢
- 扩展激活时间过长
- 补全延迟高
- 内存占用高

#### 诊断工具

**检查激活时间**
1. 打开输出面板
2. 查看 "HiCode" 频道
3. 查找激活时间日志

**检查内存使用**
```
命令面板 → Developer: Show Running Extensions
→ 查看 HiCode 的内存使用
```

#### 优化方案

**减少上下文大小**
```json
{
  "hicode.contextMaxTokens": 2000,
  "hicode.completionMaxTokens": 300
}
```

**启用缓存**
```json
{
  "hicode.enableContextCache": true
}
```

**增加延迟**
```json
{
  "hicode.completionDelay": 500
}
```

**禁用不需要的功能**
```json
{
  "hicode.enableCodeCompletion": false,  // 如果不需要
  "hicode.enableAgent": false            // 如果不需要
}
```

**清理历史记录**
```json
{
  "hicode.maxHistorySessions": 50  // 减少保存的会话数
}
```

### 7. 历史记录问题

#### 症状
- 对话历史丢失
- 无法加载历史会话
- 历史记录不更新

#### 解决方案

**检查自动保存设置**
```json
{
  "hicode.autoSaveHistory": true
}
```

**检查存储权限**
1. 检查 VSCode 存储目录权限
2. 位置：`~/.config/Code/User/globalStorage/`
3. 确保有读写权限

**手动导出重要会话**
```
命令面板 → HiCode: Show Conversation History
→ 选择会话 → 导出
```

**清理损坏的历史**
1. 关闭 VSCode
2. 删除历史存储目录
3. 重启 VSCode
4. 导入之前导出的会话

---

## 错误代码参考

### HTTP 状态码

| 代码 | 含义 | 常见原因 | 解决方案 |
|------|------|----------|----------|
| 400 | Bad Request | 请求格式错误 | 检查模型配置 |
| 401 | Unauthorized | API Key 无效 | 重新配置 API Key |
| 403 | Forbidden | 权限不足 | 检查 API 权限和配额 |
| 404 | Not Found | 端点或模型不存在 | 检查 URL 和模型名称 |
| 429 | Too Many Requests | 请求过于频繁 | 增加延迟，等待后重试 |
| 500 | Internal Server Error | 服务器错误 | 等待后重试，联系支持 |
| 502 | Bad Gateway | 网关错误 | 等待后重试 |
| 503 | Service Unavailable | 服务不可用 | 等待服务恢复 |
| 504 | Gateway Timeout | 网关超时 | 增加超时设置 |

### 网络错误代码

| 代码 | 含义 | 解决方案 |
|------|------|----------|
| ECONNREFUSED | 连接被拒绝 | 检查 URL 和防火墙 |
| ETIMEDOUT | 连接超时 | 增加超时设置，检查网络 |
| ENOTFOUND | DNS 解析失败 | 检查 URL 拼写和 DNS |
| ECONNRESET | 连接被重置 | 检查网络稳定性 |
| EHOSTUNREACH | 主机不可达 | 检查网络连接 |

---

## 性能问题

### 激活时间过长

**目标**：扩展应在 1 秒内激活

**诊断**：
```
输出面板 → HiCode → 查找 "activated in XXXms"
```

**优化方案**：

1. **禁用不需要的功能**
2. **清理扩展**：禁用其他不常用的扩展
3. **更新 VSCode**：使用最新版本
4. **检查系统资源**：确保有足够的内存和 CPU

### 补全响应慢

**目标**：补全应在 500ms 内返回

**诊断**：
```
输出面板 → HiCode → 查找补全请求时间
```

**优化方案**：

1. **减少上下文**：
   ```json
   {
     "hicode.contextMaxTokens": 2000
   }
   ```

2. **减少生成长度**：
   ```json
   {
     "hicode.completionMaxTokens": 300
   }
   ```

3. **使用更快的模型**：
   - DeepSeek Coder（快速）
   - GPT-3.5 Turbo（平衡）

4. **启用缓存**：
   ```json
   {
     "hicode.enableContextCache": true
   }
   ```

### 内存占用高

**诊断**：
```
命令面板 → Developer: Show Running Extensions
```

**优化方案**：

1. **限制历史记录**：
   ```json
   {
     "hicode.maxHistorySessions": 50
   }
   ```

2. **禁用缓存**（如果内存紧张）：
   ```json
   {
     "hicode.enableContextCache": false
   }
   ```

3. **重启 VSCode**：定期重启释放内存

---

## 网络问题

### 代理配置

如果您在代理环境中：

**VSCode 代理设置**：
```json
{
  "http.proxy": "http://proxy.example.com:8080",
  "http.proxyStrictSSL": false
}
```

**环境变量**：
```bash
# Linux/macOS
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080

# Windows
set HTTP_PROXY=http://proxy.example.com:8080
set HTTPS_PROXY=http://proxy.example.com:8080
```

### 防火墙配置

确保以下域名可以访问：

- **DeepSeek**：`api.deepseek.com`
- **OpenAI**：`api.openai.com`
- **智谱 AI**：`open.bigmodel.cn`

### SSL 证书问题

如果遇到 SSL 证书错误：

```json
{
  "http.proxyStrictSSL": false
}
```

**注意**：仅在必要时禁用 SSL 验证，存在安全风险。

---

## 调试工具

### 启用调试模式

```json
{
  "hicode.enableDebugMode": true,
  "hicode.logLevel": "debug"
}
```

### 查看日志

**输出面板**：
```
View → Output → 选择 "HiCode"
```

**日志内容**：
- 扩展激活信息
- API 请求和响应
- 错误堆栈跟踪
- 性能指标

### 导出日志

1. 启用调试模式
2. 重现问题
3. 打开输出面板
4. 复制所有日志
5. 保存到文件

### 开发者工具

**打开开发者工具**：
```
Help → Toggle Developer Tools
```

**查看控制台**：
- 查看 JavaScript 错误
- 查看网络请求
- 查看性能分析

---

## 获取帮助

### 自助资源

1. **用户指南**：`docs/user-guide.md`
2. **配置指南**：`docs/configuration-guide.md`
3. **测试指南**：`docs/testing-guide.md`
4. **GitHub Issues**：搜索已知问题

### 报告问题

在 GitHub 提交 Issue 时，请包含：

**必需信息**：
- HiCode 版本
- VSCode 版本
- 操作系统
- 问题描述
- 重现步骤
- 预期行为
- 实际行为

**可选信息**：
- 日志文件
- 截图或录屏
- 配置文件（隐藏 API Key）
- 相关代码示例

**Issue 模板**：
```markdown
## 问题描述
[简要描述问题]

## 重现步骤
1. [步骤 1]
2. [步骤 2]
3. [步骤 3]

## 预期行为
[描述预期发生的情况]

## 实际行为
[描述实际发生的情况]

## 环境信息
- HiCode 版本：[版本号]
- VSCode 版本：[版本号]
- 操作系统：[OS 和版本]
- 使用的模型：[模型名称]

## 日志
```
[粘贴相关日志]
```

## 截图
[如果适用，添加截图]

## 其他信息
[任何其他相关信息]
```

### 社区支持

- **GitHub Discussions**：讨论和问答
- **Discord/Slack**：实时交流
- **Stack Overflow**：技术问题

### 商业支持

如需商业支持，请联系：
- Email: support@hicode.example.com
- 企业支持计划：[链接]

---

## 常见问题快速索引

| 问题 | 章节 |
|------|------|
| 扩展无法激活 | [扩展无法激活](#1-扩展无法激活) |
| API 调用失败 | [API 调用失败](#2-api-调用失败) |
| 代码补全不工作 | [代码补全不工作](#3-代码补全不工作) |
| 内联聊天无响应 | [内联聊天无响应](#4-内联聊天无响应) |
| Agent 操作失败 | [Agent 操作失败](#5-agent-操作失败) |
| 性能问题 | [性能问题](#6-性能问题) |
| 历史记录问题 | [历史记录问题](#7-历史记录问题) |
| 网络问题 | [网络问题](#网络问题) |
| 代理配置 | [代理配置](#代理配置) |

---

**版本**：0.1.0  
**最后更新**：2024-01-01
