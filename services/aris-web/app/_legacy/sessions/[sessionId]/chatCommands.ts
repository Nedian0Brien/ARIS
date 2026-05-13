import type { AgentFlavor } from '@/lib/happy/types';

export type UsageCommandProvider = Extract<AgentFlavor, 'codex' | 'claude'>;
export type ChatCommandId = 'status' | 'usage';

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
  commandId: ChatCommandId;
  renderMode: 'raw' | 'parsed';
  title: string;
  guidance: string;
  steps: UsageProbeStep[];
};

const CHAT_COMMANDS: ChatCommandDefinition[] = [
  {
    id: 'status',
    label: 'Status',
    slashCommand: '/status',
    description: '현재 provider의 raw TUI 상태 화면을 엽니다.',
    providers: ['codex', 'claude'],
  },
  {
    id: 'usage',
    label: 'Usage',
    slashCommand: '/usage',
    description: '현재 provider의 usage 화면을 파싱한 요약 모달을 엽니다.',
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

export function buildUsageProbeDescriptor(
  provider: UsageCommandProvider,
  commandId: ChatCommandId,
  workspacePath: string,
): UsageProbeDescriptor {
  const cdCommand = `cd '${shellEscape(workspacePath)}'\r`;

  if (provider === 'claude') {
    return {
      provider,
      commandId,
      renderMode: commandId === 'status' ? 'raw' : 'parsed',
      title: commandId === 'status' ? 'Claude Status' : 'Claude Usage',
      guidance: commandId === 'status'
        ? 'Claude TUI가 열리면 /status 화면을 그대로 확인하세요. 필요하면 직접 입력할 수도 있습니다.'
        : 'Claude usage 화면을 자동 파싱해 요약합니다. 필요하면 raw 상태는 Status 명령으로 확인할 수 있습니다.',
      steps: [
        { delayMs: 120, input: 'clear\r' },
        { delayMs: 260, input: cdCommand },
        { delayMs: 420, input: 'claude\r' },
        { delayMs: 2200, input: commandId === 'status' ? '/status\r' : '/usage\r' },
      ],
    };
  }

  return {
    provider,
    commandId,
    renderMode: commandId === 'status' ? 'raw' : 'parsed',
    title: commandId === 'status' ? 'Codex Status' : 'Codex Usage',
    guidance: commandId === 'status'
      ? 'Codex TUI가 열리면 /status 화면을 그대로 확인하세요. 자동 실행이 늦으면 직접 /status 를 입력할 수 있습니다.'
      : 'Codex status 화면을 자동 파싱해 요약합니다. raw 상태는 Status 명령으로 확인할 수 있습니다.',
    steps: [
      { delayMs: 120, input: 'clear\r' },
      { delayMs: 260, input: cdCommand },
      { delayMs: 420, input: 'codex --no-alt-screen\r' },
      { delayMs: 6500, input: '/status\r' },
    ],
  };
}
