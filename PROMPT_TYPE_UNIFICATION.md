# Prompt 类型统一更新摘要

## 更新概述

将 `hicode_code_question_prompt_type` 重命名为 `hicode_common_chat_prompt_type`，删除旧的 `hicode_common_chat_prompt_type`，统一为一种 chat 方式。

## 更新日期

2025-12-25

## 变更内容

### 1. 核心类型定义 (src/prompts/types.ts)

- 更新 `TemplateConfig` 接口的注释，说明统一使用 `hicode_common_chat_prompt_type`

### 2. 默认模板配置 (src/prompts/templates/defaultTemplates.ts)

**变更前：**
- `hicode_code_question_prompt_type` - 代码问答默认模板（仅支持 `code-question` 意图）
- `hicode_common_chat_prompt_type` - 通用对话默认模板（仅支持 `chat` 意图）

**变更后：**
- `hicode_common_chat_prompt_type` - 通用对话默认模板（同时支持 `chat` 和 `code-question` 意图）
- 模板内容使用原 `hicode_code_question_prompt_type` 的内容（更强大的代码问答能力）
- 模板描述更新为："用于通用对话和代码问答的统一模板"

### 3. 测试文件更新

#### src/prompts/__test__/initialization.test.ts
- 将所有 `hicode_code_question_prompt_type` 引用改为 `hicode_common_chat_prompt_type`
- 更新模板名称验证：从 "代码问答默认模板" 改为 "通用对话默认模板"
- 修复变量名引用错误

#### src/prompts/__test__/promptManager.test.ts
- 将测试中的 `hicode_code_question_prompt_type` 改为 `hicode_common_chat_prompt_type`

#### src/prompts/__test__/promptManager.property.test.ts
- 从模板类型生成器中移除 `hicode_code_question_prompt_type`
- 保留 `hicode_common_chat_prompt_type` 和 `hicode_intent_recognition_prompt_type`

### 4. 文档更新

#### src/prompts/README.md
- 更新所有示例代码中的模板类型引用
- 更新模板类型命名规范说明
- 示例列表中移除 `hicode_code_question_prompt_type`，保留统一的 `hicode_common_chat_prompt_type`

#### .kiro/specs/prompt-template-system/design.md
- 更新 `TemplateConfig` 接口注释
- 更新默认模板配置示例，合并两个模板为一个
- 新模板同时支持 `chat` 和 `code-question` 意图

#### .kiro/specs/prompt-template-system/tasks.md
- 更新任务描述，说明统一的模板配置

## 技术影响

### 向后兼容性
- **破坏性变更**：移除了 `hicode_code_question_prompt_type` 类型
- 如果有外部代码直接引用 `hicode_code_question_prompt_type`，需要更新为 `hicode_common_chat_prompt_type`

### 功能影响
- **增强**：统一的模板同时支持通用对话和代码问答，提供更强大的能力
- **简化**：减少了模板类型的数量，降低了系统复杂度
- **灵活性**：单一模板可以处理多种意图类型，提高了系统的灵活性

### 性能影响
- 无性能影响，模板数量减少可能略微提升查询效率

## 测试结果

所有测试通过：
- ✅ src/prompts/__test__/initialization.test.ts (16 passed)
- ✅ src/prompts/__test__/promptManager.test.ts (16 passed)
- ✅ src/prompts/__test__/promptManager.property.test.ts (11 passed)
- ✅ 所有其他 prompts 测试套件 (154 passed)

## 迁移指南

如果你的代码中使用了 `hicode_code_question_prompt_type`，请按以下步骤迁移：

### 1. 更新模板类型引用

```typescript
// 旧代码
await promptManager.enrichMessageContent(message, {
  templateType: 'hicode_code_question_prompt_type'
});

// 新代码
await promptManager.enrichMessageContent(message, {
  templateType: 'hicode_common_chat_prompt_type'
});
```

### 2. 更新自定义模板配置

如果你有自定义的模板配置文件，请更新模板类型：

```typescript
// 旧配置
{
  templateType: 'hicode_code_question_prompt_type',
  // ...
}

// 新配置
{
  templateType: 'hicode_common_chat_prompt_type',
  // ...
}
```

### 3. 意图识别无需更改

意图识别逻辑无需更改，系统会自动将 `code-question` 意图映射到新的统一模板。

## 相关文件清单

### 核心代码
- src/prompts/types.ts
- src/prompts/templates/defaultTemplates.ts

### 测试文件
- src/prompts/__test__/initialization.test.ts
- src/prompts/__test__/promptManager.test.ts
- src/prompts/__test__/promptManager.property.test.ts

### 文档
- src/prompts/README.md
- .kiro/specs/prompt-template-system/design.md
- .kiro/specs/prompt-template-system/tasks.md

## 总结

此次更新成功将两种 prompt 类型统一为一种，简化了系统设计，同时保持了功能的完整性。新的统一模板同时支持通用对话和代码问答，提供了更好的用户体验。所有测试均已通过，确保了系统的稳定性。
