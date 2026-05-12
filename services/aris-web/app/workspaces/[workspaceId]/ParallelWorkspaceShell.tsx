'use client';

import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Columns2, Plus, X } from 'lucide-react';
import type { ModelSettingsResponse } from '@/lib/settings/providerModels';
import type {
  AgentFlavor,
  ApprovalPolicy,
  PermissionRequest,
  SessionChat,
  UiEvent,
} from '@/lib/happy/types';
import type {
  ParallelPanelNode,
  ParallelWorkspaceView,
} from '@/lib/parallelWorkspace/layout';
import { ChatInterface } from '@/app/sessions/[sessionId]/ChatInterface';
import styles from './ParallelWorkspaceShell.module.css';

type PanelSessionPayload = {
  panelId: string;
  sessionId: string;
  initialEvents: UiEvent[];
  initialHasMoreBefore: boolean;
  initialPermissions: PermissionRequest[];
  projectName: string;
  workspaceRootPath: string;
  agentFlavor: AgentFlavor;
  sessionModel?: string | null;
  approvalPolicy?: ApprovalPolicy;
  initialChats: SessionChat[];
  activeChatId: string | null;
  error?: string | null;
};

type Props = {
  workspace: ParallelWorkspaceView;
  panels: Record<string, PanelSessionPayload>;
  isOperator: boolean;
  initialModelSettings: ModelSettingsResponse | null;
};

function flattenPanelIds(node: ParallelPanelNode | null, output: string[] = []): string[] {
  if (!node) {
    return output;
  }
  if (node.type === 'leaf') {
    output.push(node.panelId);
    return output;
  }
  flattenPanelIds(node.first, output);
  flattenPanelIds(node.second, output);
  return output;
}

export function ParallelWorkspaceShell({
  workspace,
  panels,
  isOperator,
  initialModelSettings,
}: Props) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [agent, setAgent] = useState<AgentFlavor>('codex');
  const [error, setError] = useState<string | null>(null);
  const orderedPanelIds = useMemo(() => flattenPanelIds(workspace.layout.layout), [workspace.layout.layout]);

  const createPanel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOperator || isCreating) {
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const response = await fetch(`/api/parallel-workspaces/${encodeURIComponent(workspace.id)}/panels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          agent,
          afterPanelId: workspace.layout.activePanelId,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : '패널을 만들지 못했습니다.');
      }
      setTitle('');
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '패널을 만들지 못했습니다.');
    } finally {
      setIsCreating(false);
    }
  };

  const closePanel = async (panelId: string) => {
    if (!isOperator) {
      return;
    }
    setError(null);
    const response = await fetch(
      `/api/parallel-workspaces/${encodeURIComponent(workspace.id)}/panels/${encodeURIComponent(panelId)}`,
      { method: 'DELETE' },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(typeof body.error === 'string' ? body.error : '패널을 닫지 못했습니다.');
      return;
    }
    router.refresh();
  };

  const markActive = (panelId: string) => {
    if (!isOperator || workspace.layout.activePanelId === panelId) {
      return;
    }
    void fetch(
      `/api/parallel-workspaces/${encodeURIComponent(workspace.id)}/panels/${encodeURIComponent(panelId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      },
    ).then(() => router.refresh()).catch(() => undefined);
  };

  const renderNode = (node: ParallelPanelNode | null): ReactNode => {
    if (!node) {
      return (
        <div className={styles.empty}>
          <div className={styles.emptyInner}>
            <Columns2 size={18} aria-hidden />
            <span>agent 패널이 없습니다.</span>
          </div>
        </div>
      );
    }

    if (node.type === 'split') {
      return (
        <div className={`${styles.split} ${node.direction === 'vertical' ? styles.splitVertical : styles.splitHorizontal}`}>
          {renderNode(node.first)}
          {renderNode(node.second)}
        </div>
      );
    }

    const panel = workspace.layout.panels[node.panelId];
    const payload = panels[node.panelId];
    if (!panel) {
      return null;
    }

    return (
      <section className={styles.panel} onFocus={() => markActive(panel.id)} onMouseDown={() => markActive(panel.id)}>
        <header className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <span className={styles.agentBadge}>{panel.agent}</span>
            <span className={styles.panelName}>{panel.title}</span>
            <span className={styles.panelMeta}>{panel.branch}</span>
          </div>
          <div className={styles.panelActions}>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => closePanel(panel.id)}
              aria-label="패널 닫기"
              disabled={!isOperator}
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        </header>
        <div className={styles.panelBody}>
          {payload?.error ? (
            <div className={styles.errorPanel}>{payload.error}</div>
          ) : payload ? (
            <ChatInterface
              sessionId={payload.sessionId}
              initialEvents={payload.initialEvents}
              initialHasMoreBefore={payload.initialHasMoreBefore}
              initialPermissions={payload.initialPermissions}
              isOperator={isOperator}
              projectName={payload.projectName}
              workspaceRootPath={payload.workspaceRootPath}
              agentFlavor={payload.agentFlavor}
              sessionModel={payload.sessionModel}
              approvalPolicy={payload.approvalPolicy}
              initialModelSettings={initialModelSettings}
              initialChats={payload.initialChats}
              activeChatId={payload.activeChatId}
              initialShowWorkspaceHome={payload.activeChatId === null}
              surfaceMode="parallel-panel"
            />
          ) : (
            <div className={styles.errorPanel}>세션 정보를 불러오지 못했습니다.</div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{workspace.title}</h1>
          <div className={styles.subtitle}>{workspace.rootPath}</div>
        </div>
        <div className={styles.toolbar}>
          {error ? <span className={styles.subtitle}>{error}</span> : null}
          <form className={styles.form} onSubmit={createPanel}>
            <input
              className={styles.input}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="패널 제목"
              disabled={!isOperator || isCreating}
            />
            <select
              className={styles.select}
              value={agent}
              onChange={(event) => setAgent(event.target.value as AgentFlavor)}
              disabled={!isOperator || isCreating}
              aria-label="Agent"
            >
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
            </select>
            <button className={styles.button} type="submit" disabled={!isOperator || isCreating}>
              <Plus size={15} aria-hidden />
              새 agent 패널
            </button>
          </form>
        </div>
      </header>
      <main className={styles.canvas}>
        {orderedPanelIds.length === 0 ? (
          <div className={styles.empty}>
            <form className={styles.form} onSubmit={createPanel}>
              <button className={styles.button} type="submit" disabled={!isOperator || isCreating}>
                <Plus size={15} aria-hidden />
                새 agent 패널
              </button>
            </form>
          </div>
        ) : (
          renderNode(workspace.layout.layout)
        )}
      </main>
    </div>
  );
}
