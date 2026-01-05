/**
 * Storage Manager
 * Handles persistence of chat sessions
 */

import { IStorageManager } from './types';

/**
 * In-memory storage implementation for testing
 */
export class MemoryStorageManager implements IStorageManager {
  private storage: Map<string, string> = new Map();

  get(key: string): string | undefined {
    return this.storage.get(key);
  }

  set(key: string, value: string): void {
    this.storage.set(key, value);
  }

  delete(key: string): void {
    this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }
}

/**
 * VSCode storage implementation
 * This would be used in the actual extension context
 */
export class VSCodeStorageManager implements IStorageManager {
  constructor(private globalState: any) {}

  get(key: string): string | undefined {
    return this.globalState.get(key);
  }

  set(key: string, value: string): void {
    this.globalState.update(key, value);
  }

  delete(key: string): void {
    this.globalState.update(key, undefined);
  }
}
