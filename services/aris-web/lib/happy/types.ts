export type SessionStatus = 'running' | 'idle' | 'stopped' | 'error' | 'unknown';
export type SessionAction = 'abort' | 'retry' | 'kill' | 'resume';

export type SessionSummary = {
  id: string;
  agent: 'claude' | 'codex' | 'gemini' | 'unknown';
  status: SessionStatus;
  lastActivityAt: string | null;
  riskScore: number;
  projectName: string;
  alias?: string | null;
  isPinned?: boolean;
};

export type UiEventKind = 'text_reply' | 'command_execution' | 'code_read' | 'code_write' | 'unknown';

export type UiEvent = {
  id: string;
  timestamp: string;
  kind: UiEventKind;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'danger' | 'success';
};

export type SessionDetail = {
  id: string;
  agent: SessionSummary['agent'];
  status: SessionStatus;
  projectName: string;
  lastActivityAt: string | null;
  alias?: string | null;
  isPinned?: boolean;
};

export type PermissionRisk = 'low' | 'medium' | 'high';
export type PermissionState = 'pending' | 'approved' | 'denied';
export type PermissionDecision = 'allow_once' | 'allow_session' | 'deny';

export type PermissionRequest = {
  id: string;
  sessionId: string;
  agent: SessionSummary['agent'];
  command: string;
  reason: string;
  risk: PermissionRisk;
  requestedAt: string;
  state: PermissionState;
};

export type SessionActionResult = {
  sessionId: string;
  action: SessionAction;
  accepted: boolean;
  message: string;
  at: string;
};
