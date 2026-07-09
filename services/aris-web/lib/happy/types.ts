export type ProjectStatus = 'running' | 'idle' | 'stopped' | 'error' | 'unknown';
export type ProjectAction = 'abort' | 'retry' | 'kill' | 'resume';
export type ApprovalPolicy = 'on-request' | 'on-failure' | 'never' | 'yolo';
export type AgentFlavor = 'claude' | 'codex' | 'gemini' | 'unknown';

export type ProjectSummary = {
  id: string;
  agent: AgentFlavor;
  status: ProjectStatus;
  lastActivityAt: string | null;
  model?: string | null;
  lastReadAt?: string | null;
  riskScore: number;
  projectName: string;
  branch?: string | null;
  approvalPolicy?: ApprovalPolicy;
  alias?: string | null;
  isPinned?: boolean;
  metadata?: {
    runtimeModel?: string;
    branch?: string | null;
  };
  // 채팅 집계 (API route에서 주입, happy 서버에서 오지 않음)
  chatAgentCounts?: { claude: number; codex: number; gemini: number; unknown: number };
  totalChats?: number;
  recentChats?: ProjectChat[];
};

export type ProjectChat = {
  id: string;
  projectId: string;
  agent: AgentFlavor;
  model?: string | null;
  geminiMode?: string | null;
  modelReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null;
  title: string;
  isPinned: boolean;
  isDefault: boolean;
  threadId: string | null;
  parentChatId?: string | null;
  subagentType?: string | null;
  subagentStatus?: string | null;
  latestPreview?: string;
  latestEventId?: string | null;
  latestEventAt?: string | null;
  latestEventIsUser?: boolean;
  latestHasErrorSignal?: boolean;
  lastReadAt?: string | null;
  lastReadEventId?: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

export type Chat = ProjectChat;

export type ChatImageAttachment = {
  assetId: string;
  kind: 'image';
  name: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  serverPath: string;
  previewUrl: string;
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
  | 'think'
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

export type ProjectEventsPage = {
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  oldestEventId: string | null;
  newestEventId: string | null;
  returnedCount: number;
  totalCount: number;
};

export type ProjectDetail = {
  id: string;
  agent: ProjectSummary['agent'];
  status: ProjectStatus;
  projectName: string;
  branch?: string | null;
  hostPath?: string | null;
  model?: string | null;
  lastActivityAt: string | null;
  lastReadAt?: string | null;
  approvalPolicy?: ApprovalPolicy;
  alias?: string | null;
  isPinned?: boolean;
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

export type PermissionRisk = 'low' | 'medium' | 'high';
export type PermissionState = 'pending' | 'approved' | 'denied';
export type PermissionDecision = 'allow_once' | 'allow_session' | 'deny';

export type PermissionRequest = {
  id: string;
  projectId: string;
  chatId?: string | null;
  agent: ProjectSummary['agent'];
  command: string;
  reason: string;
  risk: PermissionRisk;
  requestedAt: string;
  state: PermissionState;
};

export type ProjectActionResult = {
  projectId: string;
  chatId?: string;
  action: ProjectAction;
  accepted: boolean;
  message: string;
  at: string;
};

export type ChatSample = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  agent: AgentFlavor;
};

export type GlobalChatStats = {
  running: number;
  completed: number;
  agentDistribution: { claude: number; codex: number; gemini: number; unknown: number };
  runningSample: ChatSample[];
  completedSample: ChatSample[];
};
