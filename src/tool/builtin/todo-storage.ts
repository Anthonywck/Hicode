/**
 * Todo Storage
 * Simple storage mechanism for todos per session
 */

import * as vscode from 'vscode';

/**
 * Todo item structure
 */
export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/**
 * Get storage key for a session's todos
 */
function getStorageKey(sessionID: string): string {
  return `hicode.todos.${sessionID}`;
}

/**
 * Global extension context reference (set during activation)
 */
let globalExtensionContext: vscode.ExtensionContext | undefined;

/**
 * Set extension context (should be called during extension activation)
 */
export function setExtensionContext(context: vscode.ExtensionContext): void {
  globalExtensionContext = context;
}

/**
 * Get extension context
 */
function getExtensionContext(): vscode.ExtensionContext | undefined {
  return globalExtensionContext;
}

/**
 * In-memory fallback storage
 */
const inMemoryStorage = new Map<string, TodoItem[]>();

/**
 * Get todos for a session
 */
export async function getTodos(sessionID: string): Promise<TodoItem[]> {
  const context = await getExtensionContext();
  if (!context) {
    // Fallback to in-memory storage if context not available
    return inMemoryStorage.get(sessionID) || [];
  }

  const key = getStorageKey(sessionID);
  const data = context.globalState.get<string>(key);
  if (!data) {
    return [];
  }
  try {
    return JSON.parse(data) as TodoItem[];
  } catch {
    return [];
  }
}

/**
 * Update todos for a session
 */
export async function updateTodos(sessionID: string, todos: TodoItem[]): Promise<void> {
  const context = await getExtensionContext();
  if (!context) {
    // Fallback to in-memory storage if context not available
    inMemoryStorage.set(sessionID, todos);
    return;
  }

  const key = getStorageKey(sessionID);
  await context.globalState.update(key, JSON.stringify(todos));
}
