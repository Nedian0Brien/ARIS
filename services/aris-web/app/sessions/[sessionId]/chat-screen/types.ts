import type { ComponentType } from 'react';
import type { ResolvedChatRunPhase } from '@/lib/happy/chatRuntime';
import type { RenderablePermissionRequest } from '@/lib/happy/permissions';
import type { AgentFlavor, ChatImageAttachment, SessionChat, UiEvent } from '@/lib/happy/types';

export const FOLDER_LABELS = ['src', 'tools', 'jobs', 'scripts', 'tests'] as const;

export type ComposerModelOption = { id: string; shortLabel: string; badge: string };
export type GeminiModeOption = { id: string; shortLabel: string; badge: string };
export type ModelReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type ComposerMode = 'agent' | 'plan' | 'terminal';

export type AgentMeta = {
  label: string;
  tone: 'clay' | 'mint' | 'blue';
  Icon: ComponentType<{ size?: number; className?: string }>;
};

export type Tone = 'sky' | 'amber' | 'cyan' | 'emerald' | 'violet' | 'red' | 'git' | 'docker';
export type ActionKind =
  | 'run_execution'
  | 'exec_execution'
  | 'git_execution'
  | 'docker_execution'
  | 'command_execution'
  | 'file_list'
  | 'file_read'
  | 'file_write'
  | 'think';
export type StreamRenderItem =
  | { type: 'event'; event: UiEvent }
  | { type: 'action_overflow'; id: string; runId: string; kind: ActionKind; hiddenCount: number; expanded: boolean; timestamp: string };
export type TimelineRenderItem =
  | { type: 'stream'; item: StreamRenderItem; sortKey: number; order: number }
  | { type: 'permission'; permission: RenderablePermissionRequest; sortKey: number; order: number };
export type FolderLabel = (typeof FOLDER_LABELS)[number];
export type ResourceLabel =
  | { kind: 'folder'; name: FolderLabel; sourcePath?: string; sourceLine?: number | null }
  | { kind: 'file'; name: string; extension: string; sourcePath?: string; sourceLine?: number | null };
export type ComposerModelId = string;

export type ContextItem =
  | { id: string; type: 'file'; path: string; content: string; name: string }
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'image'; attachment: ChatImageAttachment };
export type ChatRunPhase = ResolvedChatRunPhase;
export type ChatSidebarState = 'default' | 'running' | 'completed' | 'approval' | 'error';
export type ChatSidebarSectionKey = 'pinned' | 'running' | 'completed' | 'history';
export type ChatSidebarSnapshot = {
  preview: string;
  hasEvents: boolean;
  hasErrorSignal: boolean;
  latestEventId: string | null;
  latestEventAt: string | null;
  latestEventIsUser: boolean;
  isRunning: boolean;
};
export type ChatApprovalFeedback = 'approved' | 'denied';
export type ChatSidebarSection = {
  key: ChatSidebarSectionKey;
  label: string;
  chats: SessionChat[];
  totalCount: number;
};
export type ChatSubmittedPayload = {
  text: string;
  chatId: string;
  agent: AgentFlavor;
  model: string;
  composerMode?: ComposerMode;
  geminiMode?: string;
  modelReasoningEffort?: ModelReasoningEffort;
  threadId?: string;
  attachments?: ChatImageAttachment[];
};
export type ChatRuntimeUiState = {
  isSubmitting: boolean;
  isAwaitingReply: boolean;
  isAborting: boolean;
  hasCompletionSignal: boolean;
  awaitingReplySince: string | null;
  showDisconnectRetry: boolean;
  lastSubmittedPayload: ChatSubmittedPayload | null;
  submitError: string | null;
};
export type WorkspaceFileOpenDetail = {
  path: string;
  name?: string;
  line?: number | null;
};
export type SidebarFileRequest = WorkspaceFileOpenDetail & {
  nonce: number;
};

export type LegacyCustomModels = Record<string, string>;
