'use client';
import React, { useState } from 'react';
import type { UiEvent } from '@/lib/happy/types';
import { parseAgentCommand, parseShellCommand } from '@/lib/cmd/parseCommand';
import { eventCommand, projectActionPreview } from '@/components/project-chat/helpers/projectChatEvents';
import { CmdBadge } from './CmdBadge';
import { CmdTokens } from './CmdTokens';
import { FileChip } from './FileChip';
import { useDensityStore } from './densityStore';

const AGENT_FROM_KIND: Record<string, string | null> = {
  file_read: 'Read',
  file_write: 'Write',
  file_list: 'Glob',
  think: 'Think',
};

function parseFromEvent(event: UiEvent) {
  const meta = (event.meta ?? {}) as Record<string, unknown>;
  const toolName = typeof meta.toolName === 'string' ? meta.toolName : undefined;
  if (toolName) return parseAgentCommand(toolName, { path: event.action?.path });
  const fromKind = AGENT_FROM_KIND[event.kind];
  if (fromKind) return parseAgentCommand(fromKind, { path: event.action?.path });
  return parseShellCommand(eventCommand(event));
}

export type MiniStackItem = { event: UiEvent; isRunning: boolean; isError: boolean };

export function MiniStack({ items, onOpenFile }: { items: MiniStackItem[]; onOpenFile?: (path: string) => void }) {
  const overrides = useDensityStore((s) => s.overrides);
  const toggleOverride = useDensityStore((s) => s.toggleOverride);
  const [, setHoveredId] = useState<string | null>(null); // not used directly — CSS handles hover, this state forces re-render if needed in the future

  const runningCount = items.filter((i) => i.isRunning).length;
  const errorCount = items.filter((i) => i.isError).length;
  const summaryParts = [`${items.length} actions`];
  if (runningCount > 0) summaryParts.push(`${runningCount} 실행 중`);
  if (errorCount > 0) summaryParts.push(`${errorCount} 실패`);

  return (
    <div className="cmd-mini-stack">
      <div className="cmd-mini-stack__row">
        {items.map(({ event, isRunning, isError }) => {
          const parsed = parseFromEvent(event);
          const isOpen = Boolean(overrides[event.id]);
          return (
            <span
              key={event.id}
              className="cmd-mini-badge-wrap"
              onMouseEnter={() => setHoveredId(event.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <CmdBadge
                tone={parsed.tone}
                icon={parsed.icon}
                label={parsed.label}
                isRunning={isRunning}
                isError={isError}
                isOpen={isOpen}
                clickable
                onClick={() => toggleOverride(event.id)}
              />
              <div className="cmd-mini-pop" role="tooltip">
                {parsed.tokens.length > 0 ? (
                  <CmdTokens parsed={parsed} raw={eventCommand(event)} />
                ) : parsed.fileArgs[0] ? (
                  <FileChip file={parsed.fileArgs[0]} />
                ) : (
                  <span>{parsed.label}</span>
                )}
                <div className="cmd-mini-pop__meta">
                  {isError ? '실패' : isRunning ? '실행 중' : '완료'}
                </div>
              </div>
            </span>
          );
        })}
        <span className="cmd-mini-stack__label">{summaryParts.join(' · ')}</span>
      </div>

      {items.map(({ event, isRunning, isError }) => {
        if (!overrides[event.id]) return null;
        const parsed = parseFromEvent(event);
        const preview = projectActionPreview(event);
        return (
          <div key={event.id + '-x'} className="cmd-mini-stack__inline">
            <div className="pc-action-stack" data-kind={parsed.tone} data-density="expanded">
              <div className="pc-action-card" data-density="expanded" data-kind={parsed.tone} onClick={() => toggleOverride(event.id)}>
                <CmdBadge tone={parsed.tone} icon={parsed.icon} label={parsed.label} isRunning={isRunning} isError={isError} />
                <div className="pc-action-card__main">
                  <CmdTokens parsed={parsed} raw={eventCommand(event)} onOpenFile={onOpenFile} />
                </div>
              </div>
              {preview && (
                <div className="pc-action-result">
                  <pre className="pc-action-result__body">{preview}</pre>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
