# Skills 开发指南

## 概述

Skills 是 HiCode Agent 的可扩展技能系统，允许用户定义自定义技能供 Agent 使用。Skills 使用 Markdown 格式定义，存储在 `skills/` 目录中。

## Skill 文件格式

### 基本结构

```markdown
# Skill Name

## Description

Skill description here.

## Usage

How to use this skill.

## Examples

### Example 1

Example usage.

## Parameters

- `param1`: Parameter description
- `param2`: Parameter description

## Notes

Additional notes.
```

### 必需字段

- `# Skill Name`: Skill 名称（必需）
- `## Description`: Skill 描述（必需）

### 可选字段

- `## Usage`: 使用说明
- `## Examples`: 使用示例
- `## Parameters`: 参数说明
- `## Notes`: 注意事项

## Skill 加载

### 自动发现

Skills 会自动从以下目录加载：

1. 工作区根目录的 `skills/` 目录
2. 用户配置目录的 `skills/` 目录

### 手动加载

```typescript
import { SkillManager } from '../skill/skill';

const manager = new SkillManager();
await manager.loadSkills();
```

## Skill 使用

### 在 Agent 中使用

Skills 通过 `skill` 工具调用：

```typescript
// Agent 可以调用 skill 工具
const result = await toolRegistry.call('skill', {
  skillName: 'my-skill',
  input: {
    param1: 'value1',
    param2: 'value2',
  },
});
```

### Skill 工具定义

```typescript
import { Tool } from '../tool/tool';
import { z } from 'zod';

export const SkillTool = Tool.define('skill', {
  description: 'Execute a skill',
  parameters: z.object({
    skillName: z.string().describe('Skill name'),
    input: z.record(z.any()).describe('Skill input parameters'),
  }),
  async execute(params, ctx) {
    const skill = skillManager.getSkill(params.skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${params.skillName}`);
    }
    
    // 执行 skill
    const result = await skill.execute(params.input);
    
    return {
      title: skill.name,
      output: result,
    };
  },
});
```

## Skill 实现

### 基本 Skill

```typescript
import { Skill } from '../skill/skill';

export class MySkill extends Skill {
  name = 'my-skill';
  description = 'My skill description';
  
  async execute(input: Record<string, any>): Promise<string> {
    // Skill 执行逻辑
    return 'Result';
  }
}
```

### 带参数的 Skill

```typescript
export class ParameterizedSkill extends Skill {
  name = 'parameterized-skill';
  description = 'Skill with parameters';
  
  async execute(input: Record<string, any>): Promise<string> {
    const { param1, param2 } = input;
    
    // 使用参数
    return `Result: ${param1}, ${param2}`;
  }
}
```

## Skill 权限

### 权限配置

Skills 可以配置权限规则：

```markdown
# My Skill

## Description

Skill description.

## Permissions

- `read`: Allow reading files
- `write`: Allow writing files
```

### 权限检查

```typescript
export class SecureSkill extends Skill {
  name = 'secure-skill';
  permissions = ['read', 'write'];
  
  async execute(input: Record<string, any>, ctx: ToolContext): Promise<string> {
    // 检查权限
    for (const permission of this.permissions) {
      await ctx.ask({
        permission,
        patterns: ['*'],
        always: [],
        metadata: {},
      });
    }
    
    // 执行 skill
    return 'Result';
  }
}
```

## Skill 示例

### 文件操作 Skill

```markdown
# File Operations

## Description

Perform file operations.

## Usage

Use this skill to read, write, or modify files.

## Examples

### Read File

```
skill: file-operations
input:
  operation: read
  path: ./file.txt
```

### Write File

```
skill: file-operations
input:
  operation: write
  path: ./file.txt
  content: Hello, World!
```
```

### API 调用 Skill

```markdown
# API Call

## Description

Call external APIs.

## Usage

Use this skill to make HTTP requests.

## Parameters

- `url`: API endpoint URL
- `method`: HTTP method (GET, POST, etc.)
- `headers`: Request headers
- `body`: Request body

## Examples

### GET Request

```
skill: api-call
input:
  url: https://api.example.com/data
  method: GET
```
```

## Skill 管理

### 列出所有 Skills

```typescript
const manager = new SkillManager();
const skills = await manager.listSkills();
console.log(skills.map(s => s.name));
```

### 获取 Skill

```typescript
const skill = await manager.getSkill('my-skill');
if (skill) {
  const result = await skill.execute({});
}
```

### 重新加载 Skills

```typescript
await manager.reloadSkills();
```

## 最佳实践

### 1. 清晰的描述

提供清晰的 Skill 描述和使用说明：

```markdown
# My Skill

## Description

This skill does X, Y, and Z. Use it when you need to...

## Usage

1. Step 1
2. Step 2
3. Step 3
```

### 2. 提供示例

包含实际使用示例：

```markdown
## Examples

### Basic Usage

```
skill: my-skill
input:
  param1: value1
```

### Advanced Usage

```
skill: my-skill
input:
  param1: value1
  param2: value2
```
```

### 3. 错误处理

在 Skill 实现中处理错误：

```typescript
async execute(input: Record<string, any>): Promise<string> {
  try {
    // 执行逻辑
    return 'Success';
  } catch (error) {
    throw new Error(`Skill execution failed: ${error.message}`);
  }
}
```

### 4. 参数验证

验证输入参数：

```typescript
async execute(input: Record<string, any>): Promise<string> {
  if (!input.requiredParam) {
    throw new Error('requiredParam is required');
  }
  
  // 执行逻辑
}
```

## 参考

- [Tool Development Guide](./TOOL_DEVELOPMENT.md)
- [Architecture Documentation](./ARCHITECTURE.md)
