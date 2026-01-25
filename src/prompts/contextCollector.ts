/**
 * 上下文收集器
 * 
 * 负责从 ChatMessage 中收集和组织上下文数据
 */

import { ChatMessage } from '../api/types';
import { IContextCollector, ContextData } from './types';
import { createLogger } from '../utils/logger';

/**
 * 上下文收集器实现
 * 从 ChatMessage 中提取各种上下文信息并结构化存储
 */
export class ContextCollector implements IContextCollector {
  private logger = createLogger('ContextCollector');
  
  constructor() {
    this.logger.info('ContextCollector 初始化完成');
  }
  
  /**
   * 从消息中收集上下文数据
   * @param message 聊天消息
   * @returns 结构化的上下文数据
   */
  collectContext(message: ChatMessage): ContextData {
    const startTime = Date.now();
    
    this.logger.debug('开始收集上下文', {
      messageLength: message.content?.length || 0,
      hasContext: !!message.context
    });
    
    // 初始化上下文数据结构，所有字段默认为空字符串
    const context: ContextData = {
      user_query: message.content || '',
      language: '',
      history: '',
      selection: '',
      current_file: '',
      current_file_path: '',
      related_files: ''
    };
    
    // 如果消息包含代码上下文，提取相关信息
    if (message.context) {
      const ctx = message.context;
      
      // 提取编程语言
      if (ctx.currentFile) {
        context.language = ctx.currentFile.language || '';
        context.current_file = ctx.currentFile.content || '';
        context.current_file_path = ctx.currentFile.path || '';
        
        this.logger.debug('提取当前文件信息', {
          language: context.language,
          path: context.current_file_path,
          contentLength: context.current_file.length
        });
      }
      
      // 提取选中的代码
      if (ctx.selection) {
        context.selection = ctx.selection.content || '';
        this.logger.debug('提取选中代码', {
          selectionLength: context.selection.length,
          startLine: ctx.selection.startLine,
          endLine: ctx.selection.endLine
        });
      }
      
      // 提取相关文件信息
      if (ctx.relatedFiles && ctx.relatedFiles.length > 0) {
        context.related_files = ctx.relatedFiles
          .map(file => `${file.path}:\n${file.excerpt}`)
          .join('\n\n');
        this.logger.debug('提取相关文件', {
          fileCount: ctx.relatedFiles.length,
          totalLength: context.related_files.length
        });
      }
    }
    
    // TODO: 提取历史记录（需要从外部传入）
    // 当前版本暂不实现历史记录提取
    
    const duration = Date.now() - startTime;
    this.logger.info('上下文收集完成', {
      duration: `${duration}ms`,
      fields: {
        user_query: !!context.user_query,
        language: !!context.language,
        selection: !!context.selection,
        current_file: !!context.current_file,
        related_files: !!context.related_files
      }
    });
    
    return context;
  }
}
