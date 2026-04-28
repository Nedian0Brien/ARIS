'use client';

import React, { useMemo, useState, type ReactNode } from 'react';
import {
  CircleGauge,
  Files,
  History,
  ListChecks,
  Maximize2,
  Play,
  SquareTerminal,
  X,
} from 'lucide-react';
import { BackendNotice } from '@/components/ui/BackendNotice';
import type { SessionChat, UiEvent } from '@/lib/happy/types';
import type { RequestedFilePayload } from '../../customization-sidebar/types';
import type { WorkspacePanelLayout, WorkspacePanelType } from '@/lib/workspacePanels/types';
import { CreatePanelPage } from '../../workspace-panels/CreatePanelPage';
import { PanelPageRenderer } from '../../workspace-panels/PanelPageRenderer';
import { WorkspaceToolsPanelPage } from '../../workspace-panels/WorkspaceToolsPanelPage';
import { formatClock, getEventKindMeta, isActionKind, isUserEvent } from '../helpers';
import styles from '../../ChatInterface.module.css';

type WorkspacePanelsPaneBaseProps = {
  sessionId: string;
  projectName: string;
  workspaceRootPath: string;
  isMobileLayout: boolean;
  workspacePanelsError: string | null;
  workspacePanelsLoading: boolean;
  workspacePanelLayout: WorkspacePanelLayout;
  header?: ReactNode;
  requestedFile?: RequestedFilePayload | null;
  activeAgentLabel?: string;
  chats?: SessionChat[];
  events?: UiEvent[];
  isAgentRunning?: boolean;
  onInsertSnippet?: (snippet: string) => void;
  onJumpToMessage?: (eventId: string) => void;
};

type WorkspacePanelsCreatePaneProps = WorkspacePanelsPaneBaseProps & {
  mode: 'create';
  onCreatePanel: (type: WorkspacePanelType) => void;
  onReturnToChat?: () => void;
};

type WorkspacePanelsPanelPaneProps = WorkspacePanelsPaneBaseProps & {
  mode: 'panel';
  panelId: string;
  onSavePanel: (panelId: string, updates: { title?: string; config?: Record<string, unknown> }) => Promise<unknown>;
  onDeletePanel: (panelId: string) => Promise<unknown>;
  onReturnToChat?: () => void;
};

type WorkspacePanelsPaneProps = WorkspacePanelsCreatePaneProps | WorkspacePanelsPanelPaneProps;

type WorkspaceTab = 'run' | 'files' | 'terminal' | 'context';

const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string; Icon: typeof Play }> = [
  { id: 'run', label: 'Run', Icon: Play },
  { id: 'files', label: 'Files', Icon: Files },
  { id: 'terminal', label: 'Terminal', Icon: SquareTerminal },
  { id: 'context', label: 'Context', Icon: CircleGauge },
];

const SNIPPETS = [
  { label: 'Lint web', command: 'npm run lint' },
  { label: 'Typecheck', command: './node_modules/.bin/tsc --noEmit' },
  { label: 'Mobile overflow guard', command: 'npm test -- mobileOverflowLayout.test.ts' },
  { label: 'Git status', command: 'git status --short' },
];

const EMPTY_EVENTS: UiEvent[] = [];
const EMPTY_CHATS: SessionChat[] = [];

function getEventLabel(event: UiEvent) {
  if (isUserEvent(event)) return 'User';
  if (isActionKind(event.kind)) return getEventKindMeta(event.kind).label;
  return event.title || 'Agent';
}

function getEventPreview(event: UiEvent) {
  return (event.body || event.title || event.kind || '').replace(/\s+/g, ' ').trim() || 'No preview';
}

function renderWorkspaceEmpty(message: string) {
  return (
    <div className={styles.workspaceV2Empty}>
      <ListChecks size={18} />
      <p>{message}</p>
    </div>
  );
}

export function WorkspacePanelsPane(props: WorkspacePanelsPaneProps) {
  const frameClassName = `${styles.centerFrame} ${styles.wsPane} ${props.isMobileLayout ? styles.centerFrameMobileScroll : ''}`;
  const streamClassName = `${styles.stream} ${styles.wsBody} ${props.isMobileLayout ? styles.streamMobileScroll : ''}`;
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('run');
  const events = props.events ?? EMPTY_EVENTS;
  const chats = props.chats ?? EMPTY_CHATS;
  const recentEvents = useMemo(() => events.slice(-8).reverse(), [events]);
  const recentChats = useMemo(() => chats.slice(0, 6), [chats]);
  const actionEvents = useMemo(() => events.filter((event) => isActionKind(event.kind)).slice(-8).reverse(), [events]);
  const tokenEstimate = Math.max(1, Math.round(events.reduce((sum, event) => sum + (event.body?.length ?? 0) + (event.title?.length ?? 0), 0) / 4));
  const usagePercent = Math.min(92, Math.max(8, Math.round((tokenEstimate / 120000) * 100)));
  const explorerPanel = props.workspacePanelLayout.panels.find((panel) => panel.type === 'explorer') ?? {
    id: 'workspace-files-tab',
    type: 'explorer' as const,
    title: 'Files',
    config: {},
    createdAt: null,
  };

  const workspaceBody = (
    <div className={styles.workspaceV2}>
      <div className={`${styles.workspaceV2Header} ${styles.wsPaneHeader}`}>
        <div className={styles.workspaceV2TitleBlock}>
          {props.isMobileLayout ? <span className={styles.workspaceV2Handle} aria-hidden="true" /> : null}
          <span className={styles.workspaceV2Eyebrow}>Single Workspace</span>
          <h2 className={`${styles.workspaceV2Title} ${styles.wsPaneTitle}`}>Workspace</h2>
        </div>
        <div className={styles.workspaceV2Actions}>
          <button type="button" className={styles.workspaceV2IconButton} aria-label="워크스페이스 확장">
            <Maximize2 size={15} />
          </button>
          <button type="button" className={styles.workspaceV2IconButton} aria-label="워크스페이스 닫기" onClick={props.onReturnToChat}>
            <X size={15} />
          </button>
        </div>
      </div>

      <div className={styles.workspaceV2StatusStrip}>
        <span className={props.isAgentRunning ? styles.workspaceV2LiveDot : styles.workspaceV2IdleDot} />
        <strong>{props.activeAgentLabel ?? 'Agent'}</strong>
        <span>{props.isAgentRunning ? 'running' : 'ready'}</span>
        <span>{events.length} events</span>
      </div>

      <div className={`${styles.workspaceV2Tabs} ${styles.wsTabs}`} role="tablist" aria-label="워크스페이스 탭">
        {WORKSPACE_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={`${styles.workspaceV2Tab} ${styles.wsTab} ${activeTab === id ? `${styles.workspaceV2TabActive} ${styles.wsTabActive}` : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className={`${styles.workspaceV2Body} ${styles.wsBody}`}>
        {activeTab === 'run' && (
          <div className={styles.workspaceV2RunGrid}>
            <section className={`${styles.workspaceV2Card} ${styles.wsCard}`}>
              <div className={styles.workspaceV2CardHeader}>
                <span>Step timeline</span>
                <small>{recentEvents.length} recent</small>
              </div>
              {recentEvents.length === 0 ? renderWorkspaceEmpty('아직 실행 단계가 없습니다.') : (
                <div className={styles.workspaceV2StepList}>
                  {recentEvents.map((event, index) => (
                    <button
                      key={event.id}
                      type="button"
                      className={`${styles.workspaceV2Step} ${styles.wsRunStep}`}
                      onClick={() => props.onJumpToMessage?.(event.id)}
                    >
                      <span className={styles.workspaceV2StepIndex}>{String(recentEvents.length - index).padStart(2, '0')}</span>
                      <span className={styles.workspaceV2StepBody}>
                        <strong>{getEventLabel(event)}</strong>
                        <span>{getEventPreview(event)}</span>
                      </span>
                      <time>{formatClock(event.timestamp)}</time>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className={`${styles.workspaceV2Card} ${styles.wsCard}`}>
              <div className={styles.workspaceV2CardHeader}>
                <span>Chat history</span>
                <History size={14} />
              </div>
              {recentChats.length === 0 ? renderWorkspaceEmpty('채팅 히스토리가 비어 있습니다.') : (
                <div className={styles.workspaceV2HistoryList}>
                  {recentChats.map((chat) => {
                    const targetEvent = events.find((event) => event.meta?.chatId === chat.id);
                    return (
                      <button
                        key={chat.id}
                        type="button"
                        className={styles.workspaceV2HistoryItem}
                        onClick={() => targetEvent ? props.onJumpToMessage?.(targetEvent.id) : undefined}
                      >
                        <strong>{chat.title}</strong>
                        <span>{chat.latestPreview || 'No preview yet'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'files' && (
          <div className={styles.workspaceV2FilesWrap}>
            <WorkspaceToolsPanelPage
              sessionId={props.sessionId}
              panel={explorerPanel}
              projectName={props.projectName}
              workspaceRootPath={props.workspaceRootPath}
              requestedFile={props.requestedFile ?? null}
              isMobileLayout={props.isMobileLayout}
              onReturnToChat={props.onReturnToChat}
            />
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className={styles.workspaceV2TerminalGrid}>
            <section className={styles.workspaceV2Terminal}>
              <div className={styles.workspaceV2TerminalChrome}>
                <span />
                <span />
                <span />
                <strong>{props.workspaceRootPath}</strong>
              </div>
              <div className={styles.workspaceV2TerminalLines}>
                {actionEvents.length === 0 ? (
                  <p>$ Terminal output will appear here after commands run.</p>
                ) : actionEvents.map((event) => (
                  <p key={event.id}>
                    <span>$</span> {getEventPreview(event)}
                  </p>
                ))}
              </div>
            </section>
            <section className={`${styles.workspaceV2Card} ${styles.wsCard}`}>
              <div className={styles.workspaceV2CardHeader}>
                <span>Snippets</span>
                <small>insert</small>
              </div>
              <div className={styles.workspaceV2SnippetList}>
                {SNIPPETS.map((snippet) => (
                  <button
                    key={snippet.command}
                    type="button"
                    className={styles.workspaceV2Snippet}
                    onClick={() => props.onInsertSnippet?.(snippet.command)}
                  >
                    <strong>{snippet.label}</strong>
                    <code>{snippet.command}</code>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'context' && (
          <div className={styles.workspaceV2ContextGrid}>
            <section className={styles.workspaceV2ContextRing} style={{ '--usage': usagePercent } as React.CSSProperties}>
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="48" />
                <circle cx="60" cy="60" r="48" />
              </svg>
              <div>
                <strong>{usagePercent}%</strong>
                <span>Context usage</span>
              </div>
            </section>
            <section className={`${styles.workspaceV2Card} ${styles.wsCard}`}>
              <div className={styles.workspaceV2Breakdown}>
                <span><strong>{tokenEstimate.toLocaleString()}</strong> prompt estimate</span>
                <span><strong>{events.length}</strong> timeline events</span>
                <span><strong>{props.workspacePanelLayout.panels.length}</strong> legacy panels mapped</span>
                <span><strong>{Math.max(0, 120000 - tokenEstimate).toLocaleString()}</strong> headroom</span>
              </div>
            </section>
          </div>
        )}
      </div>

      <footer className={styles.workspaceV2Footer}>
        <span>Context</span>
        <div className={styles.workspaceV2UsageBar} aria-hidden="true">
          <span style={{ width: `${usagePercent}%` }} />
        </div>
        <strong>{usagePercent}%</strong>
      </footer>
    </div>
  );

  return (
    <section className={frameClassName}>
      {props.header}
      <div className={streamClassName}>
        {props.workspacePanelsError ? (
          <div className={styles.noticeWrap}>
            <BackendNotice message={props.workspacePanelsError} />
          </div>
        ) : null}
        {props.mode === 'create' ? (
          props.workspacePanelsLoading ? (
            <div className={styles.emptyChatState}>
              <div className={styles.agentSelectorTitle}>패널 화면을 준비하는 중…</div>
            </div>
          ) : props.chats || props.events ? (
            workspaceBody
          ) : (
            <CreatePanelPage
              onCreatePanel={props.onCreatePanel}
              onReturnToChat={props.onReturnToChat}
            />
          )
        ) : (
          (() => {
            const panel = props.workspacePanelLayout.panels.find((candidate) => candidate.id === props.panelId);

            return panel ? (
              <PanelPageRenderer
                sessionId={props.sessionId}
                panel={panel}
                projectName={props.projectName}
                workspaceRootPath={props.workspaceRootPath}
                requestedFile={props.requestedFile}
                isMobileLayout={props.isMobileLayout}
                onSavePanel={props.onSavePanel}
                onDeletePanel={props.onDeletePanel}
                onReturnToChat={props.onReturnToChat}
              />
            ) : (
              <div className={styles.emptyChatState}>
                <div className={styles.agentSelectorTitle}>패널을 찾을 수 없습니다.</div>
              </div>
            );
          })()
        )}
      </div>
    </section>
  );
}
