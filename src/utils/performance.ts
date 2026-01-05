/**
 * Performance optimization utilities
 * Provides lazy loading and performance monitoring capabilities
 */

export interface LazyModule<T> {
  load(): Promise<T>;
  isLoaded(): boolean;
  get(): T | null;
}

/**
 * Creates a lazy-loaded module that only loads when first accessed
 */
export function createLazyModule<T>(loader: () => Promise<T>): LazyModule<T> {
  let module: T | null = null;
  let loading: Promise<T> | null = null;

  return {
    async load(): Promise<T> {
      if (module) {
        return module;
      }

      if (loading) {
        return loading;
      }

      loading = loader().then((loaded) => {
        module = loaded;
        loading = null;
        return loaded;
      });

      return loading;
    },

    isLoaded(): boolean {
      return module !== null;
    },

    get(): T | null {
      return module;
    },
  };
}

/**
 * Performance timer for measuring operation duration
 */
export class PerformanceTimer {
  private startTime: number;
  private marks: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Mark a checkpoint in the performance timeline
   */
  mark(label: string): void {
    this.marks.set(label, Date.now() - this.startTime);
  }

  /**
   * Get the duration since start or since a specific mark
   */
  getDuration(fromMark?: string): number {
    const now = Date.now() - this.startTime;
    if (fromMark) {
      const markTime = this.marks.get(fromMark);
      return markTime !== undefined ? now - markTime : 0;
    }
    return now;
  }

  /**
   * Get all marks with their durations
   */
  getMarks(): Record<string, number> {
    return Object.fromEntries(this.marks);
  }

  /**
   * Check if activation time is within acceptable limits (1 second)
   */
  isWithinLimit(limitMs: number = 1000): boolean {
    return this.getDuration() <= limitMs;
  }
}

/**
 * Debounce function to limit execution frequency
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = null;
    }, waitMs);
  };
}

/**
 * Throttle function to limit execution rate
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastRun >= limitMs) {
      func.apply(this, args);
      lastRun = now;
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastRun = Date.now();
        timeoutId = null;
      }, limitMs - (now - lastRun));
    }
  };
}
