/**
 * 插入提醒（参考 opencode）
 */
async function insertReminders(input: {
  messages: ModelMessage[];
  agent: AgentConfig;
  session: Session;
  lastUser?: MessageWithParts;
  lastAssistant?: MessageWithParts;
  isLastStep: boolean;
}) {
  const userMessage = input.lastUser;
  if (!userMessage) return;

  // 如果是 plan 模式，插入 plan 提醒
  if (input.agent.name === 'plan') {
    await input.session.addTextPart(userMessage.id, PROMPT_PLAN);
    return;
  }

  // 如果之前是 plan 模式，现在切换到 build 模式，插入切换提醒
  const wasPlan = input.messages.some((msg) => 
    msg.role === 'assistant' && 
    (msg as any).agent === 'plan'
  );
  
  if (wasPlan && input.agent.name === 'build') {
    await input.session.addTextPart(userMessage.id, BUILD_SWITCH);
    return;
  }

  // 如果是最后一步，插入最大步数提醒
  if (input.isLastStep) {
    await input.session.addTextPart(userMessage.id, MAX_STEPS);
  }
}