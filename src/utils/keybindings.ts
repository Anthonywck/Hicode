/**
 * Keyboard shortcuts and keybinding utilities
 * Defines keyboard shortcuts for common operations
 */

export interface KeyBinding {
  key: string;
  command: string;
  when?: string;
  description: string;
}

/**
 * Default keyboard shortcuts for HiCode
 * These should be registered in package.json
 */
export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  {
    key: 'ctrl+shift+h',
    command: 'hicode.openChat',
    description: '打开 HiCode 聊天界面',
  },
  {
    key: 'ctrl+shift+i',
    command: 'hicode.inlineChat',
    when: 'editorTextFocus',
    description: '在编辑器中打开内联聊天',
  },
  {
    key: 'ctrl+shift+k',
    command: 'hicode.triggerCompletion',
    when: 'editorTextFocus',
    description: '触发 AI 代码补全',
  },
  {
    key: 'ctrl+shift+r',
    command: 'hicode.refactorCode',
    when: 'editorHasSelection',
    description: '重构选中的代码',
  },
  {
    key: 'ctrl+shift+t',
    command: 'hicode.generateTests',
    when: 'editorHasSelection',
    description: '为选中代码生成测试',
  },
  {
    key: 'ctrl+shift+d',
    command: 'hicode.generateDocs',
    when: 'editorHasSelection',
    description: '为选中代码生成文档',
  },
  {
    key: 'ctrl+shift+e',
    command: 'hicode.explainCode',
    when: 'editorHasSelection',
    description: '解释选中的代码',
  },
  {
    key: 'ctrl+shift+n',
    command: 'hicode.newConversation',
    description: '开始新对话',
  },
  {
    key: 'ctrl+shift+l',
    command: 'hicode.showHistory',
    description: '显示对话历史',
  },
  {
    key: 'escape',
    command: 'hicode.dismissInlineChat',
    when: 'hicode.inlineChatVisible',
    description: '关闭内联聊天',
  },
];

/**
 * Get keybinding for a specific command
 */
export function getKeybindingForCommand(commandId: string): KeyBinding | undefined {
  return DEFAULT_KEYBINDINGS.find((kb) => kb.command === commandId);
}

/**
 * Get all keybindings for a specific context
 */
export function getKeybindingsForContext(context: string): KeyBinding[] {
  return DEFAULT_KEYBINDINGS.filter((kb) => {
    if (!kb.when) return true;
    return kb.when.includes(context);
  });
}

/**
 * Format keybinding for display
 */
export function formatKeybinding(key: string): string {
  return key
    .split('+')
    .map((part) => part.trim())
    .map((part) => {
      if (part === 'ctrl') return 'Ctrl';
      if (part === 'shift') return 'Shift';
      if (part === 'alt') return 'Alt';
      if (part === 'cmd') return 'Cmd';
      return part.toUpperCase();
    })
    .join(' + ');
}

/**
 * Get keybinding display text for a command
 */
export function getKeybindingDisplay(commandId: string): string | null {
  const keybinding = getKeybindingForCommand(commandId);
  if (!keybinding) return null;
  return formatKeybinding(keybinding.key);
}

/**
 * Generate package.json keybindings configuration
 */
export function generatePackageJsonKeybindings(): Array<{
  command: string;
  key: string;
  when?: string;
}> {
  return DEFAULT_KEYBINDINGS.map((kb) => ({
    command: kb.command,
    key: kb.key,
    ...(kb.when && { when: kb.when }),
  }));
}

/**
 * Validate keybinding format
 */
export function validateKeybinding(key: string): boolean {
  // Basic validation for keybinding format
  const validModifiers = ['ctrl', 'shift', 'alt', 'cmd', 'meta'];
  const parts = key.toLowerCase().split('+');
  
  if (parts.length === 0) return false;
  
  // Last part should be the key
  const mainKey = parts[parts.length - 1];
  if (!mainKey || mainKey.length === 0) return false;
  
  // Check modifiers
  const modifiers = parts.slice(0, -1);
  for (const modifier of modifiers) {
    if (!validModifiers.includes(modifier)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if keybinding conflicts with another
 */
export function hasKeybindingConflict(key1: string, key2: string): boolean {
  return key1.toLowerCase() === key2.toLowerCase();
}

/**
 * Get all command IDs
 */
export function getAllCommandIds(): string[] {
  return DEFAULT_KEYBINDINGS.map((kb) => kb.command);
}
