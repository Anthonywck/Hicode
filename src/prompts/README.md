# Prompt 模板系统

## 概述

Prompt 模板系统是 HiCode 的核心组件，负责管理和处理提示词模板。该系统根据用户意图自动选择合适的 Prompt 模板，并将上下文数据填充到模板的槽位中，生成最终发送给大模型的提示词。

## 核心特性

- **模板管理**: 支持通过配置文件定义和管理多个模板
- **意图识别**: 使用大模型智能识别用户意图
- **自动选择**: 根据意图自动选择最合适的模板
- **槽位替换**: 将上下文数据填充到模板槽位
- **灵活配置**: 支持 JSON 和 TypeScript 格式的配置文件
- **优雅降级**: 完善的错误处理和回退机制

## 系统架构

系统由五个核心组件组成：

```
┌─────────────────────────────────────────────────────────────┐
│                   Prompt Manager                            │
│  协调各组件，提供统一接口                                      │
└────┬────────────┬────────────┬────────────┬─────────────────┘
     │            │            │            │
     ▼            ▼            ▼            ▼
┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│Template │ │ Intent   │ │ Context  │ │  Template    │
│Registry │ │Recognizer│ │Collector │ │  Renderer    │
└─────────┘ └──────────┘ └──────────┘ └──────────────┘
```

### 组件说明

1. **Template Registry (模板注册表)**: 加载和管理所有模板配置
2. **Intent Recognizer (意图识别器)**: 使用大模型识别用户意图
3. **Context Collector (上下文收集器)**: 从消息中收集上下文数据
4. **Template Renderer (模板渲染器)**: 执行槽位替换和模板渲染
5. **Prompt Manager (Prompt 管理器)**: 协调各组件完成整个流程

## 快速开始

### 基本使用

```typescript
import { PromptManager } from './prompts/promptManager';
import { ChatMessage } from './api/types';

// 创建 Prompt Manager 实例（通常在系统初始化时完成）
const promptManager = new PromptManager(
  templateRegistry,
  intentRecognizer,
  contextCollector,
  templateRenderer
);

// 使用自动模式（系统自动识别意图并选择模板）
const message: ChatMessage = {
  role: 'user',
  content: '如何实现一个快速排序算法？',
  context: {
    currentFile: {
      path: 'sort.ts',
      language: 'typescript',
      content: '// 当前文件内容'
    }
  }
};

const enrichedContent = await promptManager.enrichMessageContent(message);
```

### 指定意图模式

```typescript
// 跳过意图识别，直接使用指定意图
const enrichedContent = await promptManager.enrichMessageContent(message, {
  intent: 'code-question'
});
```

### 指定模板类型模式

```typescript
// 直接使用指定类型的模板
const enrichedContent = await promptManager.enrichMessageContent(message, {
  templateType: 'hicode_common_chat_prompt_type'
});
```

## 添加新模板

### 步骤 1: 定义模板配置

在 `src/prompts/templates/defaultTemplates.ts` 中添加新模板：

```typescript
export const defaultTemplates: TemplateConfig[] = [
  // ... 现有模板
  {
    // 模板类型（唯一标识符，命名规范：hicode_操作类型_prompt_type）
    templateType: 'hicode_code_review_prompt_type',
    
    // 模板名称
    name: '代码审查模板',
    
    // 模板描述（可选）
    description: '用于代码审查的专用模板',
    
    // 适用的意图类型列表
    intents: ['code-review'],
    
    // 优先级（数字越大优先级越高）
    priority: 10,
    
    // 模板内容（使用 ${槽位名} 标记可替换部分）
    content: `You are an expert code reviewer.
Please review the following ${language} code:

\`\`\`${language}
${selection}
\`\`\`

User's question: ${user_query}

Provide a detailed code review covering:
1. Code quality and best practices
2. Potential bugs or issues
3. Performance considerations
4. Suggestions for improvement`,
    
    // 槽位配置列表
    slotConfig: [
      {
        name: 'language',
        sourcePath: 'language',
        defaultValue: 'unknown',
        required: true
      },
      {
        name: 'selection',
        sourcePath: 'selection',
        defaultValue: '',
        required: true
      },
      {
        name: 'user_query',
        sourcePath: 'user_query',
        defaultValue: '',
        required: true
      }
    ]
  }
];
```

### 步骤 2: 理解槽位配置

槽位配置定义了模板中哪些 `${...}` 结构会被替换：

```typescript
interface SlotConfig {
  // 槽位名称（对应模板中的 ${name}）
  name: string;
  
  // 数据来源路径（从 ContextData 中获取值的路径）
  sourcePath: string;
  
  // 默认值（当上下文中没有该值时使用）
  defaultValue?: string;
  
  // 是否必需
  required?: boolean;
}
```

### 步骤 3: 可用的上下文字段

以下是可以在 `sourcePath` 中使用的字段：

- `user_query`: 用户查询内容
- `language`: 编程语言
- `history`: 对话历史
- `selection`: 选中的代码
- `current_file`: 当前文件内容
- `current_file_path`: 当前文件路径
- `related_files`: 相关文件信息

### 步骤 4: 模板命名规范

模板类型必须遵循命名规范：`hicode_操作类型_prompt_type`

示例：
- `hicode_common_chat_prompt_type`（统一的通用对话和代码问答模板）
- `hicode_code_review_prompt_type`
- `hicode_code_generation_prompt_type`

### 步骤 5: 意图类型

系统支持以下意图类型：

- `chat`: 通用对话
- `code-question`: 代码问答
- `code-completion`: 代码补全
- `code-explanation`: 代码解释
- `code-generation`: 代码生成
- `code-review`: 代码审查

## 模板最佳实践

### 1. 槽位显式声明

只有在 `slotConfig` 中声明的槽位才会被替换。未声明的 `${...}` 结构会保持原样。

```typescript
// ✅ 正确：槽位在配置中声明
content: `User query: ${user_query}`,
slotConfig: [
  { name: 'user_query', sourcePath: 'user_query' }
]

// ❌ 错误：槽位未声明，不会被替换
content: `User query: ${user_query}`,
slotConfig: []  // 空配置
```

### 2. 提供默认值

为非必需槽位提供合理的默认值：

```typescript
slotConfig: [
  {
    name: 'history',
    sourcePath: 'history',
    defaultValue: '',  // 空字符串作为默认值
    required: false
  }
]
```

### 3. 多重名槽位

同一槽位可以在模板中出现多次，所有实例都会被替换为相同的值：

```typescript
content: `Language: ${language}
Code in ${language}:
\`\`\`${language}
${code}
\`\`\``
```

### 4. 优先级设置

当多个模板匹配同一意图时，使用优先级控制选择：

```typescript
// 通用模板：低优先级
{ templateType: 'generic', intents: ['code-question'], priority: 5 }

// 专用模板：高优先级
{ templateType: 'specific', intents: ['code-question'], priority: 10 }
```

## API 参考

### PromptManager

#### enrichMessageContent(message, options?)

丰富消息内容，替换 adapter 中的 `enrichMessageContent` 方法。

**参数：**

- `message: ChatMessage` - 聊天消息对象
- `options?: PromptManagerOptions` - 可选配置
  - `intent?: IntentType` - 直接指定意图类型
  - `templateType?: string` - 直接指定模板类型

**返回值：** `Promise<string>` - 渲染后的提示词字符串

**使用模式：**

1. **自动模式**（不提供 options）：自动识别意图并选择模板
2. **指定意图模式**（提供 intent）：跳过意图识别，使用指定意图选择模板
3. **指定模板类型模式**（提供 templateType）：直接使用指定类型的模板
4. **组合模式**（同时提供 intent 和 templateType）：使用指定意图下的指定类型模板

**示例：**

```typescript
// 自动模式
await promptManager.enrichMessageContent(message);

// 指定意图
await promptManager.enrichMessageContent(message, { 
  intent: 'code-question' 
});

// 指定模板类型
await promptManager.enrichMessageContent(message, { 
  templateType: 'hicode_common_chat_prompt_type' 
});

// 组合模式
await promptManager.enrichMessageContent(message, { 
  intent: 'code-question',
  templateType: 'hicode_common_chat_prompt_type'
});
```

### TemplateRegistry

#### getTemplate(options)

查询模板（支持通过意图或模板类型查询）。

**参数：**

- `options: TemplateQueryOptions`
  - `intent?: IntentType` - 意图类型（可选）
  - `templateType?: string` - 模板类型（可选）

**返回值：** `TemplateConfig | undefined`

**查询规则：**

1. 只提供 `templateType`：直接返回该类型的模板
2. 只提供 `intent`：返回该意图下优先级最高的模板
3. 同时提供：返回该意图下指定类型的模板
4. 都不提供：返回 `undefined`

#### getTemplatesByIntent(intent)

根据意图获取所有匹配的模板列表。

**参数：**

- `intent: IntentType` - 意图类型

**返回值：** `TemplateConfig[]` - 按优先级排序的模板列表

#### getTemplateByType(templateType)

根据模板类型获取模板。

**参数：**

- `templateType: string` - 模板类型

**返回值：** `TemplateConfig | undefined`

#### getDefaultTemplate()

获取默认模板。

**返回值：** `TemplateConfig` - 默认通用模板

### IntentRecognizer

#### recognizeIntent(message)

识别用户意图。

**参数：**

- `message: ChatMessage` - 聊天消息对象

**返回值：** `Promise<IntentType>` - 识别的意图类型

### ContextCollector

#### collectContext(message)

从消息中收集上下文数据。

**参数：**

- `message: ChatMessage` - 聊天消息对象

**返回值：** `ContextData` - 结构化的上下文数据

### TemplateRenderer

#### render(template, context)

渲染模板。

**参数：**

- `template: TemplateConfig` - 模板配置
- `context: ContextData` - 上下文数据

**返回值：** `string` - 渲染后的字符串

## 错误处理

系统采用优雅降级策略：

1. **模板加载失败**: 使用硬编码的默认模板
2. **意图识别失败**: 使用默认 'chat' 意图
3. **模板未找到**: 使用默认通用模板
4. **上下文数据缺失**: 使用槽位配置的默认值或空字符串
5. **槽位替换失败**: 保留原始槽位标记，继续处理其他槽位

所有错误都会被记录到日志中，但不会导致系统崩溃。

## 调试

### 启用调试模式

在开发环境中，系统会输出详细的处理过程：

```typescript
// 系统会自动检测环境并调整日志级别
// 开发环境：详细日志
// 生产环境：最小化日志
```

### 日志级别

- **ERROR**: 严重错误，影响系统功能
- **WARN**: 警告，功能降级但系统可用
- **INFO**: 信息，正常的回退行为
- **DEBUG**: 调试信息，详细的处理过程

## 性能优化

系统采用以下优化策略：

1. **启动时加载**: 所有模板在启动时一次性加载到内存
2. **正则缓存**: 缓存已编译的正则表达式
3. **高效替换**: 使用高效的字符串替换算法
4. **避免复制**: 最小化不必要的字符串复制和内存分配

目标性能：单个请求的模板选择和渲染在 10ms 内完成。

## 测试

系统采用双重测试策略：

- **单元测试**: 验证具体示例和边缘情况
- **属性测试**: 使用 fast-check 验证通用属性

运行测试：

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test -- templateRegistry.test.ts

# 运行属性测试
npm test -- --testNamePattern="Property"
```

## 扩展性

系统设计遵循 SOLID 原则，支持以下扩展：

1. **自定义模板加载器**: 实现 `ITemplateRegistry` 接口
2. **自定义槽位处理器**: 扩展 `TemplateRenderer` 类
3. **自定义意图识别策略**: 实现 `IIntentRecognizer` 接口

## 常见问题

### Q: 如何添加新的意图类型？

A: 在 `types.ts` 中的 `IntentType` 类型定义中添加新的意图类型，然后在意图识别器中更新映射逻辑。

### Q: 模板中的 ${...} 没有被替换？

A: 检查该槽位是否在 `slotConfig` 中声明。只有声明的槽位才会被替换。

### Q: 如何调试模板选择过程？

A: 查看控制台日志，系统会输出模板选择和渲染的详细信息。

### Q: 可以在运行时动态添加模板吗？

A: 当前版本不支持运行时动态添加。模板在系统启动时加载。如需添加新模板，需要修改配置文件并重启系统。

### Q: 如何处理多语言模板？

A: 可以为不同语言创建不同的模板类型，或在模板内容中使用条件逻辑。

## 贡献指南

欢迎贡献新的模板或改进现有功能！请遵循以下步骤：

1. Fork 项目
2. 创建特性分支
3. 添加测试（单元测试和属性测试）
4. 确保所有测试通过
5. 提交 Pull Request

## 许可证

本项目遵循 MIT 许可证。
