'use client';

import React from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { dispatchWorkspaceFileOpen, extractResourceLabelsFromEvent, fileNameOnly, parseCodeChangeSummary, resolveActionPrimary, truncateSingleLine } from '../../helpers';
import type { UiEvent } from '@/lib/happy/types';
import styles from '../../../ChatInterface.module.css';
import { ResourceLabelStrip } from './ResourceChip';

function getToneClass(tone: 'emerald'): string {
  return tone === 'emerald' ? styles.toneEmerald : '';
}

function diffLineToneClass(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return styles.diffLineAdd;
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return styles.diffLineDel;
  }
  if (line.startsWith('@@ ')) {
    return styles.diffLineContext;
  }
  if (line.startsWith('diff --git ') || line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('*** ')) {
    return styles.diffLineMeta;
  }
  return styles.diffLineContext;
}

function renderDiffLineContent(
  line: string,
  hunk?: { file: string; fullPath?: string; line: number; additions: number; deletions: number },
): ReactNode {
  if (!line.startsWith('@@ ')) {
    return line.length > 0 ? line : ' ';
  }
  if (hunk) {
    const clickPath = hunk.fullPath || hunk.file;
    return (
      <>
        <button
          type="button"
          className={`${styles.fileBadgeBase} ${styles.diffHunkFileBadge} ${styles.fileBadgeButton}`}
          onClick={() => {
            if (clickPath) {
              dispatchWorkspaceFileOpen({ path: clickPath, name: hunk.file });
            }
          }}
          disabled={!clickPath}
        >
          {hunk.file || '(unknown)'}
        </button>
        {' | '}line {hunk.line} {' | '}
        <span className={styles.diffHunkPlus}>+{hunk.additions}</span>{' '}
        <span className={styles.diffHunkMinus}>-{hunk.deletions}</span>
      </>
    );
  }
  const match = line.match(/^@@\s+-(\d+(?:,\d+)?)\s+\+(\d+(?:,\d+)?)\s+@@(.*)$/);
  if (!match) {
    return line;
  }
  const [, oldRange, newRange, tail] = match;
  return (
    <>
      {'@@ '}
      <span className={styles.diffHunkMinus}>-{oldRange}</span>{' '}
      <span className={styles.diffHunkPlus}>+{newRange}</span>
      {' @@'}{tail}
    </>
  );
}

function DiffCodeBlock({
  text,
  className,
  hunks = [],
}: {
  text: string;
  className: string;
  hunks?: Array<{ file: string; line: number; additions: number; deletions: number }>;
}) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let hunkCursor = 0;
  return (
    <pre className={className}>
      {lines.map((line, index) => {
        const hunk = line.startsWith('@@ ') ? hunks[hunkCursor++] : undefined;
        return (
          <span key={`${index}-${line.length}`} className={`${styles.diffLine} ${diffLineToneClass(line)}`}>
            {renderDiffLineContent(line, hunk)}
          </span>
        );
      })}
    </pre>
  );
}

export function CodeChangesEventCard({
  event,
  expanded,
  onToggle,
}: {
  event: UiEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const summary = parseCodeChangeSummary(event);
  const compactPrimary = truncateSingleLine(resolveActionPrimary(event), 78);
  const previewText = summary.previewLines.join('\n');
  const fullPrimary = resolveActionPrimary(event).replace(/\s+/g, ' ').trim();
  const resourceLabels = extractResourceLabelsFromEvent(event);
  const hasResource = resourceLabels.length > 0;

  if (!expanded) {
    return (
      <div className={styles.codeChangesCompact}>
        <div className={styles.codeChangesCompactMain}>
          <div className={styles.actionCompactTopRow}>
            <span className={`${styles.kindChip} ${getToneClass('emerald')}`}>CHANGES</span>
            <span className={styles.actionFileLabelSeparator}>-</span>
            {hasResource ? <ResourceLabelStrip resources={resourceLabels} /> : <span className={styles.actionCompactPrimaryInline}>{compactPrimary}</span>}
          </div>
          {hasResource && (
            <div className={styles.actionPrimaryRow}>
              <span className={styles.actionCompactPrimary}>{compactPrimary}</span>
            </div>
          )}
          <div className={styles.codeChangesSummary}>
            <span>{summary.files.length} files</span>
            <span className={styles.codeChangesAdd}>+{summary.additions}</span>
            <span className={styles.codeChangesDel}>-{summary.deletions}</span>
          </div>
          {previewText && <DiffCodeBlock text={previewText} className={styles.codeChangesPreview} hunks={summary.hunks} />}
        </div>
        <button type="button" className={styles.actionExpandButton} onClick={onToggle} aria-expanded={false} aria-controls={`changes-${event.id}`} title="변경사항 펼치기">
          <ChevronRight size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.actionCard}>
      <div className={styles.actionHeader}>
        <div className={styles.actionHeaderMain}>
          <div className={styles.actionCompactTopRow}>
            <span className={`${styles.kindChip} ${getToneClass('emerald')}`}>CHANGES</span>
            <span className={styles.actionFileLabelSeparator}>-</span>
            {hasResource ? <ResourceLabelStrip resources={resourceLabels} /> : <span className={styles.actionCompactPrimaryInline}>{fullPrimary}</span>}
          </div>
          {hasResource && (
            <div className={styles.actionPrimaryRow}>
              <span className={styles.actionPrimary}>{fullPrimary}</span>
            </div>
          )}
          <div className={styles.codeChangesSummary}>
            <span>{summary.files.length} files</span>
            <span className={styles.codeChangesAdd}>+{summary.additions}</span>
            <span className={styles.codeChangesDel}>-{summary.deletions}</span>
          </div>
          {summary.files.length > 0 && (
            <div className={styles.codeChangesFiles}>
              {summary.files.slice(0, 3).map((file) => (
                <span key={file} className={`${styles.fileBadgeBase} ${styles.codeChangesFile}`}>{fileNameOnly(file)}</span>
              ))}
              {summary.files.length > 3 && <span className={`${styles.fileBadgeBase} ${styles.codeChangesFile}`}>+{summary.files.length - 3} more</span>}
            </div>
          )}
        </div>
        <button type="button" className={styles.actionExpandButton} onClick={onToggle} aria-expanded aria-controls={`changes-${event.id}`} title="변경사항 접기">
          <ChevronDown size={15} />
        </button>
      </div>
      <div id={`changes-${event.id}`} className={styles.actionResultWrap}>
        <DiffCodeBlock text={summary.fullText || '(no diff output)'} className={styles.codeChangesFull} hunks={summary.hunks} />
      </div>
    </div>
  );
}
