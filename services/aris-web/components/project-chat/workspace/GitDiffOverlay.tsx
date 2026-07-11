'use client';

import { Loader2, X } from 'lucide-react';
import type { WorkspaceGitDiff } from '../projectChatSurfaceUtils';

function diffLineClass(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) return ' pc-git-diff-line--add';
  if (line.startsWith('-') && !line.startsWith('---')) return ' pc-git-diff-line--del';
  if (line.startsWith('@@')) return ' pc-git-diff-line--hunk';
  return '';
}

export function GitDiffOverlay({
  diff,
  loading,
  onClose,
}: {
  diff: WorkspaceGitDiff | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="pc-file-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Git diff"
      onClick={onClose}
    >
      <div className="pc-file-preview-card pc-git-diff-card" onClick={(event) => event.stopPropagation()}>
        <div className="pc-git-diff-head">
          <strong title={diff?.path}>{diff?.path ?? 'diff'}</strong>
          {diff ? <span className="pc-git-diff-scope">{diff.scope}</span> : null}
          <button type="button" className="pc-file-preview-close" aria-label="닫기" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        {loading && !diff ? (
          <div className="pc-file-preview-state">
            <Loader2 size={16} className="pc-file-preview-spin" />
            diff를 불러오는 중…
          </div>
        ) : diff && diff.diff.trim() ? (
          <pre className="pc-git-diff-body">
            {diff.diff.split('\n').map((line, index) => (
              <div key={index} className={`pc-git-diff-line${diffLineClass(line)}`}>{line || ' '}</div>
            ))}
          </pre>
        ) : (
          <div className="pc-file-preview-state">
            표시할 diff가 없습니다. 신규(untracked) 파일은 Files 탭에서 내용을 확인하세요.
          </div>
        )}
      </div>
    </div>
  );
}
