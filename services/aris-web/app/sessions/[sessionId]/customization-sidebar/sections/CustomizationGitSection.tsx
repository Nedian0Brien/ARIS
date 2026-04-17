import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import styles from '../../CustomizationSidebar.module.css';
import type { GitActionName, GitDiffScope, GitFileEntry, GitOverview } from '../types';

type Props = {
  activeGitFilesLength: number;
  activeGitTree: ReactNode;
  gitActionBusy: GitActionName | null;
  gitActionStatus: string | null;
  gitCommitMessage: string;
  gitDiffContent: ReactNode;
  gitErrorDetails: { title: string; detail: string; hint?: string | null } | null;
  gitListTab: GitDiffScope;
  gitLoading: boolean;
  gitOverview: GitOverview | null;
  selectedGitDiffScope: GitDiffScope;
  selectedGitFile: GitFileEntry | null;
  stagedGitFilesLength: number;
  workingGitFilesLength: number;
  onCommitMessageChange: (value: string) => void;
  onCommit: () => void;
  onFetch: () => void;
  onListTabChange: (scope: GitDiffScope) => void;
  onPull: () => void;
  onPush: () => void;
  onRetry: () => void;
  onScopeChange: (scope: GitDiffScope) => void;
  onStageToggleAll: () => void;
};

export function CustomizationGitSection({
  activeGitFilesLength,
  activeGitTree,
  gitActionBusy,
  gitActionStatus,
  gitCommitMessage,
  gitDiffContent,
  gitErrorDetails,
  gitListTab,
  gitLoading,
  gitOverview,
  selectedGitDiffScope,
  selectedGitFile,
  stagedGitFilesLength,
  workingGitFilesLength,
  onCommit,
  onCommitMessageChange,
  onFetch,
  onListTabChange,
  onPull,
  onPush,
  onRetry,
  onScopeChange,
  onStageToggleAll,
}: Props) {
  return (
    <div className={styles.content}>
      {gitLoading && !gitOverview ? (
        <div className={styles.loadingState}>
          <Loader2 size={18} className={styles.rotate} />
          <p>Git 정보를 불러오는 중입니다.</p>
        </div>
      ) : gitErrorDetails ? (
        <div className={styles.gitErrorBanner}>
          <div className={styles.gitErrorBannerHeader}>
            <AlertTriangle size={18} />
            <div className={styles.gitErrorBannerCopy}>
              <p className={styles.gitErrorBannerTitle}>{gitErrorDetails.title}</p>
              <p className={styles.gitErrorBannerDetail}>{gitErrorDetails.detail}</p>
            </div>
          </div>
          <div className={styles.gitErrorBannerFooter}>
            {gitErrorDetails.hint ? <p className={styles.gitErrorBannerHint}>{gitErrorDetails.hint}</p> : null}
            <button
              type="button"
              className={styles.gitToolbarButton}
              onClick={onRetry}
              disabled={gitLoading || gitActionBusy !== null}
            >
              다시 시도
            </button>
          </div>
        </div>
      ) : gitOverview ? (
        <div className={styles.gitWorkbench}>
          <section className={styles.gitPanel}>
            <div className={styles.gitTopbar}>
              <div className={styles.gitTopbarMeta}>
                <div className={styles.gitBranchTitleRow}>
                  <GitBranch size={14} />
                  <span className={styles.itemTitle}>{gitOverview.branch ?? 'detached HEAD'}</span>
                  <span className={styles.gitInlineMeta}>{gitOverview.upstreamBranch ?? 'upstream 없음'}</span>
                </div>
                <div className={styles.gitTopbarStats}>
                  <span>{workingGitFilesLength} changes</span>
                  <span>{stagedGitFilesLength} staged</span>
                  <span>{gitOverview.ahead} ahead</span>
                  <span>{gitOverview.behind} behind</span>
                </div>
              </div>
              <div className={styles.gitToolbar}>
                <button type="button" className={styles.gitToolbarButton} onClick={onFetch} disabled={gitActionBusy !== null} title="Fetch">
                  <RefreshCw size={13} className={gitActionBusy === 'fetch' ? styles.rotate : ''} />
                  <span>Fetch</span>
                </button>
                <button type="button" className={styles.gitToolbarButton} onClick={onPull} disabled={gitActionBusy !== null} title="Pull">
                  <ArrowDownCircle size={13} />
                  <span>Pull</span>
                </button>
                <button type="button" className={styles.gitToolbarButton} onClick={onPush} disabled={gitActionBusy !== null} title="Push">
                  <ArrowUpCircle size={13} />
                  <span>Push</span>
                </button>
              </div>
            </div>

            <div className={styles.gitCommitBox}>
              <textarea
                className={styles.gitCommitInput}
                value={gitCommitMessage}
                onChange={(event) => onCommitMessageChange(event.target.value)}
                placeholder="Message (Ctrl+Enter to commit)"
                rows={3}
              />
              <div className={styles.gitCommitFooter}>
                <div className={styles.gitTagRow}>
                  <span className={`${styles.tag} ${gitOverview.isClean ? styles.tagGood : styles.tagMuted}`}>
                    {gitOverview.isClean ? 'CLEAN' : 'DIRTY'}
                  </span>
                  {gitOverview.conflictedCount > 0 ? (
                    <span className={`${styles.tag} ${styles.tagDanger}`}>CONFLICT {gitOverview.conflictedCount}</span>
                  ) : null}
                  {gitOverview.untrackedCount > 0 ? (
                    <span className={`${styles.tag} ${styles.tagWarn}`}>UNTRACKED {gitOverview.untrackedCount}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={styles.gitPrimaryButton}
                  onClick={onCommit}
                  disabled={gitActionBusy !== null || gitOverview.stagedCount === 0 || !gitCommitMessage.trim()}
                >
                  {gitActionBusy === 'commit'
                    ? <Loader2 size={14} className={styles.rotate} />
                    : <GitCommitHorizontal size={14} />}
                  Commit
                </button>
              </div>
              {gitActionStatus ? <div className={styles.gitStatusBanner}>{gitActionStatus}</div> : null}
            </div>
          </section>

          <section className={styles.gitPanel}>
            <div className={styles.gitSectionHeader}>
              <div className={styles.gitSectionTabs}>
                <button
                  type="button"
                  className={`${styles.gitSectionTab} ${gitListTab === 'working' ? styles.gitSectionTabActive : ''}`}
                  onClick={() => onListTabChange('working')}
                >
                  <span>Changes</span>
                  <span className={styles.gitSectionTabCount}>{workingGitFilesLength}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.gitSectionTab} ${gitListTab === 'staged' ? styles.gitSectionTabActive : ''}`}
                  onClick={() => onListTabChange('staged')}
                >
                  <span>Staged Changes</span>
                  <span className={styles.gitSectionTabCount}>{stagedGitFilesLength}</span>
                </button>
              </div>
              <div className={styles.gitSectionMeta}>
                <button
                  type="button"
                  className={styles.gitLinkButton}
                  onClick={onStageToggleAll}
                  disabled={gitActionBusy !== null || activeGitFilesLength === 0}
                >
                  {gitListTab === 'working' ? 'Stage All' : 'Unstage All'}
                </button>
              </div>
            </div>
            {activeGitFilesLength === 0 ? (
              <div className={styles.gitEmptyState}>
                {gitListTab === 'working' ? 'No working tree changes.' : 'No staged changes.'}
              </div>
            ) : (
              <div className={styles.gitFileList}>{activeGitTree}</div>
            )}
          </section>

          <section className={styles.gitPanel}>
            <div className={styles.gitSectionHeader}>
              <span className={styles.gitSectionTitle}>Diff</span>
              <div className={styles.gitScopeTabs}>
                <button
                  type="button"
                  className={`${styles.gitScopeButton} ${selectedGitDiffScope === 'working' ? styles.gitScopeButtonActive : ''}`}
                  onClick={() => onScopeChange('working')}
                  disabled={!selectedGitFile || (!selectedGitFile.unstaged && !selectedGitFile.untracked)}
                >
                  Working
                </button>
                <button
                  type="button"
                  className={`${styles.gitScopeButton} ${selectedGitDiffScope === 'staged' ? styles.gitScopeButtonActive : ''}`}
                  onClick={() => onScopeChange('staged')}
                  disabled={!selectedGitFile || !selectedGitFile.staged}
                >
                  Staged
                </button>
              </div>
            </div>
            <div className={styles.gitDiffPanel}>{gitDiffContent}</div>
          </section>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <GitBranch size={18} />
          <p>표시할 Git 데이터가 없습니다.</p>
        </div>
      )}
    </div>
  );
}
