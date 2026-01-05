/**
 * Markdown Renderer
 * 提供Markdown渲染和代码高亮支持
 */

/**
 * 代码块信息
 */
export interface CodeBlock {
  language: string;
  code: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Markdown渲染选项
 */
export interface MarkdownRenderOptions {
  /** 是否启用代码高亮 */
  enableCodeHighlight?: boolean;
  /** 是否启用自动链接 */
  enableAutoLink?: boolean;
  /** 是否启用表格支持 */
  enableTables?: boolean;
  /** 自定义CSS类前缀 */
  cssPrefix?: string;
}

/**
 * Markdown渲染器接口
 */
export interface IMarkdownRenderer {
  /**
   * 渲染Markdown文本为HTML
   * @param markdown Markdown文本
   * @param options 渲染选项
   * @returns HTML字符串
   */
  render(markdown: string, options?: MarkdownRenderOptions): string;

  /**
   * 提取代码块
   * @param markdown Markdown文本
   * @returns 代码块列表
   */
  extractCodeBlocks(markdown: string): CodeBlock[];

  /**
   * 高亮代码
   * @param code 代码文本
   * @param language 编程语言
   * @returns 高亮后的HTML
   */
  highlightCode(code: string, language: string): string;

  /**
   * 转义HTML特殊字符
   * @param text 文本
   * @returns 转义后的文本
   */
  escapeHtml(text: string): string;
}

/**
 * Markdown渲染器实现
 * 提供基础的Markdown到HTML转换功能
 */
export class MarkdownRenderer implements IMarkdownRenderer {
  private defaultOptions: Required<MarkdownRenderOptions> = {
    enableCodeHighlight: true,
    enableAutoLink: true,
    enableTables: true,
    cssPrefix: 'md-'
  };

  /**
   * 渲染Markdown为HTML
   */
  render(markdown: string, options?: MarkdownRenderOptions): string {
    const opts = { ...this.defaultOptions, ...options };
    let html = markdown;

    // 1. 转义HTML特殊字符（除了代码块）
    const codeBlocks = this.extractCodeBlocks(html);
    const placeholders: string[] = [];
    
    // 替换代码块为占位符
    codeBlocks.forEach((block, index) => {
      const placeholder = `__CODE_BLOCK_${index}__`;
      placeholders.push(placeholder);
      html = html.substring(0, block.startIndex) + 
             placeholder + 
             html.substring(block.endIndex);
    });

    // 转义非代码块部分
    html = this.escapeHtml(html);

    // 2. 渲染代码块
    if (opts.enableCodeHighlight) {
      codeBlocks.forEach((block, index) => {
        const highlighted = this.renderCodeBlock(block, opts);
        html = html.replace(placeholders[index], highlighted);
      });
    }

    // 3. 渲染标题
    html = this.renderHeadings(html, opts);

    // 4. 渲染粗体和斜体
    html = this.renderEmphasis(html, opts);

    // 5. 渲染链接
    if (opts.enableAutoLink) {
      html = this.renderLinks(html, opts);
    }

    // 6. 渲染列表
    html = this.renderLists(html, opts);

    // 7. 渲染表格
    if (opts.enableTables) {
      html = this.renderTables(html, opts);
    }

    // 8. 渲染段落
    html = this.renderParagraphs(html, opts);

    return html;
  }

  /**
   * 提取代码块
   */
  extractCodeBlocks(markdown: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const regex = /```(\w*)\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      blocks.push({
        language: match[1] || 'plaintext',
        code: match[2],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }

    return blocks;
  }

  /**
   * 高亮代码
   * 注意：这是一个简化实现，实际应用中应该使用专业的语法高亮库
   */
  highlightCode(code: string, language: string): string {
    // 这里提供基础的HTML转义
    // 在实际VSCode扩展中，应该使用VSCode的语法高亮API
    const escaped = this.escapeHtml(code);
    return `<code class="language-${language}">${escaped}</code>`;
  }

  /**
   * 转义HTML特殊字符
   */
  escapeHtml(text: string): string {
    const htmlEscapes: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return text.replace(/[&<>"']/g, char => htmlEscapes[char]);
  }

  /**
   * 渲染代码块
   */
  private renderCodeBlock(block: CodeBlock, options: Required<MarkdownRenderOptions>): string {
    const highlighted = this.highlightCode(block.code, block.language);
    return `<pre class="${options.cssPrefix}code-block"><code class="${options.cssPrefix}code language-${block.language}">${highlighted}</code></pre>`;
  }

  /**
   * 渲染标题
   */
  private renderHeadings(html: string, options: Required<MarkdownRenderOptions>): string {
    // H1-H6
    for (let i = 6; i >= 1; i--) {
      const regex = new RegExp(`^${'#'.repeat(i)} (.+)$`, 'gm');
      html = html.replace(regex, `<h${i} class="${options.cssPrefix}heading-${i}">$1</h${i}>`);
    }
    return html;
  }

  /**
   * 渲染粗体和斜体
   */
  private renderEmphasis(html: string, options: Required<MarkdownRenderOptions>): string {
    // 粗体 **text** 或 __text__
    html = html.replace(/\*\*(.+?)\*\*/g, `<strong class="${options.cssPrefix}bold">$1</strong>`);
    html = html.replace(/__(.+?)__/g, `<strong class="${options.cssPrefix}bold">$1</strong>`);
    
    // 斜体 *text* 或 _text_
    html = html.replace(/\*(.+?)\*/g, `<em class="${options.cssPrefix}italic">$1</em>`);
    html = html.replace(/_(.+?)_/g, `<em class="${options.cssPrefix}italic">$1</em>`);
    
    return html;
  }

  /**
   * 渲染链接
   */
  private renderLinks(html: string, options: Required<MarkdownRenderOptions>): string {
    // Markdown链接 [text](url)
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      `<a href="$2" class="${options.cssPrefix}link">$1</a>`
    );
    
    // 自动链接 http(s)://...
    html = html.replace(
      /(https?:\/\/[^\s<]+)/g,
      `<a href="$1" class="${options.cssPrefix}link">$1</a>`
    );
    
    return html;
  }

  /**
   * 渲染列表
   */
  private renderLists(html: string, options: Required<MarkdownRenderOptions>): string {
    // 无序列表
    html = html.replace(
      /^[*\-+] (.+)$/gm,
      `<li class="${options.cssPrefix}list-item">$1</li>`
    );
    
    // 有序列表
    html = html.replace(
      /^\d+\. (.+)$/gm,
      `<li class="${options.cssPrefix}list-item">$1</li>`
    );
    
    // 包装列表项
    html = html.replace(
      /(<li[^>]*>.*<\/li>\n?)+/g,
      match => `<ul class="${options.cssPrefix}list">${match}</ul>`
    );
    
    return html;
  }

  /**
   * 渲染表格
   */
  private renderTables(html: string, options: Required<MarkdownRenderOptions>): string {
    // 简化的表格渲染
    // 实际实现应该更复杂，处理对齐等
    const tableRegex = /(\|.+\|\n)+/g;
    
    html = html.replace(tableRegex, match => {
      const rows = match.trim().split('\n');
      let tableHtml = `<table class="${options.cssPrefix}table">`;
      
      rows.forEach((row, index) => {
        const cells = row.split('|').filter(cell => cell.trim());
        const tag = index === 0 ? 'th' : 'td';
        const rowClass = index === 0 ? 'header' : 'row';
        
        tableHtml += `<tr class="${options.cssPrefix}table-${rowClass}">`;
        cells.forEach(cell => {
          tableHtml += `<${tag} class="${options.cssPrefix}table-cell">${cell.trim()}</${tag}>`;
        });
        tableHtml += '</tr>';
      });
      
      tableHtml += '</table>';
      return tableHtml;
    });
    
    return html;
  }

  /**
   * 渲染段落
   */
  private renderParagraphs(html: string, options: Required<MarkdownRenderOptions>): string {
    // 将连续的非HTML行包装为段落
    const lines = html.split('\n');
    const result: string[] = [];
    let paragraph: string[] = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      // 如果是HTML标签或空行，结束当前段落
      if (trimmed.startsWith('<') || trimmed === '') {
        if (paragraph.length > 0) {
          result.push(`<p class="${options.cssPrefix}paragraph">${paragraph.join(' ')}</p>`);
          paragraph = [];
        }
        if (trimmed !== '') {
          result.push(line);
        }
      } else {
        paragraph.push(trimmed);
      }
    });
    
    // 处理最后一个段落
    if (paragraph.length > 0) {
      result.push(`<p class="${options.cssPrefix}paragraph">${paragraph.join(' ')}</p>`);
    }
    
    return result.join('\n');
  }

  /**
   * 渲染行内代码
   */
  private renderInlineCode(html: string, options: Required<MarkdownRenderOptions>): string {
    return html.replace(
      /`([^`]+)`/g,
      `<code class="${options.cssPrefix}inline-code">$1</code>`
    );
  }
}

/**
 * 创建默认的Markdown渲染器实例
 */
export function createMarkdownRenderer(options?: MarkdownRenderOptions): IMarkdownRenderer {
  return new MarkdownRenderer();
}
