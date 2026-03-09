export type SessionStatus = 'running' | 'idle' | 'stopped' | 'error' | 'unknown';
export type SessionAction = 'abort' | 'retry' | 'kill' | 'resume';
export type ApprovalPolicy = 'on-request' | 'on-failure' | 'never' | 'yolo';
export type AgentFlavor = 'claude' | 'codex' | 'gemini' | 'unknown';

export type SessionSummary = {
  id: string;
  agent: AgentFlavor;
  status: SessionStatus;
  lastActivityAt: string | null;
  lastReadAt?: string | null;
  riskScore: number;
  projectName: string;
  approvalPolicy?: ApprovalPolicy;
  alias?: string | null;
  isPinned?: boolean;
};

export type SessionChat = {
  id: string;
  sessionId: string;
  agent: AgentFlavor;
  title: string;
  isPinned: boolean;
  isDefault: boolean;
  threadId: string | null;
  lastReadAt?: string | null;
  lastReadEventId?: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

export type UiEventKind =
  | 'text_reply'
  | 'run_execution'
  | 'exec_execution'
  | 'git_execution'
  | 'docker_execution'
  | 'command_execution'
  | 'file_list'
  | 'file_read'
  | 'file_write'
  | 'unknown';

export type UiEventSnippet = {
  language: string;
  code: string;
};

export type UiEventParsed = {
  commands: string[];
  files: string[];
  snippets: UiEventSnippet[];
};

export type UiEventAction = {
  command?: string;
  path?: string;
  target?: string;
};

export type UiEventResult = {
  preview: string;
  full?: string;
  truncated: boolean;
  totalLines?: number;
  shownLines?: number;
};

export type UiEvent = {
  id: string;
  timestamp: string;
  kind: UiEventKind;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
  action?: UiEventAction;
  result?: UiEventResult;
  parsed?: UiEventParsed;
  severity?: 'info' | 'warning' | 'danger' | 'success';
};

export type SessionEventsPage = {
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  oldestEventId: string | null;
  newestEventId: string | null;
  returnedCount: number;
  totalCount: number;
};

export type SessionDetail = {
  id: string;
  agent: SessionSummary['agent'];
  status: SessionStatus;
  projectName: string;
  lastActivityAt: string | null;
  lastReadAt?: string | null;
  approvalPolicy?: ApprovalPolicy;
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
