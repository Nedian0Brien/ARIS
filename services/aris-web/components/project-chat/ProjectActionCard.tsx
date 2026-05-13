'use client';

import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Copy, Maximize2 } from 'lucide-react';
import type { UiEvent } from '@/lib/happy/types';
import { parseAgentCommand, parseShellCommand } from '@/lib/cmd/parseCommand';
import {
  eventCommand,
  projectActionPreview,
} from '@/components/project-chat/helpers/projectChatEvents';
import { CmdBadge } from './cmd-display/CmdBadge';
import { CmdTokens } from './cmd-display/CmdTokens';
import { CmdIcon } from './cmd-display/icons';
import { useDensityStore } from './cmd-display/densityStore';
import type { ResolvedDensity } from './cmd-display/densityStore';

const AGENT_TOOLS_FROM_KIND: Record<string, string | null> = {
  file_read: 'Read',
  file_write: 'Write',
  file_list: 'Glob',
  think: 'Think',
  run_execution: null,
  command_execution: null,
  exec_execution: null,
  git_execution: null,
  docker_execution: null,
};

function parseFromEvent(event: UiEvent) {
  const meta = (event.meta ?? {}) as Record<string, unknown>;
  const toolName = typeof meta.toolName === 'string' ? meta.toolName : undefined;
  if (toolName) return parseAgentCommand(toolName, { path: event.action?.path });
  const fromKind = AGENT_TOOLS_FROM_KIND[event.kind];
  if (fromKind) return parseAgentCommand(fromKind, { path: event.action?.path });
  return parseShellCommand(eventCommand(event));
}

export function ProjectActionCard({
  event,
  density,
  isRunning,
  isError,
  onCopy,
  onPreview,
  onOpenFile,
}: {
  event: UiEvent;
  density: ResolvedDensity;
  isRunning: boolean;
  isError: boolean;
  onCopy: () => void;
  onPreview?: () => void;
  onOpenFile?: (path: string) => void;
}) {
  const parsed = parseFromEvent(event);
  const preview = projectActionPreview(event);
  const toggleOverride = useDensityStore((s) => s.toggleOverride);

  // Preserve the existing pc-action-stack connector measurements for the expanded variant.
  const stackRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [connectorMetrics, setConnectorMetrics] = useState<{ cardCenter: number; resultCenter: number } | null>(null);

  useEffect(() => {
    if (density !== 'expanded' || !preview) {
      setConnectorMetrics(null);
      return undefined;
    }
    const stack = stackRef.current;
    const card = cardRef.current;
    const result = resultRef.current;
    if (!stack || !card || !result) return undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const stackRect = stack.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const resultRect = result.getBoundingClientRect();
        const next = {
          cardCenter: Math.round(cardRect.top - stackRect.top + cardRect.height / 2),
          resultCenter: Math.round(resultRect.top - stackRect.top + resultRect.height / 2),
        };
        setConnectorMetrics((cur) =>
          cur && cur.cardCenter === next.cardCenter && cur.resultCenter === next.resultCenter ? cur : next,
        );
      });
    };
    measure();
    const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    obs?.observe(card);
    obs?.observe(result);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      obs?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [density, preview]);

  const connectorStyle = connectorMetrics
    ? ({
        '--pc-action-card-center': `${connectorMetrics.cardCenter}px`,
        '--pc-action-result-center': `${connectorMetrics.resultCenter}px`,
      } as CSSProperties)
    : undefined;

  // ---- Minimal density: standalone fallback (MiniStack normally renders these) ----
  if (density === 'minimal') {
    return (
      <CmdBadge
        tone={parsed.tone}
        icon={parsed.icon}
        label={parsed.label}
        isRunning={isRunning}
        isError={isError}
        clickable
        onClick={() => toggleOverride(event.id)}
      />
    );
  }

  return (
    <div ref={stackRef} className="pc-action-stack" data-kind={parsed.tone} data-density={density} style={connectorStyle}>
      <div
        ref={cardRef}
        className="pc-action-card"
        data-project-action-card
        data-kind={parsed.tone}
        data-density={density}
        onClick={() => toggleOverride(event.id)}
      >
        <CmdBadge tone={parsed.tone} icon={parsed.icon} label={parsed.label} isRunning={isRunning} isError={isError} />
        <div className="pc-action-card__main">
          <CmdTokens parsed={parsed} raw={eventCommand(event)} onOpenFile={onOpenFile} />
        </div>
        <span className="pc-action-card__time">
          <CmdIcon name={density === 'expanded' ? 'chevronDown' : 'chevronRight'} size={12} />
        </span>
        <div className="pc-action-card__actions">
          {onPreview && (
            <button
              type="button"
              className="pc-action-card__preview-btn"
              onClick={(e) => { e.stopPropagation(); onPreview(); }}
              title="Preview referenced file"
            >
              <Maximize2 size={13} />
            </button>
          )}
          <button
            type="button"
            className="pc-action-card__copy"
            onClick={(e) => { e.stopPropagation(); onCopy(); }}
            title="Copy action command"
          >
            <Copy size={13} />
          </button>
        </div>
      </div>
      {density === 'expanded' && preview && (
        <>
          <span className="pc-action-connector" aria-hidden="true" />
          <div ref={resultRef} className="pc-action-result">
            <pre className="pc-action-result__body">{preview}</pre>
          </div>
        </>
      )}
    </div>
  );
}
