/**
 * Intent Router
 * 负责识别用户意图并路由到相应的功能
 * 
 * 需求: 9.6, 9.7, 9.8
 */

import { CodeContext } from '../api/types';

/**
 * 意图类型
 */
export type IntentType = 'question' | 'code_action' | 'explanation' | 'quick_command';

/**
 * 代码操作类型
 */
export type CodeActionType = 'refactor' | 'test' | 'document' | 'fix' | 'optimize';

/**
 * 用户意图
 * 表示识别出的用户意图及其置信度
 */
export interface InlineChatIntent {
  /** 意图类型 */
  type: IntentType;
  /** 具体的代码操作（如果是code_action类型） */
  action?: CodeActionType;
  /** 置信度 (0-1) */
  confidence: number;
  /** 原始输入 */
  originalInput?: string;
}

/**
 * Intent Router接口
 * 定义意图识别和路由的核心功能
 */
export interface IIntentRouter {
  /**
   * 检测用户意图
   * @param input 用户输入
   * @param context 代码上下文
   * @returns 识别出的意图
   */
  detectIntent(input: string, context: CodeContext): InlineChatIntent;

  /**
   * 判断是否应该路由到Chat
   * @param intent 用户意图
   * @returns 是否应该路由到Chat
   */
  shouldRouteToChat(intent: InlineChatIntent): boolean;

  /**
   * 判断是否应该路由到Agent
   * @param intent 用户意图
   * @returns 是否应该路由到Agent
   */
  shouldRouteToAgent(intent: InlineChatIntent): boolean;
}

/**
 * Intent Router实现
 * 使用关键词匹配和模式识别来判断用户意图
 */
export class IntentRouter implements IIntentRouter {
  // 代码操作关键词映射
  private readonly codeActionKeywords: Map<CodeActionType, string[]> = new Map([
    ['refactor', ['重构', 'refactor', '优化结构', '改进代码', 'restructure', 'improve']],
    ['test', ['测试', 'test', '单元测试', 'unit test', 'testing', '测试用例']],
    ['document', ['文档', 'document', '注释', 'comment', 'doc', '说明', 'documentation']],
    ['fix', ['修复', 'fix', '修改', '纠正', 'correct', '解决', 'solve', 'bug']],
    ['optimize', ['优化', 'optimize', '性能', 'performance', '加速', 'speed up', '提升']]
  ]);

  // 解释意图关键词
  private readonly explanationKeywords: string[] = [
    '解释', 'explain', '说明', '什么', 'what', 'how', '如何', '为什么', 'why',
    '这是', 'this is', '这段', 'this code', '做什么', 'does', '意思', 'mean'
  ];

  // 复杂问答关键词（需要转到Chat）
  private readonly complexQuestionKeywords: string[] = [
    '详细', 'detail', '更多', 'more', '深入', 'deep', '全面', 'comprehensive',
    '比较', 'compare', '区别', 'difference', '最佳实践', 'best practice'
  ];

  /**
   * 检测用户意图
   * 使用关键词匹配和模式识别
   */
  detectIntent(input: string, context: CodeContext): InlineChatIntent {
    const lowerInput = input.toLowerCase().trim();

    // 1. 检查快捷命令
    if (lowerInput.startsWith('/')) {
      return this.detectQuickCommand(lowerInput);
    }

    // 2. 检查代码操作意图
    const codeActionIntent = this.detectCodeAction(lowerInput);
    if (codeActionIntent.confidence > 0.7) {
      return codeActionIntent;
    }

    // 3. 检查解释意图
    const explanationIntent = this.detectExplanation(lowerInput, context);
    if (explanationIntent.confidence > 0.7) {
      return explanationIntent;
    }

    // 4. 检查复杂问答意图
    const complexQuestionIntent = this.detectComplexQuestion(lowerInput);
    if (complexQuestionIntent.confidence > 0.6) {
      return complexQuestionIntent;
    }

    // 5. 默认为简单问答
    return {
      type: 'question',
      confidence: 0.5,
      originalInput: input
    };
  }

  /**
   * 检测快捷命令
   */
  private detectQuickCommand(input: string): InlineChatIntent {
    const command = input.substring(1).toLowerCase();

    const commandMap: { [key: string]: CodeActionType } = {
      'refactor': 'refactor',
      'test': 'test',
      'explain': 'document', // explain作为特殊的document操作
      'doc': 'document',
      'fix': 'fix',
      'optimize': 'optimize'
    };

    const action = commandMap[command];
    if (action) {
      return {
        type: 'quick_command',
        action,
        confidence: 1.0,
        originalInput: input
      };
    }

    // 未知命令，作为普通问题处理
    return {
      type: 'question',
      confidence: 0.3,
      originalInput: input
    };
  }

  /**
   * 检测代码操作意图
   */
  private detectCodeAction(input: string): InlineChatIntent {
    let bestMatch: { action: CodeActionType; confidence: number } | null = null;

    // 遍历所有代码操作类型
    for (const [action, keywords] of this.codeActionKeywords.entries()) {
      const matchCount = keywords.filter(keyword => 
        input.includes(keyword.toLowerCase())
      ).length;

      if (matchCount > 0) {
        // 计算置信度：匹配的关键词数量 / 总关键词数量
        const confidence = Math.min(0.9, 0.6 + (matchCount * 0.15));
        
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { action, confidence };
        }
      }
    }

    if (bestMatch) {
      return {
        type: 'code_action',
        action: bestMatch.action,
        confidence: bestMatch.confidence,
        originalInput: input
      };
    }

    return {
      type: 'question',
      confidence: 0.0,
      originalInput: input
    };
  }

  /**
   * 检测解释意图
   */
  private detectExplanation(input: string, context: CodeContext): InlineChatIntent {
    const matchCount = this.explanationKeywords.filter(keyword =>
      input.includes(keyword.toLowerCase())
    ).length;

    if (matchCount > 0) {
      // 如果有选中代码，置信度更高
      const hasSelection = context.selection && context.selection.text.length > 0;
      const baseConfidence = 0.6 + (matchCount * 0.1);
      const confidence = hasSelection ? Math.min(0.9, baseConfidence + 0.1) : baseConfidence;

      return {
        type: 'explanation',
        confidence,
        originalInput: input
      };
    }

    return {
      type: 'question',
      confidence: 0.0,
      originalInput: input
    };
  }

  /**
   * 检测复杂问答意图
   */
  private detectComplexQuestion(input: string): InlineChatIntent {
    // 检查输入长度
    const isLong = input.length > 100;

    // 检查复杂问答关键词
    const matchCount = this.complexQuestionKeywords.filter(keyword =>
      input.includes(keyword.toLowerCase())
    ).length;

    if (isLong || matchCount > 0) {
      const confidence = isLong ? 0.7 : 0.6 + (matchCount * 0.1);
      return {
        type: 'question',
        confidence: Math.min(0.85, confidence),
        originalInput: input
      };
    }

    return {
      type: 'question',
      confidence: 0.0,
      originalInput: input
    };
  }

  /**
   * 判断是否应该路由到Chat
   * 高置信度的问答意图应该路由到Chat侧边栏
   */
  shouldRouteToChat(intent: InlineChatIntent): boolean {
    return intent.type === 'question' && intent.confidence > 0.7;
  }

  /**
   * 判断是否应该路由到Agent
   * 代码操作和快捷命令应该路由到Agent系统
   */
  shouldRouteToAgent(intent: InlineChatIntent): boolean {
    return (intent.type === 'code_action' || intent.type === 'quick_command') 
           && intent.confidence > 0.7;
  }
}
