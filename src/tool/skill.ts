/**
 * Skill 工具
 * 允许 Agent 加载和使用技能（Skills）
 */

import { z } from 'zod';
import { Tool } from './tool';
import { Skill } from '../skill/skill';
import { PermissionRuleset, evaluate } from '../permission';
import * as path from 'path';

/**
 * Skill 工具定义
 */
export const SkillTool = Tool.define('skill', async (ctx) => {
  const skills = await Skill.all();

  // 根据 Agent 权限过滤技能
  // ctx.agent 在 init 函数中是 AgentConfig 类型（不是字符串）
  const agentConfig = ctx?.agent;
  const accessibleSkills = agentConfig
    ? Object.values(skills).filter((skill) => {
        const ruleset = agentConfig.permission || [];
        const result = evaluate('skill', skill.name, ruleset);
        return result.action !== 'deny';
      })
    : Object.values(skills);

  const description =
    accessibleSkills.length === 0
      ? 'Load a skill to get detailed instructions for a specific task. No skills are currently available.'
      : [
          'Load a skill to get detailed instructions for a specific task.',
          'Skills provide specialized knowledge and step-by-step guidance.',
          'Use this when a task matches an available skill\'s description.',
          'Only the skills listed here are available:',
          '<available_skills>',
          ...accessibleSkills.flatMap((skill) => [
            '  <skill>',
            `    <name>${skill.name}</name>`,
            `    <description>${skill.description}</description>`,
            '  </skill>',
          ]),
          '</available_skills>',
        ].join(' ');

  const examples = accessibleSkills
    .map((skill) => `'${skill.name}'`)
    .slice(0, 3)
    .join(', ');
  const hint = examples.length > 0 ? ` (e.g., ${examples}, ...)` : '';

  const parameters = z.object({
    name: z.string().describe(`The skill identifier from available_skills${hint}`),
  });

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, toolCtx) {
      const skill = await Skill.get(params.name);

      if (!skill) {
        const available = Object.keys(await Skill.all()).join(', ');
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || 'none'}`);
      }

      // 请求权限
      // toolCtx.agent 是字符串（agent名称），需要通过 Agent.get 获取配置对象
      const agentName = toolCtx.agent;
      const agentConfig = agentName ? await (await import('../agent')).Agent.get(agentName) : null;
      const ruleset = agentConfig ? (agentConfig.permission || []) : [];
      const permissionResult = evaluate('skill', params.name, ruleset);
      if (permissionResult.action === 'deny') {
        throw new Error(`Permission denied for skill: ${params.name}`);
      }
      if (permissionResult.action === 'ask') {
        // TODO: 实现用户权限请求UI
        throw new Error(`Permission required for skill: ${params.name}`);
      }

      // 加载技能内容
      const content = await Skill.getContent(params.name);
      if (!content) {
        throw new Error(`Failed to load skill content: ${params.name}`);
      }

      const dir = path.dirname(skill.location);

      // 格式化输出
      const output = [
        `## Skill: ${skill.name}`,
        '',
        `**Base directory**: ${dir}`,
        '',
        content.trim(),
      ].join('\n');

      return {
        title: `Loaded skill: ${skill.name}`,
        output,
        metadata: {
          name: skill.name,
          dir,
        },
      };
    },
  };
});
