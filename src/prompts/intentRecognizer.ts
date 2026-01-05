/**
 * 意图识别器实现
 * 
 * 使用大模型能力识别用户意图，系统维护一个专门的意图识别 Prompt 模板
 */

import { IIntentRecognizer, IntentType } from './types';
import { ChatMessage, IAPIClient } from '../api/types';
import { createLogger } from '../utils/logger';

/**
 * 意图识别器实现类
 * 
 * 功能：
 * - 使用大模型进行意图分类
 * - 维护专门的意图识别 Prompt 模板
 * - 解析大模型返回的功能 ID 并映射到意图类型
 * - 提供回退逻辑（当大模型调用失败时）
 */
export class IntentRecognizer implements IIntentRecognizer {
  private logger = createLogger('IntentRecognizer');
  
  // 意图识别专用模板
  private readonly intentRecognitionTemplate = `Follow the user's requirements carefully & to the letter.
A software developer is using an AI chatbot in a code editor in file {file_path_name}.
Current active file contains following excerpt:
\`\`\`{lang}
{select_code_info}
\`\`\`
The developer added the following request to the chat and your goal is to select a function to perform the request.
Pick different only if you're certain.
If the request have no relation with current active file excerpt or not certain please select: unknown.
Don't generate with words "Response: ".

Available functions:
Function Id: comments
Function Description: Add comment for this symbol

Function Id: edit
Function Description: Make changes to existing code

Function Id: tests
Function Description: Generate unit tests for the selected code

Function Id: fix
Function Description: Propose a fix for the problems in the selected code

Function Id: explain
Function Description: Explain how the code in your active editor works

Function Id: unknown
Function Description: Intent of this command is unclear or is not related to information technologies

Function Id: generate
Function Description: Generate new code

Function Id: chat
Function Description: General conversation not related to code

Here are some examples to make the instructions clearer:
Request: Add jsdoc to this method
Response: comments

Request: Fix the bug in this function
Response: fix

Request: {user_query}
Response:`;

  constructor(
    public apiClient: IAPIClient
  ) {
    this.logger.info('IntentRecognizer 初始化完成');
  }
  
  /**
   * 识别用户意图
   * @param message 用户消息
   * @returns 识别的意图类型
   */
  async recognizeIntent(message: ChatMessage): Promise<IntentType> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('开始识别意图', {
        messageLength: message.content.length,
        hasContext: !!message.context
      });
      
      // 1. 准备意图识别的上下文数据
      const context = this.prepareIntentContext(message);
      this.logger.debug('上下文准备完成', {
        hasFile: !!context.file_path_name,
        hasLanguage: !!context.lang,
        hasSelection: !!context.select_code_info
      });
      
      // 2. 渲染意图识别 Prompt
      const intentPrompt = this.renderIntentPrompt(context);
      this.logger.debug('意图识别 Prompt 渲染完成', {
        promptLength: intentPrompt.length
      });
      
      // 3. 调用大模型进行意图识别
      const currentModel = (this.apiClient as any).getCurrentModel?.() || 'default';
      this.logger.debug('调用大模型进行意图识别', { model: currentModel });
      
      const response = await this.apiClient.sendChatRequest({
        messages: [
          {
            role: 'user',
            content: intentPrompt
          }
        ],
        model: currentModel,
        stream: false,
        temperature: 0.1, // 低温度以获得更确定的结果
        maxTokens: 50
      });
      
      this.logger.debug('大模型响应接收', {
        responseLength: response.content.length,
        response: response.content.trim()
      });
      
      // 4. 解析大模型返回的意图
      const recognizedIntent = this.parseIntentResponse(response.content);
      
      const duration = Date.now() - startTime;
      this.logger.info('意图识别完成', {
        intent: recognizedIntent,
        duration: `${duration}ms`,
        rawResponse: response.content.trim()
      });
      
      return recognizedIntent;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('意图识别失败，使用回退逻辑', error);
      this.logger.debug('意图识别失败详情', { duration: `${duration}ms` });
      
      // 回退到默认意图
      const fallbackIntent = this.fallbackIntent(message);
      this.logger.info('使用回退意图', { intent: fallbackIntent });
      
      return fallbackIntent;
    }
  }
  
  /**
   * 准备意图识别的上下文数据
   * 
   * 从 ChatMessage 中提取必要的上下文信息：
   * - user_query: 用户查询内容
   * - file_path_name: 当前文件路径
   * - lang: 编程语言
   * - select_code_info: 选中的代码
   * 
   * @param message 聊天消息
   * @returns 上下文数据映射
   */
  private prepareIntentContext(message: ChatMessage): Record<string, string> {
    const context: Record<string, string> = {
      user_query: message.content,
      file_path_name: '',
      lang: '',
      select_code_info: ''
    };
    
    if (message.context) {
      context.file_path_name = message.context.currentFile?.path || '';
      context.lang = message.context.currentFile?.language || '';
      context.select_code_info = message.context.selection?.text || '';
    }
    
    return context;
  }
  
  /**
   * 渲染意图识别 Prompt
   * 
   * 使用简单的字符串替换将上下文数据填充到模板中
   * 
   * @param context 上下文数据
   * @returns 渲染后的 Prompt 字符串
   */
  private renderIntentPrompt(context: Record<string, string>): string {
    let prompt = this.intentRecognitionTemplate;
    
    // 简单的字符串替换
    for (const [key, value] of Object.entries(context)) {
      const pattern = new RegExp(`\\{${key}\\}`, 'g');
      prompt = prompt.replace(pattern, value);
    }
    
    return prompt;
  }
  
  /**
   * 解析大模型返回的意图
   * 
   * 映射规则：
   * - comments, edit, tests, fix, generate -> code-generation
   * - explain -> code-explanation
   * - chat -> chat
   * - unknown -> chat (默认为通用对话)
   * 
   * @param response 大模型返回的响应内容
   * @returns 解析后的意图类型
   */
  private parseIntentResponse(response: string): IntentType {
    const trimmed = response.trim().toLowerCase();
    
    this.logger.debug('解析意图响应', { response: trimmed });
    
    // 映射大模型返回的功能 ID 到意图类型
    const intentMapping: Record<string, IntentType> = {
      'comments': 'code-generation',
      'edit': 'code-generation',
      'tests': 'code-generation',
      'fix': 'code-generation',
      'explain': 'code-explanation',
      'generate': 'code-generation',
      'chat': 'chat',
      'unknown': 'chat'
    };
    
    // 查找匹配的意图
    for (const [key, intent] of Object.entries(intentMapping)) {
      if (trimmed.includes(key)) {
        this.logger.debug('找到匹配的意图', { key, intent });
        return intent;
      }
    }
    
    // 默认返回通用对话
    this.logger.debug('未找到匹配的意图，使用默认 chat');
    return 'chat';
  }
  
  /**
   * 回退意图（当大模型调用失败时）
   * 
   * 基于规则的简单回退逻辑：
   * - 如果有选中的代码，返回 code-explanation
   * - 如果有代码上下文但没有选中代码，返回 code-question
   * - 否则返回 chat
   * 
   * @param message 聊天消息
   * @returns 回退的意图类型
   */
  private fallbackIntent(message: ChatMessage): IntentType {
    // 简单的基于规则的回退逻辑
    if (message.context) {
      if (message.context.selection) {
        this.logger.debug('回退逻辑：检测到选中代码，使用 code-explanation');
        return 'code-explanation';
      }
      this.logger.debug('回退逻辑：检测到代码上下文，使用 code-question');
      return 'code-question';
    }
    this.logger.debug('回退逻辑：无代码上下文，使用 chat');
    return 'chat';
  }
}
