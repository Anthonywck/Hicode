/**
 * Message actions for Chat interface
 * Provides copy, edit, and delete operations for messages
 */

export interface MessageAction {
  id: string;
  label: string;
  icon?: string;
  handler: (messageId: string) => void | Promise<void>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

/**
 * Copy message content to clipboard
 */
export async function copyMessageContent(content: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(content);
      return true;
    }
    
    // Fallback for environments without clipboard API
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch (error) {
    console.error('Failed to copy message:', error);
    return false;
  }
}

/**
 * Get available actions for a message
 */
export function getMessageActions(
  message: Message,
  callbacks: {
    onCopy?: (messageId: string) => void | Promise<void>;
    onEdit?: (messageId: string) => void | Promise<void>;
    onDelete?: (messageId: string) => void | Promise<void>;
    onRegenerate?: (messageId: string) => void | Promise<void>;
  }
): MessageAction[] {
  const actions: MessageAction[] = [];

  // Copy action - available for all messages
  if (callbacks.onCopy) {
    actions.push({
      id: 'copy',
      label: '复制',
      icon: 'copy',
      handler: callbacks.onCopy,
    });
  }

  // Edit action - only for user messages
  if (message.role === 'user' && callbacks.onEdit) {
    actions.push({
      id: 'edit',
      label: '编辑',
      icon: 'edit',
      handler: callbacks.onEdit,
    });
  }

  // Regenerate action - only for assistant messages
  if (message.role === 'assistant' && callbacks.onRegenerate) {
    actions.push({
      id: 'regenerate',
      label: '重新生成',
      icon: 'refresh',
      handler: callbacks.onRegenerate,
    });
  }

  // Delete action - available for user and assistant messages
  if (message.role !== 'system' && callbacks.onDelete) {
    actions.push({
      id: 'delete',
      label: '删除',
      icon: 'trash',
      handler: callbacks.onDelete,
    });
  }

  return actions;
}

/**
 * Format message timestamp for display
 */
export function formatMessageTimestamp(timestamp: Date): string {
  const now = new Date();
  const diff = now.getTime() - timestamp.getTime();
  
  // Less than 1 minute
  if (diff < 60000) {
    return '刚刚';
  }
  
  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}分钟前`;
  }
  
  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}小时前`;
  }
  
  // Less than 7 days
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days}天前`;
  }
  
  // Format as date
  return timestamp.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Truncate message content for preview
 */
export function truncateMessage(content: string, maxLength: number = 100): string {
  if (content.length <= maxLength) {
    return content;
  }
  
  return content.substring(0, maxLength) + '...';
}

/**
 * Extract code blocks from message content
 */
export function extractCodeBlocks(content: string): Array<{
  language: string;
  code: string;
}> {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks: Array<{ language: string; code: string }> = [];
  
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      code: match[2].trim(),
    });
  }
  
  return blocks;
}

/**
 * Check if message contains code
 */
export function hasCodeContent(content: string): boolean {
  return /```[\s\S]*?```/.test(content) || /`[^`]+`/.test(content);
}

/**
 * Validate message content
 */
export function validateMessageContent(content: string): {
  valid: boolean;
  error?: string;
} {
  if (!content || content.trim().length === 0) {
    return {
      valid: false,
      error: '消息内容不能为空',
    };
  }
  
  if (content.length > 10000) {
    return {
      valid: false,
      error: '消息内容过长（最多10000字符）',
    };
  }
  
  return { valid: true };
}

/**
 * Sanitize message content for display
 */
export function sanitizeMessageContent(content: string): string {
  // Remove potentially dangerous HTML/script tags
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
}
