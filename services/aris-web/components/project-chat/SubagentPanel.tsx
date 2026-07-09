'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionChat } from '@/lib/happy/types';
import { buildProjectRuntimeSubagentsPath } from '@/lib/projectRuntimeAdapter';

type SubagentPanelProps = {
  projectId: string;
  chatId: string | null;
  active: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  running: '실행 중',
  completed: '완료',
};

function normalizeStatus(value: string | null | undefined): 'running' | 'completed' | 'unknown' {
  return value === 'running' || value === 'completed' ? value : 'unknown';
}

function statusLabel(value: string | null | undefined): string {
  return value && STATUS_LABELS[value] ? STATUS_LABELS[value] : value || '알 수 없음';
}

/**
 * Right-sidebar panel listing the imported subagent (Task tool) transcripts that
 * belong to the active chat. Subagent transcripts are intentionally hidden from
 * the main chat list; this is the only place they surface. Polls while visible so
 * the run status (running/completed) stays roughly live.
 */
export function SubagentPanel({ projectId, chatId, active }: SubagentPanelProps) {
  const [subagents, setSubagents] = useState<SessionChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    if (!chatId) {
      setSubagents([]);
      return;
    }
    const reqId = reqRef.current + 1;
    reqRef.current = reqId;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        buildProjectRuntimeSubagentsPath(projectId, chatId),
        { cache: 'no-store' },
      );
      const body = (await res.json().catch(() => ({}))) as { subagents?: SessionChat[]; error?: string };
      if (reqId !== reqRef.current) {
        return;
      }
      if (!res.ok) {
        setError(body.error ?? '서브에이전트를 불러오지 못했습니다.');
        return;
      }
      setSubagents(Array.isArray(body.subagents) ? body.subagents : []);
    } catch (err) {
      if (reqId !== reqRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : '서브에이전트를 불러오지 못했습니다.');
    } finally {
      if (reqId === reqRef.current) {
        setLoading(false);
      }
    }
  }, [projectId, chatId]);

  useEffect(() => {
    if (!active || !chatId) {
      return;
    }
    void load();
    const timer = setInterval(() => { void load(); }, 5000);
    return () => clearInterval(timer);
  }, [active, chatId, load]);

  if (!chatId) {
    return (
      <div className="ctx-group">
        <div className="subagent-empty">채팅을 선택하면 서브에이전트가 표시됩니다.</div>
      </div>
    );
  }

  return (
    <div className="ctx-group">
      <div className="ctx-group__head">
        <span className="ctx-group__title">Subagents</span>
        <span className="ctx-group__count">{subagents.length}</span>
      </div>
      {error ? <div className="subagent-empty">{error}</div> : null}
      {!error && subagents.length === 0 ? (
        <div className="subagent-empty">{loading ? '불러오는 중…' : '이 채팅에는 서브에이전트가 없습니다.'}</div>
      ) : null}
      {subagents.map((sub) => {
        const status = normalizeStatus(sub.subagentStatus);
        return (
          <div key={sub.id} className="subagent-row" data-status={status}>
            <span aria-hidden className="subagent-row__dot" />
            <div className="subagent-row__body">
              <div className="subagent-row__main">
                {sub.subagentType ? (
                  <span className="subagent-row__type">{sub.subagentType}</span>
                ) : null}
                <span className="subagent-row__title" title={sub.title}>
                  {sub.title}
                </span>
              </div>
              {sub.latestPreview ? (
                <div className="subagent-row__preview">
                  {sub.latestPreview}
                </div>
              ) : null}
            </div>
            <span className="subagent-row__status">
              {statusLabel(sub.subagentStatus)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
