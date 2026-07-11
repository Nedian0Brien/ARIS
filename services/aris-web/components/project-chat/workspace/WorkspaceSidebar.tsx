'use client';

import type { RefObject } from 'react';
import {
  Bot,
  ChevronRight,
  Clock,
  Copy,
  File as FileIcon,
  FileText,
  FolderOpen,
  Maximize2,
  MessageSquareText,
  PanelRight,
  PanelsTopLeft,
  RefreshCcw,
  Square,
  Terminal,
  X,
} from 'lucide-react';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { SubagentPanel } from '@/components/project-chat/SubagentPanel';
import { MarkdownContent } from '@/components/chat/MarkdownContent';
import { GitActionMark } from '@/components/project-chat/helpers/actionMarks';
import type { SessionChat, SessionSummary } from '@/lib/happy/types';
import type { WorkspaceFileItem, WorkspaceFilesApi } from '@/lib/hooks/useWorkspaceFiles';
import type { WorkspaceTerminalApi } from './hooks/useTerminalRunner';
import type { SavedTerminalSnippetsApi } from './hooks/useSavedTerminalSnippets';
import {
  COMPOSER_MODE_COPY,
  agentAvatarClass,
  agentLabel,
  formatRelativeTime,
  matchWorkspaceFileBadge,
  projectStatusLabel,
  providerFromAgent,
  type ComposerMode,
  type ExpandedTurnState,
  type ModelProvider,
  type PreviewState,
  type ProjectPanelGitFile,
  type ProjectPanelGitOverview,
  type ProjectWorkspacePanelRuntime,
  type WorkspaceTab,
} from '../projectChatSurfaceUtils';

export type WorkspaceRunStepItem = {
  id: string;
  title: string;
  cmd: string;
  time: string;
  running: boolean;
};
export type WorkspaceHistoryTurnItem = {
  id: string;
  timestamp: string;
  state: string;
  text: string;
  agentText: string;
};
export type WorkspaceTerminalSnippet = { id: string; name: string; cmd: string; tag: string };

type WorkspaceSidebarCommonProps = {
  workspaceRef: RefObject<HTMLElement | null>;
  projectName: string;
  workspaceTab: WorkspaceTab;
  activateWorkspaceTab: (tab: WorkspaceTab) => void;
  closeWorkspacePanel: () => void;
  workspaceFiles: WorkspaceFilesApi;
  selectedWorkspaceFile: string;
  openWorkspaceFilePreview: (file: WorkspaceFileItem) => void;
  workspaceGitOverview: ProjectPanelGitOverview | null;
  workspaceGitLoading: boolean;
  workspaceGitError: string | null;
  refreshWorkspaceGit: () => void;
  activeWorkspacePanelRuntime: ProjectWorkspacePanelRuntime | null;
  draftTerminalCommand: string;
  setDraftTerminalCommand: (value: string) => void;
  terminal: WorkspaceTerminalApi;
  onOpenGitDiff: (file: ProjectPanelGitFile) => void;
  handleCopy: (value: string, label: string) => void;
  session: SessionSummary;
  activeChat: SessionChat | null;
  projectPath: string;
};

type PanelWorkspaceSidebarProps = WorkspaceSidebarCommonProps & {
  variant: 'panel';
  activeWorkspaceChat: SessionChat | null;
  activeWorkspacePanelId: string | null;
  projectId: string;
};

type ProjectWorkspaceSidebarProps = WorkspaceSidebarCommonProps & {
  variant: 'project';
  setPreviewState: (state: PreviewState) => void;
  selectedProvider: ModelProvider;
  activeModelLabel: string;
  projectRunActive: boolean;
  handleStopActiveChat: () => Promise<void>;
  runDurationLabel: string | null;
  selectedChatTimestamp: string;
  runStepItems: WorkspaceRunStepItem[];
  historyTurnItems: WorkspaceHistoryTurnItem[];
  visibleExpandedTurnId: string | null;
  setExpandedTurnId: (value: ExpandedTurnState) => void;
  handleJumpToEvent: (eventId: string) => void;
  activeAgent: SessionSummary['agent'];
  composerMode: ComposerMode;
  terminalSnippets: WorkspaceTerminalSnippet[];
  savedSnippets: SavedTerminalSnippetsApi;
};

export type WorkspaceSidebarProps = PanelWorkspaceSidebarProps | ProjectWorkspaceSidebarProps;

function WorkspaceTabsRow({
  workspaceTab,
  activateWorkspaceTab,
}: Pick<WorkspaceSidebarCommonProps, 'workspaceTab' | 'activateWorkspaceTab'>) {
  return (
    <div className="ws__tabs" role="tablist">
      <button type="button" className="ws__tab" data-tab="run" aria-pressed={workspaceTab === 'run'} onClick={() => activateWorkspaceTab('run')}><Clock size={12} />Run</button>
      <button type="button" className="ws__tab" data-tab="files" aria-pressed={workspaceTab === 'files'} onClick={() => activateWorkspaceTab('files')}><FileIcon size={12} />Files</button>
      <button type="button" className="ws__tab" data-tab="git" aria-pressed={workspaceTab === 'git'} onClick={() => activateWorkspaceTab('git')}><GitActionMark size={12} />Git</button>
      <button type="button" className="ws__tab" data-tab="terminal" aria-pressed={workspaceTab === 'terminal'} onClick={() => activateWorkspaceTab('terminal')}><Terminal size={12} />Terminal</button>
      <button type="button" className="ws__tab" data-tab="context" aria-pressed={workspaceTab === 'context'} onClick={() => activateWorkspaceTab('context')}><PanelsTopLeft size={12} />Context</button>
      <button type="button" className="ws__tab" data-tab="subagents" aria-pressed={workspaceTab === 'subagents'} onClick={() => activateWorkspaceTab('subagents')}><Bot size={12} />Subagents</button>
    </div>
  );
}

function WorkspaceFilesPane({
  workspaceTab,
  workspaceFiles,
  selectedWorkspaceFile,
  openWorkspaceFilePreview,
  workspaceGitOverview,
}: Pick<
  WorkspaceSidebarCommonProps,
  'workspaceTab' | 'workspaceFiles' | 'selectedWorkspaceFile' | 'openWorkspaceFilePreview' | 'workspaceGitOverview'
>) {
  return (
    <div className={`ws__pane${workspaceTab === 'files' ? ' ws__pane--active' : ''}`} data-pane="files">
      <div className="file-tree__head">
        <span className="file-tree__cwd" title={workspaceFiles.currentPath}>{workspaceFiles.currentPath}</span>
        <button
          type="button"
          className="file-tree__refresh"
          aria-label="Refresh files"
          onClick={() => workspaceFiles.refresh()}
          disabled={workspaceFiles.loading}
        >
          <RefreshCcw size={11} />
        </button>
      </div>
      <div className="file-tree">
        {workspaceFiles.parentPath && (
          <button
            type="button"
            className="file-row file-row--parent"
            onClick={() => workspaceFiles.goUp()}
          >
            <span className="file-row__icon file-row__icon--dir">
              <FolderOpen size={13} />
            </span>
            <span className="file-row__name">..</span>
            <span className="file-row__meta">parent</span>
          </button>
        )}
        {workspaceFiles.loading && workspaceFiles.items.length === 0 && (
          <div className="file-row file-row--state">Loading…</div>
        )}
        {workspaceFiles.error && (
          <div className="file-row file-row--state file-row--error">{workspaceFiles.error}</div>
        )}
        {!workspaceFiles.loading && !workspaceFiles.error && workspaceFiles.items.length === 0 && (
          <div className="file-row file-row--state">빈 디렉터리</div>
        )}
        {workspaceFiles.items.map((file: WorkspaceFileItem) => {
          const badge = workspaceGitOverview
            ? matchWorkspaceFileBadge(workspaceGitOverview.files, file.path, file.isDirectory)
            : null;
          return (
            <button
              key={file.path}
              type="button"
              className={`file-row${selectedWorkspaceFile === file.path ? ' file-row--selected' : ''}`}
              onClick={() => {
                if (file.isDirectory) {
                  workspaceFiles.cdInto(file);
                } else {
                  openWorkspaceFilePreview(file);
                }
              }}
            >
              <span className={`file-row__icon${file.isDirectory ? ' file-row__icon--dir' : ''}`}>
                {file.isDirectory ? <FolderOpen size={13} /> : <FileText size={13} />}
              </span>
              <span className="file-row__name">{file.name}</span>
              {badge && <span className="file-row__badge" data-tone={badge.tone}>{badge.label}</span>}
              <span className="file-row__meta">{file.isDirectory ? 'dir' : 'file'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceGitPane({
  workspaceTab,
  workspaceGitOverview,
  workspaceGitLoading,
  workspaceGitError,
  refreshWorkspaceGit,
  activeWorkspacePanelRuntime,
  cwdFallback,
  branchFallback,
  onOpenGitDiff,
}: Pick<
  WorkspaceSidebarCommonProps,
  | 'workspaceTab'
  | 'workspaceGitOverview'
  | 'workspaceGitLoading'
  | 'workspaceGitError'
  | 'refreshWorkspaceGit'
  | 'activeWorkspacePanelRuntime'
> & {
  cwdFallback: string;
  branchFallback: string;
  onOpenGitDiff: (file: ProjectPanelGitFile) => void;
}) {
  return (
    <div className={`ws__pane${workspaceTab === 'git' ? ' ws__pane--active' : ''}`} data-pane="git">
      <div className="file-tree__head">
        <span className="file-tree__cwd" title={workspaceGitOverview?.workspacePath ?? activeWorkspacePanelRuntime?.worktreePath ?? cwdFallback}>
          {workspaceGitOverview?.branch ?? activeWorkspacePanelRuntime?.branch ?? branchFallback}
        </span>
        <button
          type="button"
          className="file-tree__refresh"
          aria-label="Refresh Git"
          onClick={refreshWorkspaceGit}
          disabled={workspaceGitLoading}
        >
          <RefreshCcw size={11} />
        </button>
      </div>
      <div className="pc-panel-git-summary">
        <span data-tone={workspaceGitOverview?.isClean ? 'ready' : 'pending'}>{workspaceGitOverview?.isClean ? 'clean' : 'dirty'}</span>
        <span>staged {workspaceGitOverview?.stagedCount ?? 0}</span>
        <span>changed {workspaceGitOverview?.unstagedCount ?? 0}</span>
        <span>untracked {workspaceGitOverview?.untrackedCount ?? 0}</span>
        <span>ahead {workspaceGitOverview?.ahead ?? 0} / behind {workspaceGitOverview?.behind ?? 0}</span>
      </div>
      <div className="file-tree">
        {workspaceGitLoading && <div className="file-row file-row--state">Loading Git status…</div>}
        {workspaceGitError && <div className="file-row file-row--state file-row--error">{workspaceGitError}</div>}
        {!workspaceGitLoading && !workspaceGitError && workspaceGitOverview?.files.length === 0 && (
          <div className="file-row file-row--state">변경된 파일이 없습니다.</div>
        )}
        {workspaceGitOverview?.files.slice(0, 60).map((file) => (
          <button
            key={`${file.path}:${file.indexStatus}:${file.workTreeStatus}`}
            type="button"
            className="pc-panel-git-file pc-panel-git-file--action"
            title={`${file.path} diff 보기`}
            onClick={() => onOpenGitDiff(file)}
          >
            <span>{file.indexStatus}{file.workTreeStatus}</span>
            <strong title={file.path}>{file.path}</strong>
            <em>{file.conflicted ? 'conflict' : file.untracked ? 'new' : file.staged ? 'staged' : 'modified'}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspaceTerminalConsole({
  terminal,
  draftTerminalCommand,
  setDraftTerminalCommand,
  disabled,
  tag,
  contextLine,
}: Pick<WorkspaceSidebarCommonProps, 'terminal' | 'draftTerminalCommand' | 'setDraftTerminalCommand'> & {
  disabled: boolean;
  tag: string;
  contextLine: string | null;
}) {
  return (
    <div className="term">
      <div className="term__head">
        <div className="term__head-left">
          <span className="term__dots"><span className="term__dot term__dot--r" /><span className="term__dot term__dot--y" /><span className="term__dot term__dot--g" /></span>
          <span className="term__tag">{tag}</span>
        </div>
        <button
          type="button"
          className="term__clear"
          onClick={terminal.clear}
          disabled={terminal.entries.length === 0}
        >
          Clear
        </button>
      </div>
      <div className="term__body">
        {contextLine ? <div className="term__line"><span className="term__dim">{contextLine}</span></div> : null}
        {terminal.entries.length === 0 ? (
          <div className="term__line"><span className="term__dim">명령을 입력하면 워크스페이스에서 실행됩니다 (30초 제한 · 출력 12k 잘림 · 결과는 타임라인에 기록).</span></div>
        ) : null}
        {terminal.entries.map((entry) => (
          <div key={entry.id} className="term__entry">
            <div className="term__line"><span className="term__prompt">$</span><span>{entry.command}</span></div>
            {entry.output ? <pre className="term__output">{entry.output}</pre> : null}
            {entry.running ? (
              <div className="term__line"><span className="term__dim">실행 중…</span></div>
            ) : entry.error ? (
              <div className="term__line"><span className="term__err">✗</span><span className="term__dim">{entry.error}</span></div>
            ) : (
              <div className="term__line">
                {entry.exitCode === 0 ? <span className="term__ok">✓</span> : <span className="term__err">✗</span>}
                <span className="term__dim">exit {entry.exitCode ?? '?'}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        className="term__input-row"
        onSubmit={(event) => {
          event.preventDefault();
          const command = draftTerminalCommand.trim();
          if (!command || terminal.running || disabled) return;
          terminal.run(command);
          setDraftTerminalCommand('');
        }}
      >
        <span className="term__prompt">$</span>
        <input
          className="term__input"
          value={draftTerminalCommand}
          onChange={(event) => setDraftTerminalCommand(event.target.value)}
          placeholder={disabled ? '채팅을 선택하면 실행할 수 있습니다' : '명령 입력 후 Enter'}
          disabled={disabled || terminal.running}
          aria-label="터미널 명령"
        />
      </form>
    </div>
  );
}

function WorkspaceSubagentsPane({
  workspaceTab,
  session,
  activeChat,
}: Pick<WorkspaceSidebarCommonProps, 'workspaceTab' | 'session' | 'activeChat'>) {
  return (
    <div className={`ws__pane${workspaceTab === 'subagents' ? ' ws__pane--active' : ''}`} data-pane="subagents">
      <SubagentPanel sessionId={session.id} chatId={activeChat?.id ?? null} active={workspaceTab === 'subagents'} />
    </div>
  );
}

function PanelWorkspaceSidebar({
  workspaceRef,
  projectName,
  workspaceTab,
  activateWorkspaceTab,
  closeWorkspacePanel,
  workspaceFiles,
  selectedWorkspaceFile,
  openWorkspaceFilePreview,
  workspaceGitOverview,
  workspaceGitLoading,
  workspaceGitError,
  refreshWorkspaceGit,
  activeWorkspacePanelRuntime,
  draftTerminalCommand,
  setDraftTerminalCommand,
  terminal,
  onOpenGitDiff,
  handleCopy,
  session,
  activeChat,
  projectPath,
  activeWorkspaceChat,
  activeWorkspacePanelId,
  projectId,
}: PanelWorkspaceSidebarProps) {
  return (
    <aside ref={workspaceRef} className="shell__workspace ws ws-pane pc-parallel-workspace" aria-label={`${projectName} workspace`}>
      <div className="ws__head ws-pane__header">
        <div className="ws__title ws-pane__title"><PanelRight size={14} />Workspace</div>
        <div className="ws__actions ws-pane__actions">
          <button type="button" className="ws__action ws-pane__action btn btn--ghost btn--icon btn--sm" aria-label="Open files" onClick={() => activateWorkspaceTab('files')}>
            <FileText size={13} />
          </button>
          <button type="button" className="ws__action ws-pane__action btn btn--ghost btn--icon btn--sm" aria-label="Close workspace" onClick={closeWorkspacePanel}>
            <X size={13} />
          </button>
        </div>
      </div>
      <WorkspaceTabsRow workspaceTab={workspaceTab} activateWorkspaceTab={activateWorkspaceTab} />
      <div className="ws__status">
        <div className="ws__status-left">
          <span className={`ws__model ws__model--${providerFromAgent(activeWorkspaceChat?.agent ?? session.agent)}`}>
            <span className="ws__model-dot" />{activeWorkspaceChat?.title ?? 'Panel'}
          </span>
          <span className="ws__pill"><span className="ws__pill-dot" />{activeWorkspacePanelRuntime?.branch ?? 'project'}</span>
        </div>
        <div className="ws__status-right">
          <span>{activeWorkspacePanelId ? `#${activeWorkspacePanelId.slice(-4)}` : 'no panel'}</span>
        </div>
      </div>
      <div className="ws__body">
        <div className={`ws__pane${workspaceTab === 'run' ? ' ws__pane--active' : ''}`} data-pane="run">
          <div className="run-summary">
            <div className="run-summary__cell"><span className="run-summary__label">Panel</span><span className="run-summary__value">{activeWorkspacePanelId ? activeWorkspacePanelId.slice(-4) : '-'}</span></div>
            <div className="run-summary__cell"><span className="run-summary__label">Branch</span><span className="run-summary__value">{activeWorkspacePanelRuntime?.branch ?? '-'}</span></div>
            <div className="run-summary__cell"><span className="run-summary__label">Runtime</span><span className="run-summary__value">{activeWorkspacePanelRuntime?.runtimeSessionId ? 'ready' : 'project'}</span></div>
          </div>
          <div className="ws-card ws-card--run">
            <div className="ws-card__head">
              <div className="ws-card__title">{activeWorkspaceChat?.title ?? '선택된 패널이 없습니다.'}</div>
              <div className="ws-card__meta">{activeWorkspacePanelRuntime?.worktreePath ?? projectPath}</div>
            </div>
            <div className="ws-empty-state">선택된 패널의 worktree 기준 상태입니다.</div>
          </div>
        </div>
        <WorkspaceFilesPane
          workspaceTab={workspaceTab}
          workspaceFiles={workspaceFiles}
          selectedWorkspaceFile={selectedWorkspaceFile}
          openWorkspaceFilePreview={openWorkspaceFilePreview}
          workspaceGitOverview={workspaceGitOverview}
        />
        <WorkspaceGitPane
          workspaceTab={workspaceTab}
          workspaceGitOverview={workspaceGitOverview}
          workspaceGitLoading={workspaceGitLoading}
          workspaceGitError={workspaceGitError}
          refreshWorkspaceGit={refreshWorkspaceGit}
          activeWorkspacePanelRuntime={activeWorkspacePanelRuntime}
          cwdFallback=""
          branchFallback="branch pending"
          onOpenGitDiff={onOpenGitDiff}
        />
        <div className={`ws__pane${workspaceTab === 'terminal' ? ' ws__pane--active' : ''}`} data-pane="terminal">
          <WorkspaceTerminalConsole
            terminal={terminal}
            draftTerminalCommand={draftTerminalCommand}
            setDraftTerminalCommand={setDraftTerminalCommand}
            disabled={!activeWorkspaceChat}
            tag="bash · selected panel"
            contextLine={`cwd · ${activeWorkspacePanelRuntime?.worktreePath ?? projectPath}`}
          />
        </div>
        <div className={`ws__pane${workspaceTab === 'context' ? ' ws__pane--active' : ''}`} data-pane="context">
          <div className="ctx-group">
            <div className="ctx-group__head"><span className="ctx-group__title">Panel context</span></div>
            <div className="ws-empty-state">토큰 사용량 실측 수집을 준비 중입니다. 수집이 연결되면 이 자리에 패널 컨텍스트 사용량이 표시됩니다.</div>
          </div>
        </div>
        <WorkspaceSubagentsPane workspaceTab={workspaceTab} session={session} activeChat={activeChat} />
      </div>
    </aside>
  );
}

function ProjectWorkspaceSidebar({
  workspaceRef,
  projectName,
  workspaceTab,
  activateWorkspaceTab,
  closeWorkspacePanel,
  workspaceFiles,
  selectedWorkspaceFile,
  openWorkspaceFilePreview,
  workspaceGitOverview,
  workspaceGitLoading,
  workspaceGitError,
  refreshWorkspaceGit,
  activeWorkspacePanelRuntime,
  draftTerminalCommand,
  setDraftTerminalCommand,
  terminal,
  onOpenGitDiff,
  handleCopy,
  session,
  activeChat,
  projectPath,
  setPreviewState,
  selectedProvider,
  activeModelLabel,
  projectRunActive,
  handleStopActiveChat,
  runDurationLabel,
  selectedChatTimestamp,
  runStepItems,
  historyTurnItems,
  visibleExpandedTurnId,
  setExpandedTurnId,
  handleJumpToEvent,
  activeAgent,
  composerMode,
  terminalSnippets,
  savedSnippets,
}: ProjectWorkspaceSidebarProps) {
  return (
    <aside ref={workspaceRef} className="shell__workspace ws ws-pane" aria-label={`${projectName} workspace`}>
      <div className="ws__head ws-pane__header">
        <div className="ws__title ws-pane__title"><PanelRight size={14} />Workspace</div>
        <div className="ws__actions ws-pane__actions">
          <button type="button" className="ws__action ws-pane__action btn btn--ghost btn--icon btn--sm" aria-label="Open preview" onClick={() => setPreviewState('open')}>
            <Maximize2 size={13} />
          </button>
          <button type="button" className="ws__action ws-pane__action btn btn--ghost btn--icon btn--sm" aria-label="Open files" onClick={() => activateWorkspaceTab('files')}>
            <FileText size={13} />
          </button>
          <button type="button" className="ws__action ws-pane__action btn btn--ghost btn--icon btn--sm" aria-label="Close workspace" onClick={closeWorkspacePanel}>
            <X size={13} />
          </button>
        </div>
      </div>
      <WorkspaceTabsRow workspaceTab={workspaceTab} activateWorkspaceTab={activateWorkspaceTab} />
      <div className="ws__status">
        <div className="ws__status-left">
          <span className={`ws__model ws__model--${selectedProvider}`}><span className="ws__model-dot" />{activeModelLabel}</span>
          <span className="ws__pill"><span className="ws__pill-dot" />{projectStatusLabel(session.status)}</span>
        </div>
        <div className="ws__status-right">
          <button
            type="button"
            className="ws__stop"
            aria-label="Stop"
            disabled={!projectRunActive}
            onClick={() => { void handleStopActiveChat(); }}
          >
            <Square size={10} />
          </button>
        </div>
      </div>
      <div className="ws__body">
        <div className={`ws__pane${workspaceTab === 'run' ? ' ws__pane--active' : ''}`} data-pane="run">
          <div className="run-summary">
            <div className="run-summary__cell"><span className="run-summary__label">Steps</span><span className="run-summary__value">{runStepItems.length}</span></div>
            <div className="run-summary__cell"><span className="run-summary__label">Duration</span><span className="run-summary__value">{runDurationLabel ?? '—'}</span></div>
            <div className="run-summary__cell"><span className="run-summary__label">Activity</span><span className="run-summary__value">{formatRelativeTime(selectedChatTimestamp)}</span></div>
          </div>
          <div className="ws-card ws-card--run">
            <div className="ws-card__head">
              <div className="ws-card__title">Run · {activeChat?.id ? `#${activeChat.id.slice(-4)}` : '—'}</div>
              <div className="ws-card__meta">{formatRelativeTime(selectedChatTimestamp)}</div>
            </div>
            <div className="run-steps">
              {runStepItems.length > 0 ? (
                runStepItems.map((item) => (
                  <button key={item.id} type="button" className="run-step ws-run-step" title="타임라인에서 보기" onClick={() => handleJumpToEvent(item.id)}>
                    <span className={`run-step__dot ws-run-step__dot ${item.running ? 'run-step__dot--running ws-run-step__dot--running' : 'run-step__dot--done ws-run-step__dot--done'}`} />
                    <div className="run-step__body ws-run-step__body">
                      <div className="run-step__title ws-run-step__title">{item.title}</div>
                      <div className="run-step__cmd ws-run-step__time">{item.cmd}</div>
                    </div>
                    <span className="run-step__time ws-run-step__time">{item.time}</span>
                  </button>
                ))
              ) : (
                <div className="ws-empty-state">실행 기록이 없습니다.</div>
              )}
            </div>
          </div>
          <div className="chist ws-card ws-card--history">
            <div className="chist__head">
              <span className="chist__title"><MessageSquareText size={12} />Chat history</span>
              <span className="chist__meta">{historyTurnItems.length} turns</span>
            </div>
            <div className="chist__list">
              {historyTurnItems.length > 0 ? (
                historyTurnItems.map((item) => (
                  <div key={item.id} className="chturn" data-open={visibleExpandedTurnId === item.id ? 'true' : 'false'}>
                    <button
                      type="button"
                      className="chturn__preview"
                      data-turn-toggle
                      onClick={() => setExpandedTurnId(visibleExpandedTurnId === item.id ? '__none__' : item.id)}
                    >
                      <span className="chturn__avatar">U</span>
                      <span className="chturn__body">
                        <span className="chturn__meta">
                          <span className="chturn__name">You</span>
                          <span className="chturn__time">{formatRelativeTime(item.timestamp)}</span>
                          <span className={`chturn__pill ${item.state === 'running' ? 'chturn__pill--run' : 'chturn__pill--ok'}`}>
                            <span className="chturn__pill-dot" />{item.state}
                          </span>
                        </span>
                        <span className="chturn__text">{item.text}</span>
                      </span>
                      <ChevronRight size={12} className="chturn__caret" />
                    </button>
                    <div className="chturn__expanded">
                      <div className="chturn__agent-head">
                        <span className={`chturn__agent-avatar ${agentAvatarClass(activeAgent)}`}>
                          <ProviderLogo provider={selectedProvider} />
                        </span>
                        <span className="chturn__agent-label"><strong>{agentLabel(activeAgent, activeModelLabel)}</strong></span>
                        <span className="chturn__agent-final">{item.state === 'running' ? 'In progress' : 'Final'}</span>
                      </div>
                      <div className="chturn__agent-text"><MarkdownContent body={item.agentText} /></div>
                      <div className="chturn__actions">
                        <button type="button" className="chturn__btn" onClick={() => handleJumpToEvent(item.id)}><ChevronRight size={11} />Jump</button>
                        <button type="button" className="chturn__btn" onClick={() => handleCopy(`${item.text}\n\n${item.agentText}`, 'Turn summary')}><Copy size={11} />Copy</button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="ws-empty-state">대화 기록이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
        <WorkspaceFilesPane
          workspaceTab={workspaceTab}
          workspaceFiles={workspaceFiles}
          selectedWorkspaceFile={selectedWorkspaceFile}
          openWorkspaceFilePreview={openWorkspaceFilePreview}
          workspaceGitOverview={workspaceGitOverview}
        />
        <WorkspaceGitPane
          workspaceTab={workspaceTab}
          workspaceGitOverview={workspaceGitOverview}
          workspaceGitLoading={workspaceGitLoading}
          workspaceGitError={workspaceGitError}
          refreshWorkspaceGit={refreshWorkspaceGit}
          activeWorkspacePanelRuntime={activeWorkspacePanelRuntime}
          cwdFallback={projectPath}
          branchFallback="project branch"
          onOpenGitDiff={onOpenGitDiff}
        />
        <div className={`ws__pane${workspaceTab === 'terminal' ? ' ws__pane--active' : ''}`} data-pane="terminal">
          <WorkspaceTerminalConsole
            terminal={terminal}
            draftTerminalCommand={draftTerminalCommand}
            setDraftTerminalCommand={setDraftTerminalCommand}
            disabled={!activeChat}
            tag="bash · project chat"
            contextLine={null}
          />
          <div className="snip-group">
            <div className="snip-group__head">
              <span className="snip-group__label"><Terminal size={12} />Snippets</span>
              <button
                type="button"
                className="snip-group__save"
                onClick={() => savedSnippets.save(draftTerminalCommand)}
                disabled={!draftTerminalCommand.trim()}
              >
                현재 명령 저장
              </button>
            </div>
            {terminalSnippets.map((snippet) => (
              <button
                key={snippet.id}
                type="button"
                className="snip-row"
                onClick={() => setDraftTerminalCommand(snippet.cmd)}
              >
                <span className="snip-row__name">{snippet.name}</span>
                <span className="snip-row__cmd">{snippet.cmd}</span>
                <span className="snip-row__tag">{snippet.tag}</span>
              </button>
            ))}
            {savedSnippets.snippets.map((snippet) => (
              <div key={snippet.id} className="snip-row snip-row--saved">
                <button
                  type="button"
                  className="snip-row__insert"
                  onClick={() => setDraftTerminalCommand(snippet.cmd)}
                >
                  <span className="snip-row__name">saved</span>
                  <span className="snip-row__cmd">{snippet.cmd}</span>
                </button>
                <button
                  type="button"
                  className="snip-row__remove"
                  aria-label="스니펫 삭제"
                  onClick={() => savedSnippets.remove(snippet.id)}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className={`ws__pane${workspaceTab === 'context' ? ' ws__pane--active' : ''}`} data-pane="context">
          <div className="ctx-summary">
            <div className="ctx-summary__body">
              <div className="ctx-summary__title">Context</div>
              <div className="ctx-summary__split">
                <div className="ctx-summary__split-cell"><div className="ctx-summary__split-label">Model</div><div className="ctx-summary__split-value">{activeModelLabel}</div></div>
                <div className="ctx-summary__split-cell"><div className="ctx-summary__split-label">Mode</div><div className="ctx-summary__split-value">{COMPOSER_MODE_COPY[composerMode]}</div></div>
              </div>
            </div>
          </div>
          <div className="ctx-group">
            <div className="ctx-group__head"><span className="ctx-group__title">Context usage</span></div>
            <div className="ws-empty-state">토큰 사용량 실측 수집을 준비 중입니다. 수집이 연결되면 이 자리에 컨텍스트 사용량이 표시됩니다.</div>
          </div>
        </div>
        <WorkspaceSubagentsPane workspaceTab={workspaceTab} session={session} activeChat={activeChat} />
      </div>
      <div className="ws__footer">
        <div className="ws__footer-meta">
          <span>project scoped</span>
          <span>{workspaceGitOverview ? `${workspaceGitOverview.trackedFileCount} files` : '— files'}</span>
        </div>
      </div>
    </aside>
  );
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  if (props.variant === 'panel') {
    return <PanelWorkspaceSidebar {...props} />;
  }
  return <ProjectWorkspaceSidebar {...props} />;
}
