import type { AgentFlavor } from '@/lib/happy/types';

export type UsageCommandProvider = Extract<AgentFlavor, 'codex' | 'claude'>;
export type ChatCommandId = 'usage';

export type ChatCommandDefinition = {
  id: ChatCommandId;
  label: string;
  slashCommand: string;
  description: string;
  providers: UsageCommandProvider[];
};

export type UsageProbeStep = {
  delayMs: number;
  input: string;
};

export type UsageProbeDescriptor = {
  provider: UsageCommandProvider;
  title: string;
  guidance: string;
  steps: UsageProbeStep[];
};

const CHAT_COMMANDS: ChatCommandDefinition[] = [
  {
    id: 'usage',
    label: 'Usage',
    slashCommand: '/usage',
    description: '현재 provider의 usage/status TUI 화면을 엽니다.',
    providers: ['codex', 'claude'],
  },
];

function shellEscape(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

export function resolveAvailableChatCommands(agent: AgentFlavor): ChatCommandDefinition[] {
  if (agent !== 'codex' && agent !== 'claude') {
    return [];
  }
  return CHAT_COMMANDS.filter((command) => command.providers.includes(agent));
}

export function buildUsageProbeDescriptor(provider: UsageCommandProvider, workspacePath: string): UsageProbeDescriptor {
  const cdCommand = `cd '${shellEscape(workspacePath)}'\r`;

  if (provider === 'claude') {
    return {
      provider,
      title: 'Claude Usage',
      guidance: 'Claude TUI가 열리면 /status 화면을 그대로 확인하세요. 필요하면 직접 입력할 수도 있습니다.',
      steps: [
        { delayMs: 120, input: 'clear\r' },
        { delayMs: 260, input: cdCommand },
        { delayMs: 420, input: 'claude\r' },
        { delayMs: 2200, input: '/status\r' },
      ],
    };
  }

  return {
    provider,
    title: 'Codex Usage',
    guidance: 'Codex TUI가 열리면 /status 화면을 그대로 확인하세요. 자동 실행이 늦으면 직접 /status 를 입력할 수 있습니다.',
    steps: [
      { delayMs: 120, input: 'clear\r' },
      { delayMs: 260, input: cdCommand },
      { delayMs: 420, input: 'codex --no-alt-screen\r' },
      { delayMs: 6500, input: '/status\r' },
    ],
  };
}
