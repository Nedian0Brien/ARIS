export type AgentFlavor = 'codex' | 'claude' | 'gemini' | 'unknown';
export type ProjectStatus = 'running' | 'idle' | 'stopped' | 'error' | 'unknown';
export type ApprovalPolicy = 'on-request' | 'on-failure' | 'never' | 'yolo';
export type PermissionRisk = 'low' | 'medium' | 'high';
export type PermissionState = 'pending' | 'approved' | 'denied';
export type PermissionDecision = 'allow_once' | 'allow_session' | 'deny';
export type ProjectAction = 'abort' | 'retry' | 'kill' | 'resume';

export type RuntimeProject = {
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
    status: ProjectStatus;
  };
  updatedAt: string;
  riskScore: number;
};

export type GeminiCapabilityOption = {
  id: string;
  label: string;
};

export type GeminiProjectCapabilities = {
  projectId?: string;
  sessionId?: string;
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
  projectId: string;
  type: string;
  title: string;
  text: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export type PermissionRequest = {
  id: string;
  projectId: string;
  chatId?: string | null;
  agent: AgentFlavor;
  command: string;
  reason: string;
  risk: PermissionRisk;
  requestedAt: string;
  state: PermissionState;
  decision?: PermissionDecision | null;
};
