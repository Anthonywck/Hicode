# 打包指南 (Packaging Guide)

本文档介绍如何将 HiCode 扩展打包成 `.vsix` 文件，以便分发和安装。

## 前置要求

- Node.js >= 18.x
- npm 或 pnpm
- VS Code >= 1.85.0

## 打包步骤

### 1. 安装依赖

首先确保所有依赖都已安装：

```bash
npm install
```

### 2. 构建前端资源（重要）

如果项目使用了 `hicode-vue` 前端项目，需要先构建前端资源：

```bash
# 进入前端项目目录
cd ../hicode-vue

# 安装前端依赖
pnpm install

# 构建并复制资源到扩展的 media 目录
pnpm run build:copy

# 返回扩展项目目录
cd ../hicode
```

**注意**：`build:copy` 脚本会：
- 构建 chat 和 settings 页面
- 将构建产物复制到 `hicode/media/` 目录
- 确保资源路径正确

### 3. 构建扩展代码

编译 TypeScript 源代码：

```bash
npm run build
```

这会生成 `dist/` 目录，包含编译后的 JavaScript 文件。

### 4. 打包扩展

使用以下命令之一打包扩展：

```bash
# 使用当前版本号打包
npm run package

# 打包并自动更新主版本号 (1.0.0 -> 2.0.0)
npm run package:major

# 打包并自动更新次版本号 (1.0.0 -> 1.1.0)
npm run package:minor

# 打包并自动更新补丁版本号 (1.0.0 -> 1.0.1)
npm run package:patch
```

打包完成后，会在项目根目录生成 `.vsix` 文件，例如：
- `hicode-ai-integration-0.1.0.vsix`

### 5. 验证打包结果

打包完成后，可以检查 `.vsix` 文件：

```bash
# Windows PowerShell
Get-Item *.vsix

# Linux/Mac
ls -lh *.vsix
```

## 安装打包的扩展

### 方法 1：命令行安装

```bash
code --install-extension hicode-ai-integration-0.1.0.vsix
```

### 方法 2：VS Code UI 安装

1. 打开 VS Code
2. 点击左侧活动栏的扩展图标（或按 `Ctrl+Shift+X`）
3. 点击扩展视图右上角的 `...` 菜单
4. 选择 `Install from VSIX...`
5. 选择生成的 `.vsix` 文件

### 方法 3：拖拽安装

直接将 `.vsix` 文件拖拽到 VS Code 窗口中。

## 发布到 VS Code 市场

### 准备工作

1. **创建发布者账号**：
   - 访问 [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage)
   - 使用 Microsoft 账号登录
   - 创建发布者（Publisher）

2. **更新 package.json**：
   - 确保 `publisher` 字段与市场中的发布者名称一致
   - 确保版本号符合语义化版本规范

### 发布步骤

1. **安装 vsce 工具**（如果尚未安装）：
   ```bash
   npm install -g @vscode/vsce
   ```

2. **登录到市场**：
   ```bash
   vsce login <publisher-name>
   ```
   例如：`vsce login hicode`

3. **发布扩展**：
   ```bash
   vsce publish
   ```

   或者发布特定版本：
   ```bash
   vsce publish 1.0.0
   ```

4. **验证发布**：
   - 访问 [Visual Studio Marketplace](https://marketplace.visualstudio.com/)
   - 搜索你的扩展名称
   - 确认扩展已成功发布

## 打包配置说明

### .vscodeignore 文件

`.vscodeignore` 文件指定了哪些文件**不**应该包含在打包的扩展中。当前配置会排除：

- 源代码文件（`src/`）
- 测试文件
- 开发依赖（`node_modules/`）
- 构建工具配置文件
- Git 相关文件
- 临时文件

但会包含：
- 编译后的代码（`dist/`）
- 前端构建资源（`media/`）
- 扩展清单文件（`package.json`）
- 图标和资源文件

### package.json 配置

确保 `package.json` 中包含以下关键字段：

```json
{
  "name": "hicode-ai-integration",
  "version": "0.1.0",
  "publisher": "hicode",
  "main": "dist/extension.js",
  "engines": {
    "vscode": "^1.85.0"
  }
}
```

## 常见问题

### Q: 打包时提示缺少文件

**A**: 确保：
1. 已运行 `npm run build` 编译 TypeScript
2. 已构建前端资源（如果使用）
3. `media/` 目录存在且包含必要的 HTML/CSS/JS 文件

### Q: 打包的扩展安装后无法运行

**A**: 检查：
1. `dist/extension.js` 是否存在
2. `package.json` 中的 `main` 字段是否正确
3. VS Code 版本是否满足 `engines.vscode` 要求
4. 查看 VS Code 开发者工具的控制台错误信息

### Q: 前端资源加载失败

**A**: 确保：
1. `media/chatPage/` 和 `media/settings/` 目录存在
2. 这些目录中包含 `index.html` 和必要的资源文件
3. 资源路径在代码中正确引用

### Q: 版本号更新失败

**A**: 手动更新 `package.json` 中的 `version` 字段，然后运行 `npm run package`

## 打包检查清单

在打包前，请确认：

- [ ] 所有依赖已安装（`npm install`）
- [ ] 前端资源已构建并复制到 `media/` 目录
- [ ] TypeScript 代码已编译（`npm run build`）
- [ ] `package.json` 中的版本号正确
- [ ] `package.json` 中的 `publisher` 字段正确
- [ ] `.vscodeignore` 文件配置正确
- [ ] 扩展图标文件存在（`hicode-logo.svg`）
- [ ] 所有必要的资源文件都在正确的位置

## 自动化打包脚本示例

可以创建一个完整的打包脚本 `scripts/package.sh`（Linux/Mac）或 `scripts/package.ps1`（Windows）：

**package.sh**:
```bash
#!/bin/bash
set -e

echo "Building frontend assets..."
cd ../hicode-vue
pnpm install
pnpm run build:copy
cd ../hicode

echo "Building extension..."
npm install
npm run build

echo "Packaging extension..."
npm run package

echo "Done! Extension packaged successfully."
```

**package.ps1**:
```powershell
Write-Host "Building frontend assets..." -ForegroundColor Green
Set-Location ..\hicode-vue
pnpm install
pnpm run build:copy
Set-Location ..\hicode

Write-Host "Building extension..." -ForegroundColor Green
npm install
npm run build

Write-Host "Packaging extension..." -ForegroundColor Green
npm run package

Write-Host "Done! Extension packaged successfully." -ForegroundColor Green
```

## 参考资源

- [VS Code Extension Packaging](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce CLI Documentation](https://github.com/microsoft/vscode-vsce)
- [VS Code Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)
