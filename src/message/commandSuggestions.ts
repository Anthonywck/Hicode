/**
 * Command suggestions and quick commands for Chat interface
 * Provides input suggestions and command parsing
 */

export interface CommandSuggestion {
  command: string;
  description: string;
  category: 'agent' | 'chat' | 'system';
  usage?: string;
}

export interface ParsedCommand {
  isCommand: boolean;
  command?: string;
  args?: string[];
  rawInput: string;
}

/**
 * Available quick commands
 */
export const QUICK_COMMANDS: CommandSuggestion[] = [
  {
    command: '/refactor',
    description: '重构选中的代码',
    category: 'agent',
    usage: '/refactor [description]',
  },
  {
    command: '/test',
    description: '为选中的代码生成测试',
    category: 'agent',
    usage: '/test',
  },
  {
    command: '/explain',
    description: '解释选中的代码',
    category: 'chat',
    usage: '/explain',
  },
  {
    command: '/doc',
    description: '为选中的代码生成文档',
    category: 'agent',
    usage: '/doc',
  },
  {
    command: '/fix',
    description: '修复选中代码中的问题',
    category: 'agent',
    usage: '/fix [description]',
  },
  {
    command: '/optimize',
    description: '优化选中的代码',
    category: 'agent',
    usage: '/optimize',
  },
  {
    command: '/clear',
    description: '清空当前对话',
    category: 'system',
    usage: '/clear',
  },
  {
    command: '/help',
    description: '显示帮助信息',
    category: 'system',
    usage: '/help',
  },
];

/**
 * Get command suggestions based on input prefix
 */
export function getCommandSuggestions(input: string): CommandSuggestion[] {
  if (!input.startsWith('/')) {
    return [];
  }

  const prefix = input.toLowerCase();
  
  return QUICK_COMMANDS.filter((cmd) =>
    cmd.command.toLowerCase().startsWith(prefix)
  );
}

/**
 * Parse user input to detect commands
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  
  if (!trimmed.startsWith('/')) {
    return {
      isCommand: false,
      rawInput: input,
    };
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Check if it's a valid command
  const isValid = QUICK_COMMANDS.some((cmd) => cmd.command === command);

  if (!isValid) {
    return {
      isCommand: false,
      rawInput: input,
    };
  }

  return {
    isCommand: true,
    command,
    args,
    rawInput: input,
  };
}

/**
 * Get help text for a specific command or all commands
 */
export function getCommandHelp(command?: string): string {
  if (command) {
    const cmd = QUICK_COMMANDS.find((c) => c.command === command);
    if (cmd) {
      return `${cmd.command} - ${cmd.description}\n用法: ${cmd.usage || cmd.command}`;
    }
    return `未知命令: ${command}`;
  }

  // Return help for all commands
  const categories = {
    agent: 'Agent 操作',
    chat: '聊天功能',
    system: '系统命令',
  };

  let help = '可用命令:\n\n';
  
  for (const [category, title] of Object.entries(categories)) {
    const cmds = QUICK_COMMANDS.filter((c) => c.category === category);
    if (cmds.length > 0) {
      help += `${title}:\n`;
      for (const cmd of cmds) {
        help += `  ${cmd.command} - ${cmd.description}\n`;
      }
      help += '\n';
    }
  }

  return help;
}

/**
 * Validate command arguments
 */
export function validateCommand(parsed: ParsedCommand): {
  valid: boolean;
  error?: string;
} {
  if (!parsed.isCommand || !parsed.command) {
    return { valid: true };
  }

  const cmd = QUICK_COMMANDS.find((c) => c.command === parsed.command);
  if (!cmd) {
    return {
      valid: false,
      error: `未知命令: ${parsed.command}`,
    };
  }

  // Add specific validation rules for commands that require arguments
  // For now, all commands are valid without arguments
  return { valid: true };
}

/**
 * Format command suggestion for display
 */
export function formatSuggestion(suggestion: CommandSuggestion): string {
  return `${suggestion.command} - ${suggestion.description}`;
}

/**
 * Check if input should trigger suggestions
 */
export function shouldShowSuggestions(input: string): boolean {
  return input.startsWith('/') && input.length > 0;
}
