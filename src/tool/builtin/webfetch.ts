/**
 * WebFetch tool - 网页获取工具
 * 
 * 功能：
 * - 从URL获取网页内容
 * - 支持多种输出格式（text、markdown、html）
 * - 自动HTML到Markdown转换
 * - 支持超时控制
 * - 限制响应大小（最大5MB）
 * - 支持中止信号（AbortSignal）
 */

import { z } from 'zod';
import { Tool } from '../tool';

// 最大响应大小：5MB
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
// 默认超时时间：30秒
const DEFAULT_TIMEOUT = 30 * 1000;
// 最大超时时间：2分钟
const MAX_TIMEOUT = 120 * 1000;

/**
 * 从HTML中提取纯文本
 * 
 * 移除script、style等标签，提取文本内容
 * 
 * @param html HTML内容
 * @returns 提取的文本内容
 */
async function extractTextFromHTML(html: string): Promise<string> {
  // 移除脚本、样式等标签
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '');

  // 提取文本内容：移除所有HTML标签，规范化空白字符
  text = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

/**
 * 将HTML转换为Markdown格式
 * 
 * 这是一个基础实现，支持常见的HTML标签转换
 * 生产环境建议使用专门的库（如turndown）
 * 
 * @param html HTML内容
 * @returns Markdown格式的内容
 */
function convertHTMLToMarkdown(html: string): string {
  // 简单的HTML到Markdown转换
  let markdown = html
    // 标题转换
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
    .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n')
    // 段落转换
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    // 粗体转换
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    // 斜体转换
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    // 代码转换
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    // 链接转换
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    // 列表转换
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    // 换行转换
    .replace(/<br[^>]*>/gi, '\n')
    // 移除剩余的HTML标签
    .replace(/<[^>]+>/g, '')
    // 规范化多个连续换行
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return markdown;
}

/**
 * WebFetch 工具定义
 * 
 * 参数：
 * - url: 要获取的URL（必须以http://或https://开头）
 * - format: 输出格式（text、markdown、html），默认markdown
 * - timeout: 超时时间（秒，最大120秒）
 * 
 * 功能说明：
 * - 根据format参数设置Accept头，优先请求对应格式
 * - 如果服务器返回HTML但请求的是markdown/text，会自动转换
 * - 限制响应大小，避免内存溢出
 */
export const WebFetchTool = Tool.define('webfetch', {
  description: `Fetch content from a URL. Use this tool to retrieve web pages, API responses, or any HTTP/HTTPS resources.`,
  parameters: z.object({
    url: z.string().describe('The URL to fetch content from'),
    format: z
      .enum(['text', 'markdown', 'html'])
      .default('markdown')
      .describe('The format to return the content in (text, markdown, or html). Defaults to markdown.'),
    timeout: z.number().optional().describe('Optional timeout in seconds (max 120)'),
  }),
  async execute(params, ctx) {
    // 验证URL格式
    if (!params.url.startsWith('http://') && !params.url.startsWith('https://')) {
      throw new Error('URL must start with http:// or https://');
    }

    // 请求网络访问权限
    await ctx.ask({
      permission: 'webfetch',
      patterns: [params.url],
      always: ['*'],
      metadata: {
        url: params.url,
        format: params.format,
        timeout: params.timeout,
      },
    });

    // 计算超时时间（限制在最大超时时间内）
    const timeout = Math.min((params.timeout ?? DEFAULT_TIMEOUT / 1000) * 1000, MAX_TIMEOUT);

    // 设置超时控制器
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // 根据请求格式设置Accept头（使用q值表示优先级）
    let acceptHeader = '*/*';
    switch (params.format) {
      case 'markdown':
        acceptHeader =
          'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1';
        break;
      case 'text':
        acceptHeader = 'text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1';
        break;
      case 'html':
        acceptHeader =
          'text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1';
        break;
    }

    // 合并中止信号（超时信号和上下文中止信号）
    const signal = AbortSignal.any([controller.signal, ctx.abort]);
    
    // 设置请求头
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      Accept: acceptHeader,
      'Accept-Language': 'en-US,en;q=0.9',
    };

    // 发送HTTP请求
    const response = await fetch(params.url, { signal, headers });
    clearTimeout(timeoutId); // 清除超时定时器

    // 检查响应状态
    if (!response.ok) {
      throw new Error(`Request failed with status code: ${response.status}`);
    }

    // 检查Content-Length头，提前判断响应大小
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
      throw new Error('Response too large (exceeds 5MB limit)');
    }

    // 读取响应内容
    const arrayBuffer = await response.arrayBuffer();
    // 再次检查实际响应大小
    if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
      throw new Error('Response too large (exceeds 5MB limit)');
    }

    // 解码响应内容
    const content = new TextDecoder().decode(arrayBuffer);
    const contentType = response.headers.get('content-type') || '';

    const title = `${params.url} (${contentType})`;

    // 根据请求格式处理内容
    switch (params.format) {
      case 'markdown':
        // 如果服务器返回HTML，转换为Markdown
        if (contentType.includes('text/html')) {
          const markdown = convertHTMLToMarkdown(content);
          return {
            output: markdown,
            title,
            metadata: {},
          };
        }
        // 如果已经是Markdown或其他文本格式，直接返回
        return {
          output: content,
          title,
          metadata: {},
        };

      case 'text':
        // 如果服务器返回HTML，提取纯文本
        if (contentType.includes('text/html')) {
          const text = await extractTextFromHTML(content);
          return {
            output: text,
            title,
            metadata: {},
          };
        }
        // 如果已经是文本格式，直接返回
        return {
          output: content,
          title,
          metadata: {},
        };

      case 'html':
        // 直接返回HTML内容
        return {
          output: content,
          title,
          metadata: {},
        };

      default:
        // 默认返回原始内容
        return {
          output: content,
          title,
          metadata: {},
        };
    }
  },
});
