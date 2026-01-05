/**
 * 命令注册表
 * 集中管理所有命令配置
 */

import { CommandConfig } from './types';
import * as handlers from './handlers';

/**
 * 所有命令的配置列表
 * 需求: 1.1, 6.4, 9.13
 */
export const commandConfigs: CommandConfig[] = [
  {
    command: 'hicode.showInlineChat',
    title: 'Show Inline Chat',
    category: 'HiCode',
    description: '在编辑器中显示内联聊天',
    handler: handlers.showInlineChatHandler,
    when: 'editorTextFocus'
  },
  {
    command: 'hicode.quickRefactor',
    title: 'Quick Refactor',
    category: 'HiCode',
    description: '快速重构选中的代码',
    handler: handlers.quickRefactorHandler,
    when: 'editorHasSelection',
    group: 'hicode@2'
  },
  {
    command: 'hicode.quickTest',
    title: 'Generate Tests',
    category: 'HiCode',
    description: '为选中的代码生成测试',
    handler: handlers.quickTestHandler,
    when: 'editorHasSelection',
    group: 'hicode@3'
  },
  {
    command: 'hicode.quickExplain',
    title: 'Explain Code',
    category: 'HiCode',
    description: '解释选中的代码',
    handler: handlers.quickExplainHandler,
    when: 'editorHasSelection',
    group: 'hicode@4'
  },
  {
    command: 'hicode.quickDoc',
    title: 'Generate Documentation',
    category: 'HiCode',
    description: '为选中的代码生成文档',
    handler: handlers.quickDocHandler,
    when: 'editorHasSelection',
    group: 'hicode@5'
  },
  {
    command: 'hicode.quickFix',
    title: 'Fix Code',
    category: 'HiCode',
    description: '修复选中代码中的问题',
    handler: handlers.quickFixHandler,
    when: 'editorHasSelection',
    group: 'hicode@6'
  },
  {
    command: 'hicode.quickOptimize',
    title: 'Optimize Code',
    category: 'HiCode',
    description: '优化选中的代码性能',
    handler: handlers.quickOptimizeHandler,
    when: 'editorHasSelection',
    group: 'hicode@7'
  },
  {
    command: 'hicode.openChat',
    title: 'Open Chat',
    category: 'HiCode',
    description: '打开聊天侧边栏',
    handler: handlers.openChatHandler
  },
  {
    command: 'hicode.newConversation',
    title: 'New Conversation',
    category: 'HiCode',
    description: '创建新的对话会话',
    handler: handlers.newConversationHandler
  },
  {
    command: 'hicode.showHistory',
    title: 'Show Conversation History',
    category: 'HiCode',
    description: '显示对话历史记录',
    handler: handlers.showHistoryHandler
  },
  {
    command: 'hicode.switchModel',
    title: 'Switch AI Model',
    category: 'HiCode',
    description: '切换当前使用的 AI 模型',
    handler: handlers.switchModelHandler
  },
  {
    command: 'hicode.configureModels',
    title: 'Configure AI Models',
    category: 'HiCode',
    description: '配置 AI 模型设置',
    handler: handlers.configureModelsHandler
  },
  {
    command: 'hicode.openSettings',
    title: 'Open Settings',
    category: 'HiCode',
    description: '打开 HiCode 设置页面',
    handler: handlers.openSettingsHandler
  },
  {
    command: 'hicode.triggerCompletion',
    title: 'Trigger AI Completion',
    category: 'HiCode',
    description: '手动触发 AI 代码补全',
    handler: handlers.triggerCompletionHandler,
    when: 'editorTextFocus'
  },
  {
    command: 'hicode.undoAgentAction',
    title: 'Undo Last Agent Action',
    category: 'HiCode',
    description: '撤销上一次 Agent 执行的操作',
    handler: handlers.undoAgentActionHandler
  }
];

/**
 * 根据命令 ID 获取命令配置
 * @param commandId 命令 ID
 * @returns 命令配置，如果不存在则返回 undefined
 */
export function getCommandConfig(commandId: string): CommandConfig | undefined {
  return commandConfigs.find(cmd => cmd.command === commandId);
}

/**
 * 获取所有命令配置
 * @returns 所有命令配置的副本
 */
export function getAllCommands(): CommandConfig[] {
  return [...commandConfigs];
}

/**
 * 根据分类获取命令
 * @param category 命令分类
 * @returns 该分类下的所有命令
 */
export function getCommandsByCategory(category: string): CommandConfig[] {
  return commandConfigs.filter(cmd => cmd.category === category);
}
