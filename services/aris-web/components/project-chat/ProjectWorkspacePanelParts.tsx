'use client';

import type { ReactNode } from 'react';
import { Bot, Clock, File as FileIcon, FileText, FolderOpen, PanelsTopLeft, RefreshCcw, Terminal } from 'lucide-react';
import { SubagentPanel } from '@/components/project-chat/SubagentPanel';
import { GitActionMark } from '@/components/project-chat/helpers/actionMarks';
import type { WorkspaceFileItem } from '@/lib/hooks/useWorkspaceFiles';
import type {
  ProjectPanelGitOverview,
  ProjectWorkspacePanelRuntime,
  WorkspaceTab,
} from './projectChatSurfaceUtils';

type WorkspaceFilesController = {
  currentPath: string;
  parentPath: string | null;
  items: WorkspaceFileItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  goUp: () => void;
  cdInto: (item: WorkspaceFileItem) => void;
};

type WorkspaceTabIcon = (props: { size?: number }) => ReactNode;

const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string; Icon: WorkspaceTabIcon }> = [
  { id: 'run', label: 'Run', Icon: Clock },
  { id: 'files', label: 'Files', Icon: FileIcon },
  { id: 'git', label: 'Git', Icon: GitActionMark },
  { id: 'terminal', label: 'Terminal', Icon: Terminal },
  { id: 'context', label: 'Context', Icon: PanelsTopLeft },
  { id: 'subagents', label: 'Subagents', Icon: Bot },
];

export function ProjectWorkspaceTabs({
  activeTab,
  onActivate,
}: {
  activeTab: WorkspaceTab;
  onActivate: (tab: WorkspaceTab) => void;
}) {
  return (
    <div className="ws__tabs" role="tablist">
      {WORKSPACE_TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className="ws__tab"
          data-tab={id}
          aria-pressed={activeTab === id}
          onClick={() => onActivate(id)}
        >
          <Icon size={12} />
          {label}
        </button>
      ))}
    </div>
  );
}

export function ProjectWorkspaceFilesPane({
  active,
  files,
  selectedFile,
  onOpenFile,
}: {
  active: boolean;
  files: WorkspaceFilesController;
  selectedFile: string;
  onOpenFile: (file: WorkspaceFileItem) => void;
}) {
  return (
    <div className={`ws__pane${active ? ' ws__pane--active' : ''}`} data-pane="files">
      <div className="file-tree__head">
        <span className="file-tree__cwd" title={files.currentPath}>{files.currentPath}</span>
        <button type="button" className="file-tree__refresh" aria-label="Refresh files" onClick={() => files.refresh()} disabled={files.loading}>
          <RefreshCcw size={11} />
        </button>
      </div>
      <div className="file-tree">
        {files.parentPath && (
          <button type="button" className="file-row file-row--parent" onClick={() => files.goUp()}>
            <span className="file-row__icon file-row__icon--dir"><FolderOpen size={13} /></span>
            <span className="file-row__name">..</span>
            <span className="file-row__meta">parent</span>
          </button>
        )}
        {files.loading && files.items.length === 0 && <div className="file-row file-row--state">Loading…</div>}
        {files.error && <div className="file-row file-row--state file-row--error">{files.error}</div>}
        {!files.loading && !files.error && files.items.length === 0 && <div className="file-row file-row--state">빈 디렉터리</div>}
        {files.items.map((file) => (
          <button
            key={file.path}
            type="button"
            className={`file-row${selectedFile === file.path ? ' file-row--selected' : ''}`}
            onClick={() => {
              if (file.isDirectory) {
                files.cdInto(file);
              } else {
                onOpenFile(file);
              }
            }}
          >
            <span className={`file-row__icon${file.isDirectory ? ' file-row__icon--dir' : ''}`}>
              {file.isDirectory ? <FolderOpen size={13} /> : <FileText size={13} />}
            </span>
            <span className="file-row__name">{file.name}</span>
            <span className="file-row__meta">{file.isDirectory ? 'dir' : 'file'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProjectWorkspaceGitPane({
  active,
  branchFallback,
  overview,
  loading,
  error,
  onRefresh,
  titlePath,
}: {
  active: boolean;
  branchFallback: string;
  overview: ProjectPanelGitOverview | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  titlePath: string;
}) {
  return (
    <div className={`ws__pane${active ? ' ws__pane--active' : ''}`} data-pane="git">
      <div className="file-tree__head">
        <span className="file-tree__cwd" title={overview?.workspacePath ?? titlePath}>
          {overview?.branch ?? branchFallback}
        </span>
        <button type="button" className="file-tree__refresh" aria-label="Refresh Git" onClick={onRefresh} disabled={loading}>
          <RefreshCcw size={11} />
        </button>
      </div>
      <div className="pc-panel-git-summary">
        <span data-tone={overview?.isClean ? 'ready' : 'pending'}>{overview?.isClean ? 'clean' : 'dirty'}</span>
        <span>staged {overview?.stagedCount ?? 0}</span>
        <span>changed {overview?.unstagedCount ?? 0}</span>
        <span>untracked {overview?.untrackedCount ?? 0}</span>
        <span>ahead {overview?.ahead ?? 0} / behind {overview?.behind ?? 0}</span>
      </div>
      <div className="file-tree">
        {loading && <div className="file-row file-row--state">Loading Git status…</div>}
        {error && <div className="file-row file-row--state file-row--error">{error}</div>}
        {!loading && !error && overview?.files.length === 0 && (
          <div className="file-row file-row--state">변경된 파일이 없습니다.</div>
        )}
        {overview?.files.slice(0, 60).map((file) => (
          <div key={`${file.path}:${file.indexStatus}:${file.workTreeStatus}`} className="pc-panel-git-file">
            <span>{file.indexStatus}{file.workTreeStatus}</span>
            <strong title={file.path}>{file.path}</strong>
            <em>{file.conflicted ? 'conflict' : file.untracked ? 'new' : file.staged ? 'staged' : 'modified'}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectWorkspaceSubagentsPane({
  active,
  sessionId,
  chatId,
}: {
  active: boolean;
  sessionId: string;
  chatId: string | null;
}) {
  return (
    <div className={`ws__pane${active ? ' ws__pane--active' : ''}`} data-pane="subagents">
      <SubagentPanel sessionId={sessionId} chatId={chatId} active={active} />
    </div>
  );
}

export function resolveWorkspaceGitTitlePath(
  runtime: ProjectWorkspacePanelRuntime | null,
  fallbackPath: string,
) {
  return runtime?.worktreePath ?? fallbackPath;
}
