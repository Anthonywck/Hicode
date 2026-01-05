# 模板配置示例

本文档提供了各种场景下的模板配置示例，帮助开发者快速创建新模板。

## 基础示例

### 1. 简单的代码问答模板

```typescript
{
  templateType: 'hicode_simple_qa_prompt_type',
  name: '简单问答模板',
  description: '用于简单代码问答的基础模板',
  intents: ['code-question'],
  priority: 5,
  content: `You are a helpful programming assistant.

User's question: ${user_query}

Please provide a clear and concise answer.`,
  slotConfig: [
    {
      name: 'user_query',
      sourcePath: 'user_query',
      defaultValue: '',
      required: true
    }
  ]
}
```

### 2. 带上下文的代码解释模板

```typescript
{
  templateType: 'hicode_code_explain_prompt_type',
  name: '代码解释模板',
  description: '用于解释代码片段的模板',
  intents: ['code-explanation'],
  priority: 10,
  content: `You are an expert ${language} developer.

Please explain the following code:

\`\`\`${language}
${selection}
\`\`\`

Provide a clear explanation covering:
1. What the code does
2. How it works
3. Any important details or edge cases`,
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
    }
  ]
}
```

## 高级示例

### 3. 多槽位模板（代码审查）

```typescript
{
  templateType: 'hicode_code_review_prompt_type',
  name: '代码审查模板',
  description: '用于全面代码审查的专业模板',
  intents: ['code-review'],
  priority: 15,
  content: `You are a senior ${language} code reviewer with expertise in best practices and design patterns.

## File Information
- Path: ${current_file_path}
- Language: ${language}

## Code to Review
\`\`\`${language}
${selection}
\`\`\`

## Review Request
${user_query}

## Instructions
Please provide a comprehensive code review covering:

1. **Code Quality**
   - Readability and maintainability
   - Naming conventions
   - Code organization

2. **Best Practices**
   - ${language} idioms and patterns
   - Design principles (SOLID, DRY, etc.)
   - Error handling

3. **Potential Issues**
   - Bugs or logical errors
   - Edge cases not handled
   - Security concerns

4. **Performance**
   - Time complexity
   - Space complexity
   - Optimization opportunities

5. **Suggestions**
   - Specific improvements
   - Alternative approaches
   - Refactoring recommendations

Please be constructive and provide code examples where appropriate.`,
  slotConfig: [
    {
      name: 'language',
      sourcePath: 'language',
      defaultValue: 'unknown',
      required: true
    },
    {
      name: 'current_file_path',
      sourcePath: 'current_file_path',
      defaultValue: 'unknown file',
      required: false
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
      defaultValue: 'Please review this code',
      required: false
    }
  ]
}
```

### 4. 带历史记录的对话模板

```typescript
{
  templateType: 'hicode_contextual_chat_prompt_type',
  name: '上下文对话模板',
  description: '包含历史记录的对话模板',
  intents: ['chat'],
  priority: 12,
  content: `You are HiCode, an AI programming assistant.

## Conversation History
${history}

## Current Context
${current_file_path ? 'User is working on: ' + current_file_path : 'No file context'}
${language ? 'Language: ' + language : ''}

## User's Message
${user_query}

## Instructions
- Be helpful, concise, and friendly
- Reference previous conversation when relevant
- Provide code examples when appropriate
- Use the user's preferred language for responses`,
  slotConfig: [
    {
      name: 'history',
      sourcePath: 'history',
      defaultValue: 'No previous conversation',
      required: false
    },
    {
      name: 'current_file_path',
      sourcePath: 'current_file_path',
      defaultValue: '',
      required: false
    },
    {
      name: 'language',
      sourcePath: 'language',
      defaultValue: '',
      required: false
    },
    {
      name: 'user_query',
      sourcePath: 'user_query',
      defaultValue: '',
      required: true
    }
  ]
}
```

### 5. 代码生成模板

```typescript
{
  templateType: 'hicode_code_generation_prompt_type',
  name: '代码生成模板',
  description: '用于生成新代码的模板',
  intents: ['code-generation'],
  priority: 10,
  content: `You are an expert ${language} developer.

## Task
Generate ${language} code based on the following requirements:

${user_query}

## Context
${current_file_path ? 'Target file: ' + current_file_path : ''}
${selection ? 'Existing code context:\n```' + language + '\n' + selection + '\n```' : ''}

## Requirements
1. Write clean, readable, and maintainable code
2. Follow ${language} best practices and conventions
3. Include appropriate comments
4. Handle edge cases and errors
5. Ensure the code is production-ready

## Output Format
Provide only the code in a single code block without additional explanation unless specifically requested.`,
  slotConfig: [
    {
      name: 'language',
      sourcePath: 'language',
      defaultValue: 'unknown',
      required: true
    },
    {
      name: 'user_query',
      sourcePath: 'user_query',
      defaultValue: '',
      required: true
    },
    {
      name: 'current_file_path',
      sourcePath: 'current_file_path',
      defaultValue: '',
      required: false
    },
    {
      name: 'selection',
      sourcePath: 'selection',
      defaultValue: '',
      required: false
    }
  ]
}
```

## 特殊场景示例

### 6. 多语言支持模板

```typescript
{
  templateType: 'hicode_multilang_prompt_type',
  name: '多语言支持模板',
  description: '根据用户语言环境调整响应的模板',
  intents: ['code-question', 'chat'],
  priority: 8,
  content: `You are HiCode, an AI programming assistant.

Language: ${language}
User Query: ${user_query}

Instructions:
- Respond in Chinese (zh-CN) by default
- Provide code examples when relevant
- Be concise and helpful

${selection ? 'Code Context:\n```' + language + '\n' + selection + '\n```' : ''}`,
  slotConfig: [
    {
      name: 'language',
      sourcePath: 'language',
      defaultValue: 'unknown',
      required: false
    },
    {
      name: 'user_query',
      sourcePath: 'user_query',
      defaultValue: '',
      required: true
    },
    {
      name: 'selection',
      sourcePath: 'selection',
      defaultValue: '',
      required: false
    }
  ]
}
```

### 7. 调试辅助模板

```typescript
{
  templateType: 'hicode_debug_helper_prompt_type',
  name: '调试辅助模板',
  description: '帮助用户调试代码问题的模板',
  intents: ['code-question'],
  priority: 12,
  content: `You are a debugging expert specializing in ${language}.

## Problem Description
${user_query}

## Code with Issue
\`\`\`${language}
${selection}
\`\`\`

## File Context
${current_file_path}

## Debugging Approach
Please help debug this issue by:

1. **Identify the Problem**
   - Analyze the code for potential issues
   - Identify the root cause

2. **Explain the Issue**
   - Describe what's wrong and why
   - Explain the expected vs actual behavior

3. **Provide Solution**
   - Suggest a fix with code example
   - Explain why the fix works

4. **Prevention**
   - Suggest how to avoid similar issues
   - Recommend best practices

Please be thorough but concise.`,
  slotConfig: [
    {
      name: 'language',
      sourcePath: 'language',
      defaultValue: 'unknown',
      required: true
    },
    {
      name: 'user_query',
      sourcePath: 'user_query',
      defaultValue: '',
      required: true
    },
    {
      name: 'selection',
      sourcePath: 'selection',
      defaultValue: '',
      required: true
    },
    {
      name: 'current_file_path',
      sourcePath: 'current_file_path',
      defaultValue: 'unknown file',
      required: false
    }
  ]
}
```

### 8. 单元测试生成模板

```typescript
{
  templateType: 'hicode_test_generation_prompt_type',
  name: '单元测试生成模板',
  description: '为代码生成单元测试的模板',
  intents: ['code-generation'],
  priority: 13,
  content: `You are a testing expert specializing in ${language}.

## Code to Test
\`\`\`${language}
${selection}
\`\`\`

## Task
Generate comprehensive unit tests for the above code.

## Requirements
1. Use the standard testing framework for ${language}
2. Cover normal cases, edge cases, and error cases
3. Include descriptive test names
4. Add comments explaining what each test validates
5. Ensure tests are independent and can run in any order

## Test Structure
- Setup: Prepare test data and dependencies
- Execute: Call the function/method being tested
- Assert: Verify the expected behavior
- Cleanup: Clean up resources if needed

${user_query ? 'Additional Requirements:\n' + user_query : ''}

Please provide complete, runnable test code.`,
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
      required: false
    }
  ]
}
```

## 模板设计模式

### 模式 1: 渐进式详细程度

根据用户需求提供不同详细程度的响应：

```typescript
content: `${user_query.includes('详细') || user_query.includes('detail') ? 
  '请提供详细的解释，包括原理、示例和最佳实践。' : 
  '请提供简洁的回答。'}`
```

### 模式 2: 条件性内容

根据上下文是否存在调整模板内容：

```typescript
content: `You are a ${language} expert.

${selection ? 
  'Please analyze this code:\n```' + language + '\n' + selection + '\n```' : 
  'Please answer the following question:'
}

${user_query}`
```

### 模式 3: 多重槽位复用

在模板中多次使用同一槽位：

```typescript
content: `Language: ${language}

Code in ${language}:
\`\`\`${language}
${code}
\`\`\`

Please explain this ${language} code.`
```

## 最佳实践总结

### 1. 命名规范
- 使用 `hicode_操作类型_prompt_type` 格式
- 名称要清晰描述模板用途
- 描述要简洁明了

### 2. 槽位设计
- 只声明需要替换的槽位
- 为可选槽位提供合理的默认值
- 使用清晰的槽位名称

### 3. 内容组织
- 使用清晰的结构和标题
- 提供明确的指令
- 包含必要的上下文信息

### 4. 优先级设置
- 通用模板：5-10
- 专用模板：10-15
- 特殊用途模板：15-20
- 系统内部模板：100+

### 5. 意图映射
- 一个模板可以支持多个意图
- 确保每个意图至少有一个模板
- 使用优先级控制模板选择

### 6. 测试验证
- 为每个新模板编写测试
- 测试各种输入场景
- 验证槽位替换正确性

## 调试技巧

### 查看模板选择过程

```typescript
// 在开发环境中，系统会输出详细日志
console.log('Selected template:', template.templateType);
console.log('Intent:', intent);
console.log('Context:', context);
```

### 验证槽位替换

```typescript
// 检查渲染后的内容
const rendered = templateRenderer.render(template, context);
console.log('Rendered content:', rendered);

// 验证所有槽位都被替换
template.slotConfig.forEach(slot => {
  const pattern = `\${${slot.name}}`;
  if (rendered.includes(pattern)) {
    console.warn(`Slot ${slot.name} was not replaced`);
  }
});
```

## 常见错误和解决方案

### 错误 1: 槽位未被替换

**原因**: 槽位未在 `slotConfig` 中声明

**解决方案**: 在 `slotConfig` 中添加槽位配置

```typescript
// ❌ 错误
content: `User: ${user_query}`,
slotConfig: []

// ✅ 正确
content: `User: ${user_query}`,
slotConfig: [
  { name: 'user_query', sourcePath: 'user_query' }
]
```

### 错误 2: 上下文数据缺失

**原因**: `sourcePath` 指向的字段在上下文中不存在

**解决方案**: 提供默认值或检查数据来源

```typescript
// ✅ 提供默认值
slotConfig: [
  {
    name: 'language',
    sourcePath: 'language',
    defaultValue: 'unknown',  // 提供默认值
    required: false
  }
]
```

### 错误 3: 模板未被选中

**原因**: 意图不匹配或优先级太低

**解决方案**: 检查意图配置和优先级设置

```typescript
// 确保意图匹配
intents: ['code-question'],  // 包含目标意图

// 提高优先级
priority: 15  // 高于其他竞争模板
```

## 进阶主题

### 自定义槽位处理器

如果需要更复杂的槽位处理逻辑，可以扩展 `TemplateRenderer`：

```typescript
class CustomTemplateRenderer extends TemplateRenderer {
  protected getValueFromContext(
    context: ContextData,
    path: string,
    defaultValue?: string
  ): string {
    // 自定义逻辑
    const value = super.getValueFromContext(context, path, defaultValue);
    
    // 例如：转换为大写
    if (path === 'language') {
      return value.toUpperCase();
    }
    
    return value;
  }
}
```

### 动态模板内容

虽然模板内容是静态的，但可以通过槽位实现动态效果：

```typescript
// 在上下文收集器中准备动态内容
class CustomContextCollector extends ContextCollector {
  collectContext(message: ChatMessage): ContextData {
    const context = super.collectContext(message);
    
    // 添加动态内容
    context.timestamp = new Date().toISOString();
    context.user_level = this.getUserLevel(message);
    
    return context;
  }
}
```

## 总结

本文档提供了丰富的模板配置示例，涵盖了从基础到高级的各种场景。通过这些示例，开发者可以：

1. 快速创建新模板
2. 理解模板设计模式
3. 掌握最佳实践
4. 避免常见错误
5. 实现高级功能

如有问题或需要更多示例，请参考主 README 文档或联系开发团队。
