/**
 * 权限评估器
 * 根据规则集评估权限请求
 */

import { PermissionRule, PermissionRuleset, PermissionAction } from './ruleset';
import { merge } from './ruleset';

/**
 * 通配符匹配
 * @param text 要匹配的文本
 * @param pattern 模式（支持 * 和 **）
 */
function wildcardMatch(text: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === text) return true;
  
  const regex = new RegExp(
    '^' +
    pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*') +
    '$'
  );
  
  return regex.test(text);
}

/**
 * 评估权限请求
 * @param permission 权限类型
 * @param pattern 匹配模式
 * @param rulesets 规则集（多个规则集会合并）
 * @returns 匹配的规则，如果没有匹配则返回默认规则（ask）
 */
export function evaluate(
  permission: string,
  pattern: string,
  ...rulesets: PermissionRuleset[]
): PermissionRule {
  const merged = merge(...rulesets);
  
  let matchedRule: PermissionRule | null = null;
  
  for (const rule of merged) {
    if (wildcardMatch(permission, rule.permission) && wildcardMatch(pattern, rule.pattern)) {
      matchedRule = rule;
    }
  }
  
  return matchedRule ?? { permission, pattern: '*', action: 'ask' };
}

/**
 * 检查权限是否被禁用
 * @param tools 工具列表
 * @param ruleset 规则集
 * @returns 被禁用的工具集合
 */
export function getDisabledTools(tools: string[], ruleset: PermissionRuleset): Set<string> {
  const disabled = new Set<string>();
  const editTools = ['edit', 'write', 'patch', 'multiedit'];
  
  for (const tool of tools) {
    const permission = editTools.includes(tool) ? 'edit' : tool;
    const rule = evaluate(permission, '*', ruleset);
    
    if (rule.pattern === '*' && rule.action === 'deny') {
      disabled.add(tool);
    }
  }
  
  return disabled;
}

/**
 * 检查权限是否被允许（不需要询问）
 * @param permission 权限类型
 * @param pattern 匹配模式
 * @param rulesets 规则集
 * @returns 如果允许返回 true，否则返回 false
 */
export function isAllowed(
  permission: string,
  pattern: string,
  ...rulesets: PermissionRuleset[]
): boolean {
  const rule = evaluate(permission, pattern, ...rulesets);
  return rule.action === 'allow';
}

/**
 * 检查权限是否被拒绝
 * @param permission 权限类型
 * @param pattern 匹配模式
 * @param rulesets 规则集
 * @returns 如果拒绝返回 true，否则返回 false
 */
export function isDenied(
  permission: string,
  pattern: string,
  ...rulesets: PermissionRuleset[]
): boolean {
  const rule = evaluate(permission, pattern, ...rulesets);
  return rule.action === 'deny';
}

/**
 * 检查权限是否需要询问
 * @param permission 权限类型
 * @param pattern 匹配模式
 * @param rulesets 规则集
 * @returns 如果需要询问返回 true，否则返回 false
 */
export function needsAsk(
  permission: string,
  pattern: string,
  ...rulesets: PermissionRuleset[]
): boolean {
  const rule = evaluate(permission, pattern, ...rulesets);
  return rule.action === 'ask';
}
