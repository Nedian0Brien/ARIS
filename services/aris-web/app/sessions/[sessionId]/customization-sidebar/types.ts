export type SidebarSurface = 'customization' | 'files' | 'git' | 'terminal';
export type CustomizationSection = 'instructions' | 'skills' | 'mcp';

export type InstructionDocSummary = {
  id: string;
  name: string;
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  updatedAt: string | null;
};

export type SkillSummary = {
  id: string;
  name: string;
  description: string;
  source: 'agents' | 'codex';
  relativePath: string;
};

export type MpcServerSummary = {
  id: string;
  name: string;
  status: 'connected' | 'needs_auth' | 'failed' | 'connecting' | 'unknown';
  source: string;
  detail: string;
  lastSeenAt: string | null;
};

export type CustomizationOverview = {
  workspacePath: string;
  instructionDocs: InstructionDocSummary[];
  skills: SkillSummary[];
  mcpServers: MpcServerSummary[];
};

export type InstructionPayload = {
  content: string;
  summary: InstructionDocSummary;
};

export type SkillPayload = {
  content: string;
  summary: SkillSummary;
};

export type WorkspaceFileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
};

export type GitDiffScope = 'working' | 'staged';
export type GitActionName = 'stage' | 'unstage' | 'commit' | 'fetch' | 'pull' | 'push';

export type GitFileEntry = {
  path: string;
  originalPath: string | null;
  indexStatus: string;
  workTreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
};

export type GitOverview = {
  workspacePath: string;
  branch: string | null;
  upstreamBranch: string | null;
  ahead: number;
  behind: number;
  isClean: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictedCount: number;
  files: GitFileEntry[];
};

export type FilePreviewBlock = {
  reason: 'binary' | 'large';
  sizeBytes: number;
};

export type FileActionDialog =
  | { kind: 'create-file'; targetPath: string; value: string }
  | { kind: 'create-folder'; targetPath: string; value: string }
  | { kind: 'rename'; targetPath: string; targetName: string; value: string }
  | { kind: 'delete'; targetPath: string; targetName: string };

export type RequestedFilePayload = {
  path: string;
  name?: string;
  line?: number | null;
  nonce: number;
};

export type FilePathCopyKind = 'absolute' | 'relative';

export type CustomizationModal =
  | { kind: 'instruction'; id: string }
  | { kind: 'skill'; id: string }
  | { kind: 'file'; id: string }
  | null;

export type CustomizationSidebarProps = {
  sessionId: string;
  projectName: string;
  workspaceRootPath?: string;
  requestedFile?: RequestedFilePayload | null;
  isPinned?: boolean;
  onTogglePinned?: () => void;
  mode?: 'desktop' | 'mobile';
  onRequestClose?: () => void;
};
