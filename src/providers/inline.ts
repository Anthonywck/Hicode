/**
 * Inline Chat Provider
 * 提供编辑器内联聊天和建议功能
 * 
 * 需求: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 9.15
 */

import { CodeContext, ChatRequest, ChatResponse, IAPIClient, ChatMessage } from '../api/types';
import { IContextManager } from '../context/manager';
import { IAgentSystem } from '../agent/system';
import { AgentTask, AgentResult } from '../agent/types';
import { IntentRouter, InlineChatIntent } from '../intent/router';

/**
 * 内联聊天建议
 * 包含代码建议和解释
 */
export interface InlineChatSuggestion {
  /** 原始代码 */
  originalCode: string;
  /** 建议的代码 */
  suggestedCode: string;
  /** 解释说明 */
  explanation: string;
  /** 代码范围（行号） */
  range: {
    startLine: number;
    endLine: number;
  };
}

/**
 * 内联聊天响应
 * 表示处理用户输入后的响应
 */
export interface InlineChatResponse {
  /** 是否已处理 */
  handled: boolean;
  /** 响应内容（如果有） */
  response?: string;
  /** 路由目标（如果路由） */
  routedTo?: string;
  /** 命令名称（如果是快捷命令） */
  command?: string;
  /** 错误信息（如果失败） */
  error?: string;
  /** 建议（如果有代码建议） */
  suggestion?: InlineChatSuggestion;
}

/**
 * 内联聊天会话
 * 管理单次内联聊天的状态
 */
export interface InlineChatSession {
  /** 会话ID */
  id: string;
  /** 消息历史 */
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  /** 代码上下文 */
  context: CodeContext;
  /** 创建时间 */
  createdAt: Date;
}

/**
 * Inline Chat Provider接口
 */
export interface IInlineChatProvider {
  /**
   * 显示内联聊天界面
   * @param selection 选中的代码范围
   * @param context 代码上下文
   */
  showInlineChat(selection: { startLine: number; endLine: number }, context: CodeContext): Promise<void>;

  /**
   * 处理用户输入
   * @param input 用户输入
   * @param context 代码上下文
   * @returns 处理结果
   */
  handleUserInput(input: string, context: CodeContext): Promise<InlineChatResponse>;

  /**
   * 识别用户意图
   * @param input 用户输入
   * @param context 代码上下文
   * @returns 识别出的意图
   */
  detectIntent(input: string, context: CodeContext): InlineChatIntent;

  /**
   * 路由到相应功能
   * @param intent 用户意图
   * @param input 用户输入
   * @param context 代码上下文
   */
  routeToFeature(intent: InlineChatIntent, input: string, context: CodeContext): Promise<void>;

  /**
   * 应用代码建议
   * @param suggestion 代码建议
   */
  applySuggestion(suggestion: InlineChatSuggestion): Promise<void>;

  /**
   * 关闭内联聊天
   */
  dismissInlineChat(): void;

  /**
   * 获取当前会话
   * @returns 当前会话（如果有）
   */
  getCurrentSession(): InlineChatSession | null;
}

/**
 * Inline Chat Provider实现
 */
export class InlineChatProvider implements IInlineChatProvider {
  private currentSession: InlineChatSession | null = null;
  private intentRouter: IntentRouter;

  constructor(
    private apiClient: IAPIClient,
    private contextManager: IContextManager,
    private agentSystem: IAgentSystem,
    private historyManager?: any // History Manager接口
  ) {
    this.intentRouter = new IntentRouter();
  }

  /**
   * 显示内联聊天界面
   * 需求: 9.1
   */
  async showInlineChat(
    selection: { startLine: number; endLine: number },
    context: CodeContext
  ): Promise<void> {
    // 创建新的内联聊天会话
    this.currentSession = {
      id: this.generateSessionId(),
      messages: [],
      context,
      createdAt: new Date()
    };

    // 在实际VSCode扩展中，这里会显示内联输入框
    // 由于这是核心逻辑实现，UI部分需要在extension.ts中集成
    console.log('Inline chat session created:', this.currentSession.id);
  }

  /**
   * 处理用户输入
   * 需求: 9.2, 9.6, 9.7, 9.8, 9.11
   */
  async handleUserInput(input: string, context: CodeContext): Promise<InlineChatResponse> {
    if (!this.currentSession) {
      return {
        handled: false,
        error: '没有活动的内联聊天会话'
      };
    }

    // 添加用户消息到会话历史
    // 需求: 9.11 - 保持对话历史
    this.currentSession.messages.push({
      role: 'user',
      content: input,
      timestamp: new Date()
    });

    // 检查是否是快捷命令
    // 需求: 9.9, 9.10
    if (input.startsWith('/')) {
      return await this.handleQuickCommand(input, context);
    }

    // 识别用户意图
    const intent = this.detectIntent(input, context);

    // 根据意图路由
    // 需求: 9.6, 9.7, 9.8
    if (intent.confidence > 0.8) {
      await this.routeToFeature(intent, input, context);
      return {
        handled: true,
        routedTo: intent.type
      };
    }

    // 默认作为内联问答处理
    // 需求: 9.11 - 支持多轮对话
    return await this.handleInlineQuestion(input, context);
  }

  /**
   * 识别用户意图
   * 需求: 9.6, 9.7, 9.8
   */
  detectIntent(input: string, context: CodeContext): InlineChatIntent {
    return this.intentRouter.detectIntent(input, context);
  }

  /**
   * 路由到相应功能
   * 需求: 9.6, 9.7, 9.8, 9.14
   */
  async routeToFeature(
    intent: InlineChatIntent,
    input: string,
    context: CodeContext
  ): Promise<void> {
    switch (intent.type) {
      case 'code_action':
      case 'quick_command':
        // 路由到Agent系统
        // 需求: 9.7
        await this.routeToAgent(intent.action!, context);
        break;

      case 'question':
        // 路由到Chat侧边栏
        // 需求: 9.6, 9.14
        await this.routeToChat(input, context);
        break;

      case 'explanation':
        // 在内联显示解释
        // 需求: 9.14
        await this.showExplanation(input, context);
        break;
    }
  }

  /**
   * 应用代码建议
   * 需求: 9.4, 9.5
   */
  async applySuggestion(suggestion: InlineChatSuggestion): Promise<void> {
    // 在实际VSCode扩展中，这里会使用WorkspaceEdit API应用更改
    // 这里提供核心逻辑框架
    console.log('Applying suggestion:', suggestion);

    // 保存到历史（如果有History Manager）
    if (this.currentSession && this.historyManager) {
      this.currentSession.messages.push({
        role: 'assistant',
        content: `已应用建议：${suggestion.explanation}`,
        timestamp: new Date()
      });

      // 保存会话到历史管理器
      // 需求: 9.12
      await this.saveSessionToHistory();
    }
  }

  /**
   * 关闭内联聊天
   */
  dismissInlineChat(): void {
    // 保存会话到历史（如果有未保存的会话）
    if (this.currentSession && this.historyManager) {
      this.saveSessionToHistory().catch(err => {
        console.error('Failed to save session:', err);
      });
    }

    this.currentSession = null;
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): InlineChatSession | null {
    return this.currentSession;
  }

  /**
   * 处理快捷命令
   * 需求: 9.9, 9.10
   */
  private async handleQuickCommand(
    command: string,
    context: CodeContext
  ): Promise<InlineChatResponse> {
    const cmd = command.toLowerCase().substring(1);

    const commandMap: { [key: string]: string } = {
      'refactor': 'refactor',
      'test': 'test',
      'explain': 'explanation',
      'doc': 'document',
      'fix': 'fix',
      'optimize': 'optimize'
    };

    const action = commandMap[cmd];
    if (action) {
      if (action === 'explanation') {
        await this.showExplanation('请解释这段代码', context);
      } else {
        await this.routeToAgent(action as any, context);
      }
      return {
        handled: true,
        command: cmd
      };
    }

    return {
      handled: false,
      error: '未知命令'
    };
  }

  /**
   * 处理内联问答
   * 需求: 9.2, 9.3, 9.11, 9.15
   */
  private async handleInlineQuestion(
    input: string,
    context: CodeContext
  ): Promise<InlineChatResponse> {
    // 构建消息历史以支持多轮对话
    // 需求: 9.11
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是一个编程助手，请简洁地回答问题。' }
    ];

    // 添加之前的对话历史（保持上下文连续性）
    if (this.currentSession && this.currentSession.messages.length > 1) {
      // 只包含最近的几轮对话，避免超出token限制
      const recentMessages = this.currentSession.messages.slice(-6); // 最近3轮对话
      for (const msg of recentMessages) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }
    } else {
      // 第一次对话，包含代码上下文
      messages.push({ role: 'user', content: input, context });
    }

    // 构建请求
    const request: ChatRequest = {
      messages,
      model: 'default', // 在实际实现中从配置获取
      stream: true // 启用流式响应，需求: 9.15
    };

    try {
      // 使用流式API调用
      // 需求: 9.15
      let fullResponse = '';
      
      await this.apiClient.sendStreamChatRequest(
        request,
        (chunk: string) => {
          // 实时更新内联显示
          fullResponse += chunk;
          this.updateInlineDisplay(fullResponse);
        },
        () => {
          // 流结束
          console.log('Stream completed');
        },
        (error: Error) => {
          // 错误处理
          console.error('Stream error:', error);
        }
      );

      // 添加助手响应到会话历史
      // 需求: 9.11
      if (this.currentSession) {
        this.currentSession.messages.push({
          role: 'assistant',
          content: fullResponse,
          timestamp: new Date()
        });
      }

      // 检查响应是否包含代码建议
      // 需求: 9.3
      const suggestion = this.extractCodeSuggestion(fullResponse, context);

      if (suggestion) {
        // 显示预览并等待用户确认
        // 需求: 9.4, 9.5
        const action = await this.showSuggestionPreview(suggestion);

        if (action === 'accept') {
          await this.applySuggestion(suggestion);
        } else if (action === 'chat') {
          await this.routeToChat(input, context);
        }

        return {
          handled: true,
          response: fullResponse,
          suggestion
        };
      }

      return {
        handled: true,
        response: fullResponse
      };
    } catch (error) {
      return {
        handled: false,
        error: error instanceof Error ? error.message : '请求失败'
      };
    }
  }

  /**
   * 更新内联显示
   * 实时显示流式响应
   * 需求: 9.15
   */
  private updateInlineDisplay(content: string): void {
    // 在实际VSCode扩展中，这里会更新Webview或内联装饰
    // 实时显示AI生成的内容
    console.log('Updating inline display:', content.substring(0, 50) + '...');
  }

  /**
   * 路由到Agent系统
   * 需求: 9.7, 9.14
   */
  private async routeToAgent(action: string, context: CodeContext): Promise<void> {
    // 找到对应的Agent任务
    const tasks = this.agentSystem.getAvailableTasks(context);
    const task = tasks.find(t => t.type === action);

    if (task) {
      // 确保上下文包含会话历史以保持连续性
      // 需求: 9.14
      const enrichedContext = {
        ...context,
        sessionHistory: this.currentSession?.messages
      };

      // 执行Agent任务
      const result = await this.agentSystem.executeTask(task, context);

      // 显示差异预览
      // 需求: 9.3, 9.4
      await this.showDiffPreview(result);

      // 在实际实现中，这里会等待用户确认后应用更改
      // 需求: 9.5
      console.log('Agent task completed:', result.message);
    }
  }

  /**
   * 路由到Chat侧边栏
   * 需求: 9.6, 9.14
   */
  private async routeToChat(input: string, context: CodeContext): Promise<void> {
    // 保存当前内联会话到历史
    // 需求: 9.12
    if (this.currentSession && this.historyManager) {
      await this.saveSessionToHistory();
    }

    // 准备上下文数据以保持连续性
    // 需求: 9.14
    const contextData = {
      input,
      context,
      sessionHistory: this.currentSession?.messages || [],
      timestamp: new Date()
    };

    // 在实际VSCode扩展中，这里会：
    // 1. 打开Chat侧边栏
    // 2. 传递上下文和输入
    // 3. 关闭内联聊天
    console.log('Routing to chat with context:', contextData);

    this.dismissInlineChat();
  }

  /**
   * 显示代码解释
   * 需求: 9.14
   */
  private async showExplanation(input: string, context: CodeContext): Promise<void> {
    const request: ChatRequest = {
      messages: [
        {
          role: 'system',
          content: '你是一个编程助手，请详细解释代码的功能和实现。'
        },
        {
          role: 'user',
          content: `${input}\n\n代码：\n${context.selection?.content || context.currentFile.content}`
        }
      ],
      model: 'default',
      stream: false
    };

    try {
      const response = await this.apiClient.sendChatRequest(request);

      // 在实际VSCode扩展中，这里会在Webview中显示解释
      console.log('Explanation:', response.content);

      // 添加到会话历史
      // 需求: 9.11
      if (this.currentSession) {
        this.currentSession.messages.push({
          role: 'assistant',
          content: response.content,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Failed to get explanation:', error);
    }
  }

  /**
   * 从响应中提取代码建议
   * 需求: 9.3
   */
  extractCodeSuggestion(
    content: string,
    context: CodeContext
  ): InlineChatSuggestion | null {
    // 尝试从响应中提取代码块
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)\n```/;
    const match = content.match(codeBlockRegex);

    if (match && context.selection) {
      return {
        originalCode: context.selection.content,
        suggestedCode: match[1],
        explanation: content.replace(codeBlockRegex, '').trim(),
        range: {
          startLine: context.selection.startLine,
          endLine: context.selection.endLine
        }
      };
    }

    return null;
  }

  /**
   * 显示差异预览
   * 需求: 9.3, 9.4
   */
  async showDiffPreview(result: AgentResult): Promise<void> {
    if (result.changes.length === 0) {
      console.log('No changes to preview');
      return;
    }

    const change = result.changes[0];

    // 在实际VSCode扩展中，这里会：
    // 1. 使用vscode.diff命令显示差异
    // 2. 创建临时文档用于对比
    // 3. 显示接受/拒绝按钮
    console.log('Showing diff preview for:', change.file);
    console.log('Original:', change.originalContent.substring(0, 100) + '...');
    console.log('New:', change.newContent.substring(0, 100) + '...');

    // 模拟用户选择（在实际实现中会等待用户交互）
    // 这里返回Promise以支持异步操作
    return Promise.resolve();
  }

  /**
   * 显示建议预览并等待用户确认
   * 需求: 9.3, 9.4, 9.5
   */
  async showSuggestionPreview(suggestion: InlineChatSuggestion): Promise<'accept' | 'reject' | 'chat'> {
    // 在实际VSCode扩展中，这里会：
    // 1. 显示diff预览
    // 2. 显示操作按钮（接受、拒绝、在Chat中继续讨论）
    // 3. 等待用户选择
    console.log('Showing suggestion preview');
    console.log('Original code:', suggestion.originalCode);
    console.log('Suggested code:', suggestion.suggestedCode);
    console.log('Explanation:', suggestion.explanation);

    // 模拟用户选择（在实际实现中会等待用户交互）
    return 'accept';
  }

  /**
   * 保存会话到历史管理器
   * 需求: 9.12
   */
  private async saveSessionToHistory(): Promise<void> {
    if (!this.currentSession || !this.historyManager) {
      return;
    }

    // 在实际实现中，这里会调用History Manager的API
    // 将内联聊天会话保存为普通聊天会话
    console.log('Saving session to history:', this.currentSession.id);
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `inline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
