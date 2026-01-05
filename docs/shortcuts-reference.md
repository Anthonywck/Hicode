# HiCode AI Assistant - 快捷命令参考

## 快速查找

- [键盘快捷键](#键盘快捷键)
- [内联聊天命令](#内联聊天命令)
- [命令面板命令](#命令面板命令)
- [右键菜单](#右键菜单)

---

## 键盘快捷键

### 全局快捷键

| 功能 | Windows/Linux | macOS | 说明 |
|------|---------------|-------|------|
| 打开聊天 | `Ctrl+Shift+H` | `Cmd+Shift+H` | 打开聊天侧边栏 |
| 内联聊天 | `Ctrl+Shift+I` | `Cmd+Shift+I` | 在编辑器中显示内联聊天 |
| 新建对话 | `Ctrl+Shift+N` | `Cmd+Shift+N` | 创建新的对话会话 |
| 触发补全 | `Ctrl+Space` | `Cmd+Space` | 手动触发代码补全 |
| 撤销 Agent | `Ctrl+Shift+Z` | `Cmd+Shift+Z` | 撤销最后的 Agent 操作 |

### Agent 快捷键（需要选中代码）

| 功能 | Windows/Linux | macOS | 说明 |
|------|---------------|-------|------|
| 重构代码 | `Ctrl+Shift+R` | `Cmd+Shift+R` | 重构选中的代码 |
| 生成测试 | `Ctrl+Shift+T` | `Cmd+Shift+T` | 为选中代码生成测试 |
| 解释代码 | `Ctrl+Shift+E` | `Cmd+Shift+E` | 解释选中代码的功能 |
| 生成文档 | `Ctrl+Shift+D` | `Cmd+Shift+D` | 生成文档注释 |
| 修复代码 | `Ctrl+Shift+F` | `Cmd+Shift+F` | 修复代码问题 |
| 优化性能 | `Ctrl+Shift+O` | `Cmd+Shift+O` | 优化代码性能 |

### 自定义快捷键

如需修改快捷键：

1. 打开键盘快捷键设置：`Ctrl+K Ctrl+S` / `Cmd+K Cmd+S`
2. 搜索 "HiCode"
3. 点击快捷键进行修改

---

## 内联聊天命令

在内联聊天输入框中输入以下命令：

### 基本命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `/refactor` | 重构选中的代码 | `/refactor` |
| `/test` | 生成测试代码 | `/test` |
| `/explain` | 解释代码功能 | `/explain` |
| `/doc` | 生成文档注释 | `/doc` |
| `/fix` | 修复代码问题 | `/fix` |
| `/optimize` | 优化代码性能 | `/optimize` |

### 使用示例

**重构代码**：
```
1. 选中要重构的代码
2. 按 Ctrl+Shift+I / Cmd+Shift+I
3. 输入 /refactor
4. 按 Enter
```

**生成测试**：
```
1. 选中函数或类
2. 按 Ctrl+Shift+I / Cmd+Shift+I
3. 输入 /test
4. 按 Enter
```

**解释代码**：
```
1. 选中代码
2. 按 Ctrl+Shift+I / Cmd+Shift+I
3. 输入 /explain
4. 按 Enter
```

### 自定义命令

可以在设置中自定义快捷命令：

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

## 命令面板命令

打开命令面板：`Ctrl+Shift+P` / `Cmd+Shift+P`

### 聊天相关

| 命令 | 功能 |
|------|------|
| `HiCode: Open Chat` | 打开聊天界面 |
| `HiCode: New Conversation` | 新建对话 |
| `HiCode: Show Conversation History` | 查看历史记录 |

### 内联聊天相关

| 命令 | 功能 |
|------|------|
| `HiCode: Show Inline Chat` | 显示内联聊天 |

### Agent 相关

| 命令 | 功能 |
|------|------|
| `HiCode: Quick Refactor` | 快速重构 |
| `HiCode: Generate Tests` | 生成测试 |
| `HiCode: Explain Code` | 解释代码 |
| `HiCode: Generate Documentation` | 生成文档 |
| `HiCode: Fix Code` | 修复代码 |
| `HiCode: Optimize Code` | 优化代码 |
| `HiCode: Undo Last Agent Action` | 撤销最后的 Agent 操作 |

### 配置相关

| 命令 | 功能 |
|------|------|
| `HiCode: Switch AI Model` | 切换 AI 模型 |
| `HiCode: Configure AI Models` | 配置 AI 模型 |

### 补全相关

| 命令 | 功能 |
|------|------|
| `HiCode: Trigger AI Completion` | 触发代码补全 |

---

## 右键菜单

在编辑器中右键点击可以看到 HiCode 菜单项：

### 可用菜单项

| 菜单项 | 条件 | 功能 |
|--------|------|------|
| HiCode: Show Inline Chat | 光标在编辑器中 | 显示内联聊天 |
| HiCode: Quick Refactor | 选中代码 | 重构代码 |
| HiCode: Generate Tests | 选中代码 | 生成测试 |
| HiCode: Explain Code | 选中代码 | 解释代码 |
| HiCode: Generate Documentation | 选中代码 | 生成文档 |
| HiCode: Fix Code | 选中代码 | 修复代码 |
| HiCode: Optimize Code | 选中代码 | 优化代码 |

---

## 工作流示例

### 工作流 1：快速重构

```
1. 选中要重构的代码
2. 按 Ctrl+Shift+R / Cmd+Shift+R
   或右键 → HiCode: Quick Refactor
3. 查看差异预览
4. 点击"接受"应用更改
```

### 工作流 2：生成测试

```
1. 选中函数或类
2. 按 Ctrl+Shift+T / Cmd+Shift+T
   或右键 → HiCode: Generate Tests
3. 查看生成的测试代码
4. 点击"接受"应用
```

### 工作流 3：内联问答

```
1. 选中代码（可选）
2. 按 Ctrl+Shift+I / Cmd+Shift+I
3. 输入问题或使用快捷命令
4. 查看响应
5. 如需继续讨论，选择"在 Chat 中继续"
```

### 工作流 4：代码补全

```
1. 开始输入代码
2. 等待自动补全出现
   或按 Ctrl+Space / Cmd+Space 手动触发
3. 使用 Tab 或 Enter 接受建议
   或按 Esc 拒绝
```

### 工作流 5：聊天对话

```
1. 按 Ctrl+Shift+H / Cmd+Shift+H 打开聊天
2. 输入问题
3. 按 Enter 发送
4. 查看流式响应
5. 继续对话或按 Ctrl+Shift+N / Cmd+Shift+N 新建对话
```

---

## 快捷键冲突解决

### 常见冲突

| HiCode 快捷键 | 可能冲突的扩展/功能 | 解决方案 |
|---------------|---------------------|----------|
| `Ctrl+Shift+I` | 开发者工具 | 修改 HiCode 或开发者工具快捷键 |
| `Ctrl+Shift+R` | 重新加载窗口 | 修改其中一个快捷键 |
| `Ctrl+Shift+T` | 重新打开关闭的编辑器 | 修改其中一个快捷键 |
| `Ctrl+Space` | 基本补全 | 通常不冲突，共享触发 |

### 修改快捷键

1. 打开键盘快捷键设置：`Ctrl+K Ctrl+S` / `Cmd+K Cmd+S`
2. 搜索冲突的命令
3. 右键点击 → "Change Keybinding"
4. 按下新的快捷键组合
5. 按 Enter 确认

### 推荐的替代快捷键

如果默认快捷键冲突，可以考虑：

| 功能 | 替代快捷键 (Windows/Linux) | 替代快捷键 (macOS) |
|------|---------------------------|-------------------|
| 内联聊天 | `Ctrl+Alt+I` | `Cmd+Alt+I` |
| 重构代码 | `Ctrl+Alt+R` | `Cmd+Alt+R` |
| 生成测试 | `Ctrl+Alt+T` | `Cmd+Alt+T` |

---

## 提示和技巧

### 提示 1：快速访问常用功能

将最常用的功能快捷键记住：
- 内联聊天：`Ctrl+Shift+I`
- 打开聊天：`Ctrl+Shift+H`
- 重构代码：`Ctrl+Shift+R`

### 提示 2：使用命令面板

如果忘记快捷键，使用命令面板：
1. 按 `Ctrl+Shift+P` / `Cmd+Shift+P`
2. 输入 "HiCode"
3. 选择需要的命令

### 提示 3：右键菜单

在编辑器中右键点击可以快速访问 HiCode 功能，无需记住快捷键。

### 提示 4：内联聊天快捷命令

记住常用的快捷命令：
- `/refactor` - 重构
- `/test` - 测试
- `/explain` - 解释
- `/fix` - 修复

### 提示 5：自定义工作流

根据您的工作习惯自定义快捷键和命令，提高效率。

---

## 打印版快速参考卡

```
╔═══════════════════════════════════════════════════════════════╗
║              HiCode AI Assistant 快速参考                      ║
╠═══════════════════════════════════════════════════════════════╣
║ 全局快捷键                                                     ║
║ ─────────────────────────────────────────────────────────────║
║ Ctrl+Shift+H    打开聊天                                       ║
║ Ctrl+Shift+I    内联聊天                                       ║
║ Ctrl+Shift+N    新建对话                                       ║
║ Ctrl+Space      触发补全                                       ║
║ Ctrl+Shift+Z    撤销 Agent                                     ║
╠═══════════════════════════════════════════════════════════════╣
║ Agent 快捷键（需选中代码）                                     ║
║ ─────────────────────────────────────────────────────────────║
║ Ctrl+Shift+R    重构代码                                       ║
║ Ctrl+Shift+T    生成测试                                       ║
║ Ctrl+Shift+E    解释代码                                       ║
║ Ctrl+Shift+D    生成文档                                       ║
║ Ctrl+Shift+F    修复代码                                       ║
║ Ctrl+Shift+O    优化性能                                       ║
╠═══════════════════════════════════════════════════════════════╣
║ 内联聊天命令                                                   ║
║ ─────────────────────────────────────────────────────────────║
║ /refactor       重构代码                                       ║
║ /test           生成测试                                       ║
║ /explain        解释代码                                       ║
║ /doc            生成文档                                       ║
║ /fix            修复问题                                       ║
║ /optimize       优化性能                                       ║
╠═══════════════════════════════════════════════════════════════╣
║ 命令面板（Ctrl+Shift+P）                                       ║
║ ─────────────────────────────────────────────────────────────║
║ HiCode: Open Chat                  打开聊天                    ║
║ HiCode: Show Inline Chat           内联聊天                    ║
║ HiCode: Switch AI Model            切换模型                    ║
║ HiCode: Configure AI Models        配置模型                    ║
╚═══════════════════════════════════════════════════════════════╝

macOS: 将 Ctrl 替换为 Cmd
```

---

**版本**：0.1.0  
**最后更新**：2024-01-01

**提示**：将此页面添加到浏览器书签，方便随时查阅！
