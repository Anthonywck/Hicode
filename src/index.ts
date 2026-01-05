/**
 * HiCode AI Integration - 公共 API 导出
 * 
 * 本文件作为模块的公共 API 入口，导出其他模块可能需要使用的函数和类型
 * 主要用于：
 * 1. 提供懒加载模块的访问接口
 * 2. 导出版本信息
 * 3. 供测试和其他模块使用
 * 
 * 注意：扩展的激活入口在 extension.ts 中
 */

// 从 extension.ts 导出公共 API
export {
  version,
  getConfigManager,
  getAPIClient,
  getPromptManager,
  getContextManager,
  getHistoryManager,
  getAgentSystem,
  getIntentRouter,
  getInlineChatProvider,
  getCompletionProvider,
  getChatWebviewProvider
} from './extension';

// 导出性能工具（供其他模块使用）
export { PerformanceTimer, createLazyModule } from './utils/performance';
export type { LazyModule } from './utils/performance';
