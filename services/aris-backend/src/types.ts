export type AgentFlavor = 'codex' | 'claude' | 'gemini' | 'unknown';
export type SessionStatus = 'running' | 'idle' | 'stopped' | 'error' | 'unknown';
export type PermissionRisk = 'low' | 'medium' | 'high';
export type PermissionState = 'pending' | 'approved' | 'denied';
export type PermissionDecision = 'allow_once' | 'allow_session' | 'deny';
export type SessionAction = 'abort' | 'retry' | 'kill' | 'resume';

export type RuntimeSession = {
  id: string;
  metadata: {
    flavor: AgentFlavor;
    path: string;
  };
  state: {
    status: SessionStatus;
  };
  updatedAt: string;
  riskScore: number;
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
  agent: AgentFlavor;
  command: string;
  reason: string;
  risk: PermissionRisk;
  requestedAt: string;
  state: PermissionState;
};
