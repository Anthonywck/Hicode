/**
 * Skills 系统
 * 管理技能（Skills）的发现、加载和存储
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';

const log = createLogger('skill');

/**
 * Skill 信息
 */
export interface SkillInfo {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 技能文件路径 */
  location: string;
}

/**
 * Skills 管理器
 */
export class SkillManager {
  private skills: Map<string, SkillInfo> = new Map();
  private skillsDirectory: string;

  constructor(private context: vscode.ExtensionContext) {
    // 技能目录：工作区根目录下的 .hicode/skills 或全局配置目录
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      this.skillsDirectory = path.join(workspaceFolder.uri.fsPath, '.hicode', 'skills');
    } else {
      // 使用全局目录
      const globalStoragePath = context.globalStorageUri.fsPath;
      this.skillsDirectory = path.join(globalStoragePath, 'skills');
    }
  }

  /**
   * 初始化技能管理器（扫描技能目录）
   */
  async initialize(): Promise<void> {
    await this.scanSkills();
  }

  /**
   * 扫描技能目录
   */
  private async scanSkills(): Promise<void> {
    this.skills.clear();

    const directories: string[] = [];

    // 扫描工作区目录
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const hicodeSkills = path.join(workspaceFolder.uri.fsPath, '.hicode', 'skills');
      if (fs.existsSync(hicodeSkills)) {
        directories.push(hicodeSkills);
      }

      const claudeSkills = path.join(workspaceFolder.uri.fsPath, '.claude', 'skills');
      if (fs.existsSync(claudeSkills)) {
        directories.push(claudeSkills);
      }
    }

    // 扫描全局目录
    const globalStoragePath = this.context.globalStorageUri.fsPath;
    const globalSkills = path.join(globalStoragePath, 'skills');
    if (fs.existsSync(globalSkills)) {
      directories.push(globalSkills);
    }

    // 扫描主技能目录
    if (fs.existsSync(this.skillsDirectory)) {
      directories.push(this.skillsDirectory);
    } else {
      try {
        fs.mkdirSync(this.skillsDirectory, { recursive: true });
        directories.push(this.skillsDirectory);
      } catch (error) {
        log.warn('创建技能目录失败', { directory: this.skillsDirectory, error });
      }
    }

    // 扫描所有目录
    for (const dir of directories) {
      await this.scanDirectory(dir);
    }

    log.info('技能扫描完成', { count: this.skills.size, directories: directories.length });
  }

  /**
   * 扫描单个目录
   */
  private async scanDirectory(directory: string): Promise<void> {
    try {
      if (!fs.existsSync(directory)) {
        return;
      }

      const files = fs.readdirSync(directory, { recursive: true, withFileTypes: true });

      for (const file of files) {
        if (file.isDirectory()) continue;
        if (!file.name.endsWith('.md') && !file.name.endsWith('SKILL.md')) continue;

        const filePath = path.join(directory, file.name);

        try {
          const skill = await this.loadSkill(filePath);
          if (skill) {
            // 如果技能名称已存在，记录警告但继续
            if (this.skills.has(skill.name)) {
              log.warn('duplicate skill name', {
                name: skill.name,
                existing: this.skills.get(skill.name)?.location,
                duplicate: filePath,
              });
            }
            this.skills.set(skill.name, skill);
          }
        } catch (error) {
          log.warn('加载技能失败', { file: filePath, error });
        }
      }
    } catch (error) {
      log.error('扫描技能目录失败', { directory, error });
    }
  }

  /**
   * 加载技能文件
   */
  private async loadSkill(filePath: string): Promise<SkillInfo | null> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // 解析 frontmatter（如果存在）
      // frontmatter 格式：---\nkey: value\n---\nmarkdown content
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      let frontmatter: Record<string, string> = {};
      let markdownContent = content;

      if (frontmatterMatch) {
        // 分离 frontmatter 和 Markdown 内容
        markdownContent = frontmatterMatch[2];
        const frontmatterText = frontmatterMatch[1];
        // 简单的 YAML 解析（只支持 key: value 格式）
        // 注意：这是一个简化实现，完整的 YAML 解析需要专门的库
        for (const line of frontmatterText.split('\n')) {
          const match = line.match(/^(\w+):\s*(.+)$/);
          if (match) {
            frontmatter[match[1]] = match[2].trim();
          }
        }
      }

      // 优先从 frontmatter 获取名称和描述
      let name = frontmatter.name || '';
      let description = frontmatter.description || '';

      // 如果没有 frontmatter 或 frontmatter 中没有名称/描述，从 Markdown 内容解析
      if (!name || !description) {
        const lines = markdownContent.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          // 查找第一个 # 标题作为名称
          if (!name && line.startsWith('# ')) {
            name = line.substring(2).trim();
            continue;
          }

          // 查找第一个非空段落作为描述
          if (!description && line && !line.startsWith('#') && !line.startsWith('---')) {
            description = line;
            // 如果描述太长，截断（保留前 197 个字符）
            if (description.length > 200) {
              description = description.substring(0, 197) + '...';
            }
            break;
          }
        }
      }

      if (!name) {
        // 使用文件名作为名称
        name = path.basename(filePath, '.md');
      }

      if (!description) {
        description = `Skill: ${name}`;
      }

      return {
        name,
        description,
        location: filePath,
      };
    } catch (error) {
      log.error('加载技能文件失败', { filePath, error });
      return null;
    }
  }

  /**
   * 获取所有技能
   */
  async all(): Promise<Record<string, SkillInfo>> {
    return Object.fromEntries(this.skills);
  }

  /**
   * 获取技能
   */
  async get(name: string): Promise<SkillInfo | null> {
    return this.skills.get(name) || null;
  }

  /**
   * 获取技能内容
   */
  async getContent(name: string): Promise<string | null> {
    const skill = await this.get(name);
    if (!skill) {
      return null;
    }

    try {
      const content = fs.readFileSync(skill.location, 'utf-8');
      // 移除 frontmatter（如果存在）
      const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      return frontmatterMatch ? frontmatterMatch[1] : content;
    } catch (error) {
      log.error('读取技能内容失败', { name, error });
      return null;
    }
  }

  /**
   * 刷新技能列表
   */
  async refresh(): Promise<void> {
    await this.scanSkills();
  }

  /**
   * 获取技能目录
   */
  getSkillsDirectory(): string {
    return this.skillsDirectory;
  }
}

/**
 * 全局技能管理器实例
 */
let skillManagerInstance: SkillManager | null = null;

/**
 * 获取技能管理器实例
 */
export function getSkillManager(context: vscode.ExtensionContext): SkillManager {
  if (!skillManagerInstance) {
    skillManagerInstance = new SkillManager(context);
  }
  return skillManagerInstance;
}

/**
 * Skills 命名空间
 */
export namespace Skill {
  /**
   * 获取所有技能
   */
  export async function all(): Promise<Record<string, SkillInfo>> {
    if (!skillManagerInstance) {
      // 如果 SkillManager 未初始化，尝试自动初始化
      try {
        const { getExtensionContext } = await import('../extension');
        const context = await getExtensionContext();
        skillManagerInstance = getSkillManager(context);
        await skillManagerInstance.initialize();
      } catch (error) {
        // 如果无法初始化，返回空技能列表（而不是抛出错误）
        log.warn('SkillManager 未初始化，返回空技能列表', { error });
        return {};
      }
    }
    return await skillManagerInstance.all();
  }

  /**
   * 获取技能
   */
  export async function get(name: string): Promise<SkillInfo | null> {
    if (!skillManagerInstance) {
      // 如果 SkillManager 未初始化，尝试自动初始化
      try {
        const { getExtensionContext } = await import('../extension');
        const context = await getExtensionContext();
        skillManagerInstance = getSkillManager(context);
        await skillManagerInstance.initialize();
      } catch (error) {
        log.warn('SkillManager 未初始化，无法获取技能', { name, error });
        return null;
      }
    }
    return await skillManagerInstance.get(name);
  }

  /**
   * 获取技能内容
   */
  export async function getContent(name: string): Promise<string | null> {
    if (!skillManagerInstance) {
      // 如果 SkillManager 未初始化，尝试自动初始化
      try {
        const { getExtensionContext } = await import('../extension');
        const context = await getExtensionContext();
        skillManagerInstance = getSkillManager(context);
        await skillManagerInstance.initialize();
      } catch (error) {
        log.warn('SkillManager 未初始化，无法获取技能内容', { name, error });
        return null;
      }
    }
    return await skillManagerInstance.getContent(name);
  }
}
