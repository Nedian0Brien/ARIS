export type AgentFlavor = 'codex' | 'claude' | 'gemini' | 'unknown';
export type SessionStatus = 'running' | 'idle' | 'stopped' | 'error' | 'unknown';
export type ApprovalPolicy = 'on-request' | 'on-failure' | 'never' | 'yolo';
export type PermissionRisk = 'low' | 'medium' | 'high';
export type PermissionState = 'pending' | 'approved' | 'denied';
export type PermissionDecision = 'allow_once' | 'allow_session' | 'deny';
export type SessionAction = 'abort' | 'retry' | 'kill' | 'resume';

export type RuntimeSession = {
  id: string;
  seq?: number;
  metadata: {
    flavor: AgentFlavor;
    path: string;
    approvalPolicy: ApprovalPolicy;
    model?: string;
    branch?: string;
    runtimeModel?: string;
  };
  state: {
    status: SessionStatus;
  };
  updatedAt: string;
  riskScore: number;
};

export type GeminiCapabilityOption = {
  id: string;
  label: string;
};

export type GeminiSessionCapabilities = {
  sessionId: string;
  fetchedAt: string;
  modes: {
    currentModeId?: string | null;
    availableModes: GeminiCapabilityOption[];
  };
  models: {
    currentModelId?: string | null;
    availableModels: GeminiCapabilityOption[];
  };
};

export type RuntimeMessage = {
  id: string;
  sessionId: string;
  type: string;
  title: string;
  text: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export type PermissionRequest = {
  id: string;
  sessionId: string;
  chatId?: string | null;
  agent: AgentFlavor;
  command: string;
  reason: string;
  risk: PermissionRisk;
  requestedAt: string;
  state: PermissionState;
  decision?: PermissionDecision | null;
};

export type ChatUsageTotals = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
};

// Chat.usageStats(Json) 칼럼의 형태. Codex는 app-server의
// thread/tokenUsage/updated에서 라이브로, Claude는 transcript import 시
// message.usage 누적으로 채운다. Gemini는 스트림에 usage가 없어 미지원.
export type ChatUsageStats = {
  provider: 'codex' | 'claude' | 'gemini';
  model: string | null;
  contextWindow: number | null;
  total: ChatUsageTotals;
  lastTurn: ChatUsageTotals | null;
  updatedAt: string;
};
