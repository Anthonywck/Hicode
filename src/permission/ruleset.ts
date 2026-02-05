/**
 * 权限规则集
 * 定义权限规则的数据结构和操作
 */

/**
 * 权限动作类型
 */
export type PermissionAction = 'allow' | 'deny' | 'ask';

/**
 * 权限规则
 */
export interface PermissionRule {
  /** 权限类型（如 read, write, edit, bash, grep, skill, doom_loop） */
  permission: string;
  /** 匹配模式（支持通配符，如 "*.ts", "src/**"） */
  pattern: string;
  /** 动作：allow（允许）、deny（拒绝）、ask（询问） */
  action: PermissionAction;
}

/**
 * 权限规则集
 * 规则按顺序匹配，最后一个匹配的规则生效
 */
export type PermissionRuleset = PermissionRule[];

/**
 * 从配置对象创建规则集
 * @param config 配置对象，格式如 { read: 'allow', write: { '*.ts': 'ask', '*': 'deny' } }
 */
export function fromConfig(config: Record<string, PermissionAction | Record<string, PermissionAction>>): PermissionRuleset {
  const ruleset: PermissionRuleset = [];
  
  for (const [permission, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      ruleset.push({
        permission,
        pattern: '*',
        action: value,
      });
      continue;
    }
    
    for (const [pattern, action] of Object.entries(value)) {
      ruleset.push({
        permission,
        pattern: expandPattern(pattern),
        action,
      });
    }
  }
  
  return ruleset;
}

/**
 * 展开模式（支持 ~ 和 $HOME）
 */
function expandPattern(pattern: string): string {
  if (pattern.startsWith('~/')) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return homeDir + pattern.slice(1);
  }
  if (pattern === '~') {
    return process.env.HOME || process.env.USERPROFILE || '';
  }
  if (pattern.startsWith('$HOME/')) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return homeDir + pattern.slice(5);
  }
  if (pattern === '$HOME') {
    return process.env.HOME || process.env.USERPROFILE || '';
  }
  return pattern;
}

/**
 * 合并多个规则集
 * @param rulesets 要合并的规则集
 * @returns 合并后的规则集
 */
export function merge(...rulesets: PermissionRuleset[]): PermissionRuleset {
  return rulesets.flat();
}

/**
 * 创建默认规则集
 * @returns 默认规则集（所有权限都询问）
 */
export function createDefault(): PermissionRuleset {
  return [
    { permission: '*', pattern: '*', action: 'ask' },
  ];
}
