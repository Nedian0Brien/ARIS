'use client';

import React from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';
import { stripImageAttachmentPromptPrefix } from '@/lib/chatImageAttachments';
import type { UiEvent } from '@/lib/happy/types';
import {
  extractResourceLabelsFromEvent,
  fallbackResult,
  getEventKindMeta,
  isActionKind,
  parseCodeChangeSummary,
  resolveActionPrimary,
  truncateSingleLine,
} from '../../helpers';
import styles from '../../../ChatInterface.module.css';
import { CodeChangesEventCard } from './CodeChangesEventCard';
import { DebugReply } from './DebugReply';
import { ResourceLabelStrip } from './ResourceChip';
import { TextReply } from './TextReply';

function getToneClass(tone: 'cyan' | 'sky' | 'amber' | 'emerald' | 'violet' | 'red' | 'git' | 'docker'): string {
  const map = {
    sky: styles.toneSky,
    amber: styles.toneAmber,
    cyan: styles.toneCyan,
    emerald: styles.toneEmerald,
    violet: styles.toneViolet,
    red: styles.toneRed,
    git: styles.toneGit,
    docker: styles.toneDocker,
  } as const;
  return map[tone] || '';
}

function ActionResultDetail({ event }: { event: UiEvent }) {
  const result = event.result ?? fallbackResult(event);
  if (!result?.preview) {
    return null;
  }
  const fullText = result.full ?? result.preview;
  return <pre className={styles.actionResult}>{fullText}</pre>;
}

export function ActionEventCard({
  event,
  expanded,
  onToggle,
}: {
  event: UiEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!isActionKind(event.kind)) {
    return <TextReply body={event.body || event.title} isUser={false} />;
  }

  const kindMeta = getEventKindMeta(event.kind);
  const isThoughtCard = Boolean(event.meta?.isThoughtCard);
  const KindIcon = isThoughtCard ? Brain : kindMeta.Icon;
  const label = isThoughtCard ? 'THINKING' : kindMeta.label;
  const tone = isThoughtCard ? 'cyan' : kindMeta.tone;

  const fullPrimary = resolveActionPrimary(event).replace(/\s+/g, ' ').trim();
  const rawCompactPrimary = truncateSingleLine(fullPrimary, 88);
  const thoughtBoldMatch = isThoughtCard ? /\*\*(.+?)\*\*/.exec(event.body) : null;
  const compactPrimary = thoughtBoldMatch ? thoughtBoldMatch[1] : rawCompactPrimary;
  const resourceLabels = isThoughtCard ? [] : extractResourceLabelsFromEvent(event);
  const hasResource = resourceLabels.length > 0;

  if (!expanded) {
    return (
      <div className={styles.actionCompact}>
        <div className={styles.actionCompactMain}>
          <div className={styles.actionCompactTopRow}>
            <span className={`${styles.kindChip} ${getToneClass(tone)}`}>
              <KindIcon size={12} />
              {label}
            </span>
            <span className={styles.actionFileLabelSeparator}>-</span>
            {hasResource ? (
              <ResourceLabelStrip resources={resourceLabels} />
            ) : (
              <span className={`${styles.actionCompactPrimaryInline}${isThoughtCard && thoughtBoldMatch ? ` ${styles.actionCompactPrimaryBold}` : ''}`}>{compactPrimary}</span>
            )}
          </div>
          {hasResource && (
            <div className={styles.actionPrimaryRow}>
              <span className={styles.actionCompactPrimary}>{compactPrimary}</span>
            </div>
          )}
        </div>
        <button type="button" className={styles.actionExpandButton} onClick={onToggle} aria-expanded={false} aria-controls={`result-${event.id}`} title="행동 상세 펼치기">
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
            <span className={`${styles.kindChip} ${getToneClass(tone)}`}>
              <KindIcon size={13} />
              {label}
            </span>
            <span className={styles.actionFileLabelSeparator}>-</span>
            {hasResource ? <ResourceLabelStrip resources={resourceLabels} /> : <span className={styles.actionCompactPrimaryInline}>{fullPrimary}</span>}
          </div>
          {hasResource && (
            <div className={styles.actionPrimaryRow}>
              <span className={styles.actionPrimary}>{fullPrimary}</span>
            </div>
          )}
        </div>
        <button type="button" className={styles.actionExpandButton} onClick={onToggle} aria-expanded aria-controls={`result-${event.id}`} title="행동 상세 접기">
          <ChevronDown size={15} />
        </button>
      </div>
      <div id={`result-${event.id}`} className={styles.actionResultWrap}>
        <ActionResultDetail event={event} />
      </div>
    </div>
  );
}

export function renderEventPayload(
  event: UiEvent,
  userEvent: boolean,
  expanded: boolean,
  onToggleExpand: () => void,
  debugMode: boolean,
) {
  if (userEvent) {
    return <TextReply body={stripImageAttachmentPromptPrefix(event.body || event.title)} isUser />;
  }

  if (debugMode) {
    return <DebugReply body={event.body || event.title} />;
  }

  if (isActionKind(event.kind)) {
    if (event.kind === 'file_write') {
      const summary = parseCodeChangeSummary(event);
      if (summary.hasDiffSignal) {
        return <CodeChangesEventCard event={event} expanded={expanded} onToggle={onToggleExpand} />;
      }
      return <ActionEventCard event={event} expanded={expanded} onToggle={onToggleExpand} />;
    }
    return <ActionEventCard event={event} expanded={expanded} onToggle={onToggleExpand} />;
  }

  return <TextReply body={event.body || event.title} isUser={false} />;
}
