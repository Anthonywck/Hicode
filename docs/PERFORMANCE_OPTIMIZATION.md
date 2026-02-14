# 性能优化指南

## 概述

本文档介绍 HiCode Agent 的性能优化策略和最佳实践。

## 会话存储优化

### 增量更新

使用增量更新减少存储开销：

```typescript
// 只更新变化的部分
await storage.updatePart(messageID, updatedPart);
```

### 会话压缩

定期压缩会话以减少存储空间：

```typescript
await session.compact();
```

### 批量操作

使用批量操作减少 I/O 次数：

```typescript
await storage.batchUpdate(updates);
```

## 工具执行优化

### 异步执行

工具调用是异步的，不会阻塞主线程：

```typescript
const result = await tool.execute(params, ctx);
```

### 并发控制

限制并发工具调用数量：

```typescript
const MAX_CONCURRENT_TOOLS = 5;
const semaphore = new Semaphore(MAX_CONCURRENT_TOOLS);

await semaphore.acquire();
try {
  await tool.execute(params, ctx);
} finally {
  semaphore.release();
}
```

### 结果缓存

缓存工具执行结果：

```typescript
const cache = new Map<string, any>();

async function executeWithCache(tool: Tool, params: any) {
  const key = `${tool.name}:${JSON.stringify(params)}`;
  
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  const result = await tool.execute(params, ctx);
  cache.set(key, result);
  return result;
}
```

## 流式响应优化

### 增量更新

使用增量更新减少内存占用：

```typescript
processor.onTextChunk = (chunk: string) => {
  // 增量更新消息内容
  await storage.appendTextPart(messageID, chunk);
};
```

### 缓冲区管理

管理流式数据的缓冲区：

```typescript
class StreamBuffer {
  private buffer: string[] = [];
  private maxSize = 1000;
  
  append(chunk: string) {
    this.buffer.push(chunk);
    if (this.buffer.length > this.maxSize) {
      this.flush();
    }
  }
  
  flush() {
    // 处理缓冲区数据
    this.buffer = [];
  }
}
```

### 背压处理

处理流式数据的背压：

```typescript
class StreamProcessor {
  private queue: string[] = [];
  private processing = false;
  
  async process(chunk: string) {
    this.queue.push(chunk);
    if (!this.processing) {
      this.processing = true;
      await this.drain();
      this.processing = false;
    }
  }
  
  private async drain() {
    while (this.queue.length > 0) {
      const chunk = this.queue.shift();
      await this.handleChunk(chunk);
    }
  }
}
```

## 内存管理

### 对象池

使用对象池重用对象：

```typescript
class ObjectPool<T> {
  private pool: T[] = [];
  private create: () => T;
  
  constructor(create: () => T) {
    this.create = create;
  }
  
  acquire(): T {
    return this.pool.pop() || this.create();
  }
  
  release(obj: T) {
    this.pool.push(obj);
  }
}
```

### 弱引用

使用弱引用避免内存泄漏：

```typescript
const cache = new WeakMap<object, any>();

function getCached(obj: object) {
  return cache.get(obj);
}

function setCached(obj: object, value: any) {
  cache.set(obj, value);
}
```

### 定期清理

定期清理不再使用的资源：

```typescript
setInterval(() => {
  // 清理过期缓存
  cache.cleanup();
  
  // 清理未使用的会话
  sessionManager.cleanup();
}, 60000); // 每分钟清理一次
```

## LLM 调用优化

### 请求批处理

批量处理多个请求：

```typescript
async function batchProcess(requests: Request[]) {
  const batch = requests.slice(0, BATCH_SIZE);
  const results = await Promise.all(
    batch.map(req => llm.call(req))
  );
  return results;
}
```

### 请求去重

去重相同的请求：

```typescript
const requestCache = new Map<string, Promise<any>>();

async function callWithDedup(request: Request) {
  const key = JSON.stringify(request);
  
  if (requestCache.has(key)) {
    return requestCache.get(key);
  }
  
  const promise = llm.call(request);
  requestCache.set(key, promise);
  
  promise.finally(() => {
    requestCache.delete(key);
  });
  
  return promise;
}
```

### 上下文截断

智能截断上下文以节省 token：

```typescript
function truncateContext(messages: Message[], maxTokens: number) {
  let tokens = 0;
  const truncated: Message[] = [];
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokens(msg);
    
    if (tokens + msgTokens > maxTokens) {
      break;
    }
    
    tokens += msgTokens;
    truncated.unshift(msg);
  }
  
  return truncated;
}
```

## 文件操作优化

### 流式读取

对大文件使用流式读取：

```typescript
import * as fs from 'fs';

function readFileStream(filePath: string) {
  return fs.createReadStream(filePath, { encoding: 'utf8' });
}
```

### 文件缓存

缓存文件内容：

```typescript
const fileCache = new Map<string, { content: string; mtime: number }>();

function getCachedFile(filePath: string) {
  const stats = fs.statSync(filePath);
  const cached = fileCache.get(filePath);
  
  if (cached && cached.mtime === stats.mtimeMs) {
    return cached.content;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  fileCache.set(filePath, { content, mtime: stats.mtimeMs });
  return content;
}
```

## 网络请求优化

### 请求重试

实现指数退避重试：

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(2 ** i * 1000); // 指数退避
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 连接池

使用连接池管理 HTTP 连接：

```typescript
import { Agent } from 'https';

const agent = new Agent({
  keepAlive: true,
  maxSockets: 10,
});

const client = axios.create({
  httpsAgent: agent,
});
```

## 监控和 profiling

### 性能指标

收集性能指标：

```typescript
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  
  record(metric: string, value: number) {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    this.metrics.get(metric)!.push(value);
  }
  
  getStats(metric: string) {
    const values = this.metrics.get(metric) || [];
    return {
      count: values.length,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }
}
```

### 内存监控

监控内存使用：

```typescript
function monitorMemory() {
  const usage = process.memoryUsage();
  console.log({
    heapUsed: usage.heapUsed / 1024 / 1024,
    heapTotal: usage.heapTotal / 1024 / 1024,
    rss: usage.rss / 1024 / 1024,
  });
}

setInterval(monitorMemory, 60000); // 每分钟监控一次
```

## 最佳实践

### 1. 避免阻塞操作

使用异步操作避免阻塞：

```typescript
// 错误：同步阻塞
const content = fs.readFileSync(filePath);

// 正确：异步非阻塞
const content = await fs.promises.readFile(filePath);
```

### 2. 使用流式处理

对大文件使用流式处理：

```typescript
// 错误：一次性读取大文件
const content = fs.readFileSync(largeFile);

// 正确：流式处理
const stream = fs.createReadStream(largeFile);
stream.on('data', chunk => processChunk(chunk));
```

### 3. 合理使用缓存

缓存频繁访问的数据：

```typescript
const cache = new Map<string, any>();

async function getCached(key: string, fetcher: () => Promise<any>) {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const value = await fetcher();
  cache.set(key, value);
  return value;
}
```

### 4. 限制资源使用

限制并发和资源使用：

```typescript
const MAX_CONCURRENT = 10;
const semaphore = new Semaphore(MAX_CONCURRENT);

async function limitedOperation() {
  await semaphore.acquire();
  try {
    await operation();
  } finally {
    semaphore.release();
  }
}
```

## 参考

- [Node.js 性能最佳实践](https://nodejs.org/en/docs/guides/simple-profiling/)
- [V8 性能优化](https://v8.dev/blog/optimization-tips)
