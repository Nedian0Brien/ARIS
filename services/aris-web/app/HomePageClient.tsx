'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  AtSign,
  ChevronLeft,
  Check,
  ChevronRight,
  Clock,
  Clock3,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  File as FileIcon,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Home,
  Maximize2,
  MessageSquareText,
  Mic,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelRight,
  PanelsTopLeft,
  Paperclip,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Share2,
  Sparkles,
  Square,
  Sun,
  Terminal,
  Wifi,
  X,
} from 'lucide-react';
import { BottomNav, TabType } from '@/components/layout/BottomNav';
import { BackendNotice } from '@/components/ui/BackendNotice';
import { selectRecentProjects } from './homeProjects';
import { withAppBasePath } from '@/lib/routing/appPath';
import { applyTheme, readThemeMode, type ThemeMode } from '@/lib/theme/clientTheme';
import type { AuthenticatedUser } from '@/lib/auth/types';
import type { SessionChat, SessionStatus, SessionSummary, UiEvent } from '@/lib/happy/types';

type ProjectView = 'overview' | 'chats' | 'chat' | 'files' | 'context';
type ComposerMode = 'agent' | 'plan' | 'terminal';
type WorkspaceTab = 'run' | 'files' | 'terminal' | 'context';
type PreviewState = 'closed' | 'open' | 'dock';
type ModelProvider = 'claude' | 'codex' | 'gemini';
type ReasoningEffort = 'Low' | 'Medium' | 'High' | 'XHigh' | 'Max';
type ExpandedTurnState = string | null | '__none__';

type FileItem = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  sizeBytes?: number;
  modifiedAt?: string;
};

type DirectoryData = {
  currentPath: string;
  parentPath: string | null;
  directories: FileItem[];
};

type RuntimeMetric = {
  percent: number;
  usedBytes?: number;
  totalBytes?: number;
};

type RuntimeMetrics = {
  cpu: RuntimeMetric;
  ram: RuntimeMetric;
  storage: RuntimeMetric;
};

type CmdConsoleOutputKind = 'out' | 'ok' | 'info' | 'warn';

type CmdConsoleOutput = {
  kind?: CmdConsoleOutputKind;
  text: string;
};

type CmdConsoleLine = {
  id: string;
  prompt: boolean;
  text: string;
  kind: CmdConsoleOutputKind;
  caret: boolean;
};

const SUGGESTED_ASKS = [
  'composer v2 디자인 결정 맥락 요약해줘',
  '최근 일주일 동안 가장 많이 쓴 명령어는?',
  'lawdigest 프로젝트 테스트 커버리지 현황',
  'ChatInterface의 settle 루프 이슈 해결 방식',
];

const CMD_CONSOLE_MAX_LINES = 16;
const WORKSPACE_DRAWER_CLOSE_MS = 160;

const CMD_CONSOLE_SCRIPT: Array<[string, CmdConsoleOutput[]]> = [
  ['aris context hydrate --scope workspace', [
    { kind: 'info', text: 'loaded 42 project memories' },
    { kind: 'ok', text: 'context graph ready' },
  ]],
  ['git status --short', [
    { kind: 'out', text: 'M  services/aris-web/app/HomePageClient.tsx' },
    { kind: 'out', text: 'M  services/aris-web/app/styles/ui.css' },
  ]],
  ['npm test -- designSystemV3Implementation', [
    { kind: 'ok', text: '5 contracts verified' },
  ]],
  ['codex plan apply --mode precise', [
    { kind: 'info', text: 'preserving v2 IA tokens' },
    { kind: 'ok', text: 'v3 policy layer mounted' },
  ]],
  ['aris memory write --type project "ia-v3"', [
    { kind: 'out', text: 'signature: ghost-button + console + spotlight' },
  ]],
];

const THEME_OPTIONS = [
  { mode: 'system' as const, label: '시스템', Icon: Monitor },
  { mode: 'light' as const, label: '라이트', Icon: Sun },
  { mode: 'dark' as const, label: '다크', Icon: Moon },
];

const FALLBACK_FILES: FileItem[] = [
  { name: 'docs', path: '/docs', isDirectory: true, isFile: false },
  { name: 'chat-prototype.html', path: '/docs/design/chat-prototype.html', isDirectory: false, isFile: true, sizeBytes: 112400 },
  { name: 'chat-screen-v1.html', path: '/docs/design/chat-screen-v1.html', isDirectory: false, isFile: true, sizeBytes: 204800 },
  { name: 'chat-redesign-spec.md', path: '/docs/chat-redesign-spec.md', isDirectory: false, isFile: true, sizeBytes: 18300 },
  { name: 'design-system-v1.html', path: '/docs/design/design-system-v1.html', isDirectory: false, isFile: true, sizeBytes: 98100 },
  { name: 'chat-composer-v2.html', path: '/docs/design/chat-composer-v2.html', isDirectory: false, isFile: true, sizeBytes: 108500 },
];

const MODEL_OPTIONS: Record<ModelProvider, Array<{ name: string; meta: string }>> = {
  claude: [
    { name: 'Opus 4.7', meta: '200k · 1M context · reasoning' },
    { name: 'Sonnet 4.6', meta: '200k context · balanced' },
    { name: 'Haiku 4.5', meta: '200k context · fast' },
  ],
  codex: [
    { name: 'GPT-5.5', meta: '200k context · reasoning' },
    { name: 'GPT-5', meta: '128k context' },
    { name: 'GPT-5 mini', meta: '128k context · fast' },
  ],
  gemini: [
    { name: 'Gemini 3 Pro', meta: '2M context · reasoning' },
    { name: 'Gemini 3 Flash', meta: '1M context · fast' },
  ],
};

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
};

const PROVIDER_EFFORTS: Record<ModelProvider, ReasoningEffort[]> = {
  claude: ['Low', 'Medium', 'High', 'XHigh', 'Max'],
  codex: ['Low', 'Medium', 'High', 'XHigh'],
  gemini: ['Low', 'Medium', 'High'],
};

const COMPOSER_MODE_COPY: Record<ComposerMode, string> = {
  agent: 'Agent',
  plan: 'Plan',
  terminal: 'Terminal',
};

function providerFromAgent(agent: SessionSummary['agent'] | SessionChat['agent']): ModelProvider {
  if (agent === 'claude' || agent === 'gemini' || agent === 'codex') return agent;
  return 'codex';
}

function normalizeReasoningEffort(value: SessionChat['modelReasoningEffort'] | null | undefined): ReasoningEffort {
  if (value === 'low') return 'Low';
  if (value === 'medium') return 'Medium';
  if (value === 'xhigh') return 'XHigh';
  return 'High';
}

function serializeReasoningEffort(value: ReasoningEffort): SessionChat['modelReasoningEffort'] {
  if (value === 'Low') return 'low';
  if (value === 'Medium') return 'medium';
  if (value === 'XHigh' || value === 'Max') return 'xhigh';
  return 'high';
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

function normalizeTab(tab: string | null): TabType {
  switch (tab) {
    case 'home':
    case 'sessions':
      return 'home';
    case 'ask':
    case 'console':
      return 'ask';
    case 'project':
    case 'settings':
      return 'project';
    case 'files':
      return 'files';
    default:
      return 'home';
  }
}

function normalizeProjectView(view: string | null): ProjectView {
  switch (view) {
    case 'chats':
    case 'chat':
    case 'files':
    case 'context':
      return view;
    default:
      return 'overview';
  }
}

function statusWeight(status: SessionStatus): number {
  if (status === 'running') return 0;
  if (status === 'idle') return 1;
  if (status === 'stopped') return 2;
  if (status === 'error') return 3;
  return 4;
}

function sortSessions(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const statusDelta = statusWeight(a.status) - statusWeight(b.status);
    if (statusDelta !== 0) return statusDelta;
    return Date.parse(b.lastActivityAt ?? '') - Date.parse(a.lastActivityAt ?? '');
  });
}

function displayProjectName(session: SessionSummary): string {
  const candidate = session.alias || session.projectName || session.id;
  const normalized = candidate.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || candidate;
}

function displayProjectPath(session: SessionSummary): string {
  return session.projectName || session.id;
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return 'unknown';

  const diffMs = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

function formatBytes(value?: number): string {
  if (!value || value < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let next = value;
  let unitIndex = 0;
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }
  return `${next >= 10 ? next.toFixed(0) : next.toFixed(1)} ${units[unitIndex]}`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function statusClass(status: SessionStatus): string {
  if (status === 'running') return 'run';
  if (status === 'error') return 'appr';
  if (status === 'stopped') return 'done';
  return 'idle';
}

function createChatPreview(session: SessionSummary, index: number): string {
  const project = displayProjectName(session);
  if (session.status === 'running') {
    return `${project} 작업이 실행 중입니다. 최근 런타임 이벤트와 파일 변경을 확인하세요.`;
  }
  if (session.status === 'error') {
    return `${project}에서 확인이 필요한 오류 신호가 있습니다. 마지막 이벤트부터 추적하세요.`;
  }
  if (index % 2 === 0) {
    return `${project}의 최근 결정과 변경 파일을 한 화면에서 다시 이어갈 수 있습니다.`;
  }
  return `${project} 관련 이전 채팅과 작업 맥락이 프로젝트 카드에 묶여 있습니다.`;
}

function buildRecentAsks(sessions: SessionSummary[]): Array<{ question: string; meta: string }> {
  const source = sessions.slice(0, 3);
  if (source.length === 0) {
    return [
      { question: 'composer v2 라이브 결정 뭐였지?', meta: 'recent · 8 msgs' },
      { question: 'nvm Node 20 쓰는 이유?', meta: 'recent · 3 msgs' },
      { question: 'deploy squash-merge 금지 배경', meta: 'recent · 5 msgs' },
    ];
  }
  return source.map((session) => ({
    question: `${displayProjectName(session)} 최근 결정 맥락`,
    meta: `${formatRelativeTime(session.lastActivityAt)} · ${session.totalChats ?? 0} chats`,
  }));
}

function projectStatusLabel(status: SessionStatus): string {
  if (status === 'running') return 'running';
  if (status === 'error') return 'approval';
  return 'idle';
}

function projectStatusBadgeClass(status: SessionStatus): string {
  if (status === 'running') return 'badge--info';
  if (status === 'error') return 'badge--warning';
  return 'badge--neutral';
}

function deriveProjectFileCount(session: SessionSummary, index: number): number {
  return Math.max(18, (session.totalChats ?? 0) * 7 + index * 11 + 24);
}

function deriveProjectTokenLabel(session: SessionSummary, index: number): string {
  const total = Math.max(9.1, (session.totalChats ?? 0) * 11.8 + index * 7.4);
  return `${total.toFixed(1)}k`;
}

function buildProjectDetailPath(sessionId: string, view: ProjectView = 'overview', chatId?: string | null): string {
  const params = new URLSearchParams();
  params.set('tab', 'project');
  params.set('project', sessionId);
  if (view !== 'overview') {
    params.set('view', view);
  }
  if (view === 'chat' && chatId) {
    params.set('chat', chatId);
  }
  return `/?${params.toString()}`;
}

async function createProjectSessionChat(
  sessionId: string,
  input: {
    title?: string;
    agent?: SessionSummary['agent'];
    model?: string | null;
    geminiMode?: string | null;
    modelReasoningEffort?: SessionChat['modelReasoningEffort'];
  },
): Promise<SessionChat> {
  const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => ({}))) as { chat?: SessionChat; error?: string };
  if (!response.ok || !body.chat) {
    throw new Error(body.error ?? '새 채팅을 만들지 못했습니다.');
  }
  return body.chat;
}

function navigateTo(path: string) {
  window.location.assign(withAppBasePath(path));
}

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function trimConsoleLines(lines: CmdConsoleLine[]): CmdConsoleLine[] {
  return lines.slice(-CMD_CONSOLE_MAX_LINES);
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setReducedMotion(media.matches);
    };

    sync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
    } else {
      media.addListener(sync);
    }

    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', sync);
      } else {
        media.removeListener(sync);
      }
    };
  }, []);

  return reducedMotion;
}

function Sidebar({
  activeTab,
  activeProjectId,
  activeProjectChatId,
  onProjectChatOpen,
  onTabChange,
  onProjectOpen,
  sessions,
  user,
}: {
  activeTab: TabType;
  activeProjectId: string | null;
  activeProjectChatId: string | null;
  onProjectChatOpen: (sessionId: string, chatId: string) => void;
  onTabChange: (tab: TabType) => void;
  onProjectOpen: (sessionId: string, view?: ProjectView) => void;
  sessions: SessionSummary[];
  user: AuthenticatedUser;
}) {
  const projects = sortSessions(sessions).slice(0, 6);
  const totalChats = sessions.reduce((sum, session) => sum + (session.totalChats ?? 0), 0);
  const userInitial = (user.email?.trim()?.[0] ?? 'A').toUpperCase();
  const [activeProjectChats, setActiveProjectChats] = useState<SessionChat[]>([]);
  const [isLoadingProjectChats, setIsLoadingProjectChats] = useState(false);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [tipPosition, setTipPosition] = useState<{ top: number; left: number } | null>(null);

  function handleProjectTipShow(session: SessionSummary, event: React.SyntheticEvent<HTMLButtonElement>) {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 220));
    const left = rect.right + 8;
    setHoveredProjectId(session.id);
    setTipPosition({ top, left });
  }

  function handleProjectTipHide() {
    setHoveredProjectId(null);
  }

  const hoveredProject = hoveredProjectId
    ? projects.find((p) => p.id === hoveredProjectId) ?? null
    : null;

  const navItems: Array<{ id: TabType; label: string; Icon: typeof Home; count?: number }> = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'ask', label: 'Ask ARIS', Icon: MessageSquareText, count: totalChats },
    { id: 'project', label: 'Project', Icon: PanelsTopLeft },
    { id: 'files', label: 'Files', Icon: FileText },
  ];

  useEffect(() => {
    if (activeTab !== 'project' || !activeProjectId) {
      setActiveProjectChats([]);
      setIsLoadingProjectChats(false);
      return;
    }

    const projectId = activeProjectId;
    let cancelled = false;
    async function loadActiveProjectChats() {
      setIsLoadingProjectChats(true);
      try {
        const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(projectId)}/chats`, { cache: 'no-store' });
        const body = (await response.json().catch(() => ({}))) as { chats?: SessionChat[] };
        if (!cancelled && response.ok) {
          setActiveProjectChats(body.chats ?? []);
        }
      } catch {
        if (!cancelled) {
          setActiveProjectChats([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProjectChats(false);
        }
      }
    }

    void loadActiveProjectChats();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, activeTab]);

  return (
    <aside className="m-sb" aria-label="ARIS navigation">
      <div className="m-sb__brand">
        <div className="m-sb__logo">A</div>
        <span className="m-sb__brand-name">ARIS</span>
      </div>
      <button className="m-sb__new" type="button" onClick={() => onTabChange('ask')}>
        <Plus size={14} />
        New chat
      </button>
      <nav className="m-sb__nav">
        {navItems.map(({ id, label, Icon, count }) => (
          <button
            key={id}
            type="button"
            className={`m-sb__nav-item${activeTab === id ? ' m-sb__nav-item--active' : ''}`}
            onClick={() => onTabChange(id)}
          >
            <Icon size={15} />
            {label}
            {typeof count === 'number' && <span className="m-sb__nav-count">{count}</span>}
          </button>
        ))}
      </nav>

      <div className="m-sb__proj-head"><span>{activeTab === 'ask' ? 'Recent asks' : 'Projects'}</span></div>
      <div className="m-sb__projects">
        {activeTab === 'ask'
          ? buildRecentAsks(sessions).map((ask) => (
              <button key={ask.question} type="button" className="m-sb__proj">
                <span className="m-sb__proj-name m-sb__proj-name--ask">{ask.question}</span>
              </button>
            ))
          : projects.map((session) => {
              const isActiveProject = activeProjectId === session.id;
              const childChats = isActiveProject ? activeProjectChats : [];
              const visibleChatCount = isActiveProject && !isLoadingProjectChats
                ? childChats.length
                : session.totalChats ?? 0;
              return (
                <div key={session.id} className={`m-sb__project-node${isActiveProject ? ' m-sb__project-node--open' : ''}`}>
                  <button
                    type="button"
                    className={`m-sb__proj m-sb__proj--${statusClass(session.status)}${isActiveProject ? ' m-sb__proj--active' : ''}`}
                    onClick={() => onProjectOpen(session.id)}
                    onMouseEnter={(event) => handleProjectTipShow(session, event)}
                    onMouseLeave={handleProjectTipHide}
                    onFocus={(event) => handleProjectTipShow(session, event)}
                    onBlur={handleProjectTipHide}
                    aria-describedby={hoveredProjectId === session.id ? 'sb-tip' : undefined}
                  >
                    <span className="m-sb__proj-dot" />
                    <span className="m-sb__proj-name">{displayProjectName(session)}</span>
                    <span className="m-sb__proj-count">{visibleChatCount}</span>
                  </button>
                  {isActiveProject && (
                    <div className="m-sb__chat-children" aria-label={`${displayProjectName(session)} chats`}>
                      {isLoadingProjectChats && <div className="m-sb__chat-loading">Loading chats</div>}
                      {!isLoadingProjectChats && childChats.slice(0, 8).map((chat) => (
                        <button
                          key={chat.id}
                          type="button"
                          className={`m-sb__chat-child${activeProjectChatId === chat.id ? ' m-sb__chat-child--active' : ''}`}
                          onClick={() => onProjectChatOpen(session.id, chat.id)}
                        >
                          <span className="m-sb__chat-branch" />
                          <span className="m-sb__chat-title">{chat.title}</span>
                          <span className="m-sb__chat-time">{formatRelativeTime(chat.lastActivityAt)}</span>
                        </button>
                      ))}
                      {!isLoadingProjectChats && childChats.length === 0 && (
                        <button type="button" className="m-sb__chat-child m-sb__chat-child--empty" onClick={() => onProjectOpen(session.id, 'chats')}>
                          <span className="m-sb__chat-branch" />
                          <span className="m-sb__chat-title">No chats yet</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      <div className="m-sb__footer">
        <span className="m-sb__avatar">{userInitial}</span>
        <div>
          <div className="m-sb__footer-name">{user.email.split('@')[0] || 'ARIS'}</div>
          <div className="m-sb__footer-meta">{user.role}</div>
        </div>
      </div>
      {hoveredProject && tipPosition ? (() => {
        const statusKey = statusClass(hoveredProject.status);
        const previewIndex = projects.indexOf(hoveredProject);
        const lastUserText = createChatPreview(hoveredProject, previewIndex >= 0 ? previewIndex : 0);
        return (
          <div
            id="sb-tip"
            role="tooltip"
            aria-hidden={false}
            className={`sb-tip sb-tip--visible sb-tip--${statusKey}`}
            style={{ top: tipPosition.top, left: tipPosition.left }}
          >
            <div className="sb-tip__title">{displayProjectName(hoveredProject)}</div>
            <div className="sb-tip__meta">
              <span className="sb-tip__meta-time">{formatRelativeTime(hoveredProject.lastActivityAt)}</span>
              <span className="sb-tip__status">
                <span className="sb-tip__status-dot" />
                <span>{projectStatusLabel(hoveredProject.status)}</span>
              </span>
            </div>
            <div className="sb-tip__last">
              <div className="sb-tip__last-label">
                <MessageSquareText size={10} /> Last user message
              </div>
              <div className="sb-tip__last-text">{lastUserText}</div>
            </div>
          </div>
        );
      })() : null}
    </aside>
  );
}

function Topbar({ activeTab, sessions }: { activeTab: TabType; sessions: SessionSummary[] }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const activeProjects = sessions.filter((session) => session.status === 'running' || session.status === 'error').length;
  const copy: Record<TabType, { title: string; crumb: string }> = {
    home: { title: 'Home', crumb: 'workspace overview' },
    ask: { title: 'Ask ARIS', crumb: 'global memory' },
    project: { title: 'Projects', crumb: `${activeProjects} active · project chats in sidebar` },
    files: { title: 'Files', crumb: 'project filesystem' },
  };

  useEffect(() => {
    const mode = readThemeMode();
    setThemeMode(mode);
    applyTheme(mode);
  }, []);

  useEffect(() => {
    if (themeMode !== 'system') {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      applyTheme('system');
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
    } else {
      media.addListener(sync);
    }
    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', sync);
      } else {
        media.removeListener(sync);
      }
    };
  }, [themeMode]);

  const changeThemeMode = (next: ThemeMode) => {
    setThemeMode(next);
    applyTheme(next);
  };

  return (
    <header className="m-top">
      <div className="m-top__left">
        <span className="m-top__title">{copy[activeTab].title}</span>
        <span className="m-top__crumb">{copy[activeTab].crumb}</span>
      </div>
      <div className="m-top__right">
        {activeTab === 'project' && (
          <button type="button" className="btn btn--primary btn--sm">
            <Plus size={14} />
            New project
          </button>
        )}
        <div className="m-theme-toggle" role="group" aria-label="테마 선택">
          {THEME_OPTIONS.map(({ mode, label, Icon }) => {
            const active = themeMode === mode;
            return (
              <button
                key={mode}
                type="button"
                className={`m-theme-toggle__item${active ? ' m-theme-toggle__item--active' : ''}`}
                aria-pressed={active}
                aria-label={`${label} 테마`}
                title={`${label} 테마`}
                onClick={() => changeThemeMode(mode)}
              >
                <Icon size={13} />
                <span className="m-theme-toggle__label">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}

function HomeOrb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let teardown: (() => void) | null = null;

    void import('three').then((THREE) => {
      const canvas = canvasRef.current;
      if (disposed || !canvas) {
        return;
      }

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-2.2, 2.2, 2.2, -2.2, 0.1, 10);
      camera.position.z = 4;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'low-power',
      });
      renderer.setClearAlpha(0);

      const cameraSpan = 2.2;
      const orbRadiusRatio = 0.42;
      const pointCount = 420;
      const dotRadiusBase = 0.5;
      const dotRadiusDepth = 1.7;
      const sphereRadius = cameraSpan * 2 * orbRadiusRatio;
      const phi = Math.PI * (Math.sqrt(5) - 1);
      const positions = new Float32Array(pointCount * 3);

      for (let index = 0; index < pointCount; index += 1) {
        const y = 1 - (index / (pointCount - 1)) * 2;
        const radius = Math.sqrt(1 - y * y);
        const theta = phi * index;
        positions[index * 3] = Math.cos(theta) * radius * sphereRadius;
        positions[index * 3 + 1] = y * sphereRadius;
        positions[index * 3 + 2] = Math.sin(theta) * radius * sphereRadius;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color('#2563eb') },
          uPixelRatio: { value: 1 },
          uSphereRadius: { value: sphereRadius },
          uDotRadiusBase: { value: dotRadiusBase },
          uDotRadiusDepth: { value: dotRadiusDepth },
        },
        vertexShader: `
          uniform float uPixelRatio;
          uniform float uSphereRadius;
          uniform float uDotRadiusBase;
          uniform float uDotRadiusDepth;
          varying float vDepth;

          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vDepth = clamp((worldPosition.z + uSphereRadius) / (uSphereRadius * 2.0), 0.0, 1.0);
            gl_PointSize = (uDotRadiusBase + vDepth * uDotRadiusDepth) * 2.0 * uPixelRatio;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying float vDepth;

          void main() {
            float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
            float circle = 1.0 - smoothstep(0.42, 0.5, distanceFromCenter);
            if (circle <= 0.01) {
              discard;
            }
            float alpha = (0.08 + vDepth * 0.55) * circle;
            gl_FragColor = vec4(uColor, alpha);
          }
        `,
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);

      let pointerX = 0;
      let pointerY = 0;
      let tiltX = 0;
      let tiltY = 0;
      let angleY = 0;
      let frameId = 0;
      let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const applyOrbTheme = () => {
        const dark = document.documentElement.dataset.theme === 'dark';
        material.uniforms.uColor.value.set(dark ? '#c8dcff' : '#2563eb');
      };

      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        const aspect = width / height;
        const span = cameraSpan;
        if (aspect >= 1) {
          camera.left = -span * aspect;
          camera.right = span * aspect;
          camera.top = span;
          camera.bottom = -span;
        } else {
          camera.left = -span;
          camera.right = span;
          camera.top = span / aspect;
          camera.bottom = -span / aspect;
        }
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      };

      const handlePointer = (event: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        pointerX = ((event.clientX - rect.left - rect.width / 2) / rect.width) * 0.6;
        pointerY = ((event.clientY - rect.top - rect.height / 2) / rect.height) * 0.6;
      };

      const handleMotionPreference = (event: MediaQueryListEvent) => {
        reducedMotion = event.matches;
      };

      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      const observer = new MutationObserver(applyOrbTheme);

      const render = () => {
        tiltX += (pointerY - tiltX) * 0.05;
        tiltY += (pointerX - tiltY) * 0.05;
        if (!reducedMotion) {
          angleY += 0.003;
        }
        points.rotation.y = angleY + tiltY * 0.8;
        points.rotation.x = tiltX * 0.6;
        renderer.render(scene, camera);
        frameId = window.requestAnimationFrame(render);
      };

      resize();
      applyOrbTheme();
      window.addEventListener('resize', resize);
      window.addEventListener('mousemove', handlePointer);
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', handleMotionPreference);
      } else {
        media.addListener(handleMotionPreference);
      }
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      render();

      teardown = () => {
        window.cancelAnimationFrame(frameId);
        window.removeEventListener('resize', resize);
        window.removeEventListener('mousemove', handlePointer);
        if (typeof media.removeEventListener === 'function') {
          media.removeEventListener('change', handleMotionPreference);
        } else {
          media.removeListener(handleMotionPreference);
        }
        observer.disconnect();
        geometry.dispose();
        material.dispose();
        renderer.dispose();
      };
    });

    return () => {
      disposed = true;
      teardown?.();
    };
  }, []);

  return <canvas ref={canvasRef} className="home-orb" aria-hidden="true" data-orb-scene="dot-globe" />;
}

function CommandConsole() {
  const reducedMotion = usePrefersReducedMotion();
  const [lines, setLines] = useState<CmdConsoleLine[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const lineIdRef = useRef(0);
  const scriptIndexRef = useRef(0);

  useEffect(() => {
    const clearScheduledTimeouts = () => {
      timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutsRef.current = [];
    };

    if (reducedMotion) {
      clearScheduledTimeouts();
      setLines([]);
      return clearScheduledTimeouts;
    }

    let disposed = false;

    const schedule = (callback: () => void, delay: number) => {
      const timeoutId = window.setTimeout(() => {
        timeoutsRef.current = timeoutsRef.current.filter((id) => id !== timeoutId);
        callback();
      }, delay);
      timeoutsRef.current.push(timeoutId);
    };

    const appendOutputs = (outputs: CmdConsoleOutput[], index: number, runNext: () => void) => {
      if (disposed) return;
      if (index >= outputs.length) {
        schedule(runNext, randomBetween(900, 1600));
        return;
      }

      const output = outputs[index];
      const outputId = `cmd-console-${lineIdRef.current}`;
      lineIdRef.current += 1;
      setLines((previous) => trimConsoleLines([
        ...previous,
        {
          id: outputId,
          prompt: false,
          text: output.text,
          kind: output.kind ?? 'out',
          caret: false,
        },
      ]));
      schedule(() => appendOutputs(outputs, index + 1, runNext), randomBetween(140, 300));
    };

    const typeCommand = (promptId: string, command: string, index: number, outputs: CmdConsoleOutput[], runNext: () => void) => {
      if (disposed) return;
      if (index > command.length) {
        schedule(() => {
          setLines((previous) => previous.map((line) => line.id === promptId ? { ...line, caret: false } : line));
          appendOutputs(outputs, 0, runNext);
        }, 180);
        return;
      }

      setLines((previous) => previous.map((line) => line.id === promptId ? { ...line, text: command.slice(0, index) } : line));
      schedule(() => typeCommand(promptId, command, index + 1, outputs, runNext), randomBetween(30, 58));
    };

    const runNextSequence = () => {
      if (disposed) return;
      const [command, outputs] = CMD_CONSOLE_SCRIPT[scriptIndexRef.current % CMD_CONSOLE_SCRIPT.length];
      scriptIndexRef.current += 1;
      const promptId = `cmd-console-${lineIdRef.current}`;
      lineIdRef.current += 1;

      setLines((previous) => trimConsoleLines([
        ...previous.map((line) => ({ ...line, caret: false })),
        {
          id: promptId,
          prompt: true,
          text: '',
          kind: 'out',
          caret: true,
        },
      ]));
      schedule(() => typeCommand(promptId, command, 1, outputs, runNextSequence), randomBetween(220, 500));
    };

    schedule(runNextSequence, randomBetween(500, 900));

    return () => {
      disposed = true;
      clearScheduledTimeouts();
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    return null;
  }

  return (
    <div className="cmd-console" aria-hidden="true">
      <div className="cmd-console__viewport">
        {lines.map((line) => {
          const kindClass = line.kind === 'ok'
            ? ' cmd-console__line--out--ok'
            : line.kind === 'info'
              ? ' cmd-console__line--out--info'
              : line.kind === 'warn'
                ? ' cmd-console__line--out--warn'
                : '';
          const className = `cmd-console__line${line.prompt ? ' cmd-console__line--prompt' : ` cmd-console__line--out${kindClass}`}`;
          return (
            <div key={line.id} className={className}>
              {line.prompt && <span className="cmd-console__line__prompt">$</span>}
              <span className="cmd-console__line__text">{line.text}</span>
              {line.caret && <span className="cmd-console__line__caret" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HomeStat({
  label,
  value,
  unit,
  delta,
  percent,
  Icon,
}: {
  label: string;
  value: string;
  unit: string;
  delta: string;
  percent: number;
  Icon: typeof Activity;
}) {
  return (
    <div className="home-stat">
      <div className="home-stat__label"><Icon size={12} />{label}</div>
      <div className="home-stat__val">
        {value}
        <span className="home-stat__unit">{unit}</span>
        <span className="home-stat__delta">{delta}</span>
      </div>
      <div className="home-stat__bar"><span style={{ width: `${clampPercent(percent)}%` }} /></div>
    </div>
  );
}

function HomeSurface({
  metrics,
  onProjectOpen,
  sessions,
  user,
}: {
  metrics: RuntimeMetrics | null;
  onProjectOpen: (sessionId: string, view?: ProjectView) => void;
  sessions: SessionSummary[];
  user: AuthenticatedUser;
}) {
  const projects = selectRecentProjects(sessions);
  const running = sessions.filter((session) => session.status === 'running').length;
  const needsReview = sessions.filter((session) => session.status === 'error').length;
  const idle = sessions.filter((session) => session.status === 'idle' || session.status === 'stopped').length;
  const ramUsed = metrics?.ram.usedBytes && metrics?.ram.totalBytes
    ? `${formatBytes(metrics.ram.usedBytes)}`
    : `${Math.round(metrics?.ram.percent ?? 0)}`;
  const ramUnit = metrics?.ram.usedBytes && metrics?.ram.totalBytes
    ? `/ ${formatBytes(metrics.ram.totalBytes)}`
    : '%';
  const storageUsed = metrics?.storage.usedBytes && metrics?.storage.totalBytes
    ? `${formatBytes(metrics.storage.usedBytes)}`
    : `${Math.round(metrics?.storage.percent ?? 0)}`;
  const storageUnit = metrics?.storage.usedBytes && metrics?.storage.totalBytes
    ? `/ ${formatBytes(metrics.storage.totalBytes)}`
    : '%';
  const mBodyRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const element = mBodyRef.current;
    if (!element) return;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      element.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      element.style.setProperty('--my', `${event.clientY - rect.top}px`);
    };

    element.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      element.removeEventListener('mousemove', handleMouseMove);
    };
  }, [reducedMotion]);

  return (
    <div ref={mBodyRef} className="m-body m-body--home">
      <CommandConsole />
      <HomeOrb />
      <div className="home-acronym" aria-label="Agentic Runtime Integration System">
        <div className="home-acronym__line"><span className="home-acronym__lead">A</span><span className="home-acronym__rest">gentic</span></div>
        <div className="home-acronym__line"><span className="home-acronym__lead">R</span><span className="home-acronym__rest">untime</span></div>
        <div className="home-acronym__line"><span className="home-acronym__lead">I</span><span className="home-acronym__rest">ntegration</span></div>
        <div className="home-acronym__line"><span className="home-acronym__lead">S</span><span className="home-acronym__rest">ystem</span></div>
      </div>
      <h1 className="home-greet">안녕하세요, {user.email.split('@')[0] || 'ARIS'}님.</h1>
      <p className="home-greet-sub">
        지금 실행 중인 에이전트 <strong>{running}개</strong> · 승인 대기 <strong>{needsReview}건</strong> · 유휴 프로젝트 <strong>{idle}개</strong>.
      </p>

      <section className="home-strip" aria-label="System metrics">
        <HomeStat label="Network I/O" value="248" unit="Mbps" delta="live" percent={25} Icon={Wifi} />
        <HomeStat label="CPU" value={`${Math.round(metrics?.cpu.percent ?? 0)}`} unit="%" delta="runtime" percent={metrics?.cpu.percent ?? 0} Icon={Cpu} />
        <HomeStat label="Memory" value={ramUsed} unit={ramUnit} delta={`${Math.round(metrics?.ram.percent ?? 0)}%`} percent={metrics?.ram.percent ?? 0} Icon={Database} />
        <HomeStat label="Disk" value={storageUsed} unit={storageUnit} delta={`${Math.round(metrics?.storage.percent ?? 0)}%`} percent={metrics?.storage.percent ?? 0} Icon={HardDrive} />
      </section>

      <div className="home-grid-head">
        <h2>Recent Project</h2>
        <button type="button" onClick={() => navigateTo('/?tab=project')}>View all</button>
      </div>
      <section className="home-grid" aria-label="Recent Project">
        {projects.map((session, index) => (
          <button
            key={session.id}
            type="button"
            className="home-proj"
            data-project-href={buildProjectDetailPath(session.id)}
            onClick={() => onProjectOpen(session.id)}
          >
            <div className="home-proj__head">
              <div>
                <div className="home-proj__title">{displayProjectName(session)}</div>
                <div className="home-proj__path">{displayProjectPath(session)}</div>
              </div>
              <ChevronRight size={15} />
            </div>
            <div className="home-proj__chats">
              <div className="home-proj__chat">
                <span className={`home-proj__chat-dot home-proj__chat-dot--${statusClass(session.status)}`} />
                <div className="home-proj__chat-body">
                  <div className="home-proj__chat-title">{session.alias || displayProjectName(session)}</div>
                  <div className="home-proj__chat-last">{createChatPreview(session, index)}</div>
                </div>
              </div>
              <div className="home-proj__chat">
                <span className="home-proj__chat-dot home-proj__chat-dot--done" />
                <div className="home-proj__chat-body">
                  <div className="home-proj__chat-title">{session.agent} · {session.model || session.metadata?.runtimeModel || 'default model'}</div>
                  <div className="home-proj__chat-last">최근 채팅과 파일 맥락이 이 프로젝트에 연결되어 있습니다.</div>
                </div>
              </div>
            </div>
            <div className="home-proj__foot">
              <span>{session.totalChats ?? 0} chats</span>
              <span>{formatRelativeTime(session.lastActivityAt)}</span>
            </div>
          </button>
        ))}
      </section>

      <div className="home-grid-head">
        <h2>Recent activity</h2>
        <button type="button">All events</button>
      </div>
      <section className="home-feed" aria-label="Recent activity">
        {projects.slice(0, 4).map((session, index) => (
          <button key={session.id} type="button" className="home-feed-row" onClick={() => onProjectOpen(session.id, 'chats')}>
            <span className={`home-feed-avatar ${index % 2 === 0 ? 'home-feed-avatar--c' : 'home-feed-avatar--u'}`}>
              {index % 2 === 0 ? session.agent.slice(0, 1).toUpperCase() : (user.email[0] || 'U').toUpperCase()}
            </span>
            <span className="home-feed-body">
              <span className="home-feed-head">
                <span className="home-feed-actor">{index % 2 === 0 ? session.agent : user.email.split('@')[0]}</span>
                <span className="home-feed-proj">{displayProjectName(session)}</span>
                <span className="home-feed-time">{formatRelativeTime(session.lastActivityAt)}</span>
              </span>
              <span className="home-feed-text">{createChatPreview(session, index)}</span>
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}

function AskSurface({ sessions }: { sessions: SessionSummary[] }) {
  const [query, setQuery] = useState('');
  const recentAsks = buildRecentAsks(sessions);

  return (
    <div className="m-body">
      <section className="ask" aria-labelledby="ask-title">
        <div className="ask-empty">
          <h1 id="ask-title" className="ask-title">무엇이든 물어보세요.</h1>
          <p className="ask-sub">
            프로젝트를 고르지 않아도 됩니다. 과거 채팅 전체가 컨텍스트 소스가 되고, 모델은 필요할 때 어떤 프로젝트에서 왔는지까지 인용합니다.
          </p>
          <form
            className="ask-search"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="지난 결정, 배포 맥락, 파일 변경 이유를 물어보세요."
            />
            <button type="submit" className="comp-v2__send">
              <Send size={13} />
              Ask
            </button>
          </form>
          <div className="ask-eyebrow">Suggested</div>
          <div className="ask-grid">
            {SUGGESTED_ASKS.map((prompt, index) => {
              const icons = [Check, Sparkles, Activity, AlertCircle];
              const Icon = icons[index] ?? Check;
              return (
                <button key={prompt} type="button" className="ask-sug" onClick={() => setQuery(prompt)}>
                  <span className="ask-sug__ico"><Icon size={12} /></span>
                  {prompt}
                </button>
              );
            })}
          </div>
        </div>
        <div className="ask-recent">
          <div className="ask-eyebrow">Recent asks</div>
          {recentAsks.map((item) => (
            <button key={item.question} type="button" className="ask-recent-item" onClick={() => setQuery(item.question)}>
              <Clock3 size={14} />
              <span className="ask-recent-item__q">{item.question}</span>
              <span className="ask-recent-item__meta">{item.meta}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProjectDetailSurface({
  index,
  onBackToProjects,
  onProjectChatOpen,
  onProjectViewChange,
  projectView,
  selectedChatId,
  session,
}: {
  index: number;
  onBackToProjects: () => void;
  onProjectChatOpen: (chatId: string) => void;
  onProjectViewChange: (view: ProjectView) => void;
  projectView: ProjectView;
  selectedChatId: string | null;
  session: SessionSummary;
}) {
  const projectName = displayProjectName(session);
  const projectPath = displayProjectPath(session);
  const status = statusClass(session.status);
  const totalChats = session.totalChats ?? 0;
  const activeChats = session.status === 'running' || session.status === 'error' ? 1 : 0;
  const fileCount = deriveProjectFileCount(session, index);
  const tokenLabel = deriveProjectTokenLabel(session, index);
  const modelLabel = session.model || session.metadata?.runtimeModel || 'default model';
  const recentPreview = createChatPreview(session, index);
  const [isCreatingHeaderChat, setIsCreatingHeaderChat] = useState(false);
  const [headerCreateError, setHeaderCreateError] = useState<string | null>(null);

  const handleProjectHeaderNewChat = async () => {
    if (isCreatingHeaderChat) return;
    setIsCreatingHeaderChat(true);
    setHeaderCreateError(null);
    try {
      const createdChat = await createProjectSessionChat(session.id, {
        title: `Chat ${Math.max(1, totalChats + 1)}`,
        agent: session.agent,
        model: modelLabel,
        modelReasoningEffort: serializeReasoningEffort('High'),
      });
      onProjectChatOpen(createdChat.id);
    } catch (createError) {
      setHeaderCreateError(createError instanceof Error ? createError.message : '새 채팅을 만들지 못했습니다.');
    } finally {
      setIsCreatingHeaderChat(false);
    }
  };

  if (projectView === 'chat') {
    return (
      <div className="m-main-scroll m-main-scroll--project-chat-detail">
        <ProjectChatSurface
          fileCount={fileCount}
          modelLabel={modelLabel}
          onBackToChatList={() => onProjectViewChange('chats')}
          onChatOpen={onProjectChatOpen}
          projectName={projectName}
          projectPath={projectPath}
          recentPreview={recentPreview}
          selectedChatId={selectedChatId}
          session={session}
          tokenLabel={tokenLabel}
        />
      </div>
    );
  }

  return (
    <div className="m-main-scroll m-main-scroll--project-detail">
      <section className="proj-head" aria-label={`${projectName} project overview`}>
        <div className="proj-head__row">
          <div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onBackToProjects}>
              <ChevronLeft size={14} />
              Projects
            </button>
            <h1 className="proj-head__title">{projectName}</h1>
            <div className="proj-head__path">
              {projectPath}
              <span className={`proj-head__path-status--${status}`}>● {projectStatusLabel(session.status)}</span>
            </div>
          </div>
          <div className="proj-head__actions">
            <button type="button" className="btn btn--secondary btn--sm">
              <Monitor size={14} />
              Open in IDE
            </button>
            <button type="button" className="btn btn--secondary btn--sm">
              <PanelsTopLeft size={14} />
              Settings
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={handleProjectHeaderNewChat}
              disabled={isCreatingHeaderChat}
              aria-busy={isCreatingHeaderChat}
            >
              <Plus size={14} />
              New chat
            </button>
          </div>
        </div>
        {headerCreateError && <div className="pc-chat-error" role="alert">{headerCreateError}</div>}
        <div className="proj-stats">
          <div>
            <div className="proj-stat-label">Chats</div>
            <div className="proj-stat-value">
              {totalChats}
              {activeChats > 0 && <span className="proj-stat-value-sub">· {activeChats} active</span>}
            </div>
          </div>
          <div>
            <div className="proj-stat-label">Files tracked</div>
            <div className="proj-stat-value">{fileCount}</div>
          </div>
          <div>
            <div className="proj-stat-label">Last activity</div>
            <div className="proj-stat-value">{formatRelativeTime(session.lastActivityAt)}</div>
          </div>
          <div>
            <div className="proj-stat-label">Tokens used</div>
            <div className="proj-stat-value">{tokenLabel}</div>
          </div>
        </div>
        <div className="proj-docs">
          <article className="proj-doc">
            <div className="proj-doc__eyebrow">Project instructions</div>
            <div className="proj-doc__body">
              <p>작업 시작 전 프로젝트 지침과 최근 결정 맥락을 먼저 확인합니다.</p>
              <p>모든 변경은 전용 브랜치와 git worktree에서 분리해 진행합니다.</p>
              <p>모바일 UI 변경은 overflow 회귀를 기본 검증에 포함합니다.</p>
              <p>배포는 공식 스크립트와 런타임 헬스 체크로 확인합니다.</p>
            </div>
            <button type="button" className="proj-doc__more">전체 보기 →</button>
          </article>
          <article className="proj-doc">
            <div className="proj-doc__eyebrow">Project memory</div>
            <div className="proj-doc__body">
              <p>{projectName}의 최근 채팅과 실행 이력이 이 홈에 묶입니다.</p>
              <p>활성 작업, 결정 사항, 파일 힌트를 프로젝트 단위로 재진입합니다.</p>
              <p>모델과 에이전트 선택, 최근 실행 결과를 함께 유지합니다.</p>
              <p>다음 작업 시작 시 같은 프로젝트 맥락을 이어받습니다.</p>
            </div>
            <button type="button" className="proj-doc__more">전체 보기 →</button>
          </article>
        </div>
      </section>

      <nav className="proj-tabs" aria-label={`${projectName} project sections`}>
        <button
          type="button"
          className={`proj-tab${projectView === 'overview' ? ' proj-tab--active' : ''}`}
          onClick={() => onProjectViewChange('overview')}
        >
          <PanelsTopLeft size={14} />
          Overview
        </button>
        <button
          type="button"
          className={`proj-tab${projectView === 'chats' ? ' proj-tab--active' : ''}`}
          onClick={() => onProjectViewChange('chats')}
        >
          <MessageSquareText size={14} />
          Chats
          <span className="proj-tab__count">{totalChats}</span>
        </button>
        <button
          type="button"
          className={`proj-tab${projectView === 'files' ? ' proj-tab--active' : ''}`}
          onClick={() => onProjectViewChange('files')}
        >
          <FileText size={14} />
          Files
          <span className="proj-tab__count">{fileCount}</span>
        </button>
        <button
          type="button"
          className={`proj-tab${projectView === 'context' ? ' proj-tab--active' : ''}`}
          onClick={() => onProjectViewChange('context')}
        >
          <Database size={14} />
          Context
          <span className="proj-tab__count">6</span>
        </button>
      </nav>

      <section className="proj-pane">
        {projectView === 'chats' ? (
          <ProjectChatSurface
            fileCount={fileCount}
            modelLabel={modelLabel}
            onBackToChatList={() => onProjectViewChange('chats')}
            onChatOpen={onProjectChatOpen}
            projectName={projectName}
            projectPath={projectPath}
            recentPreview={recentPreview}
            selectedChatId={selectedChatId}
            session={session}
            tokenLabel={tokenLabel}
          />
        ) : projectView === 'files' ? (
          <ProjectPlaceholderPanel
            Icon={FileText}
            title="Files"
            eyebrow={`${fileCount} tracked files`}
            body={`${projectPath}의 작업 파일과 첨부 맥락을 프로젝트 화면 안에서 이어서 다룰 예정입니다.`}
          />
        ) : projectView === 'context' ? (
          <ProjectPlaceholderPanel
            Icon={Database}
            title="Context"
            eyebrow="6 linked assets"
            body={`${projectName}의 런타임 메모리, 최근 결정, 작업 지침을 같은 프로젝트 범위로 묶습니다.`}
          />
        ) : (
        <div className="proj-overview">
          <div className="proj-chats">
            <button type="button" className="proj-chat" onClick={() => onProjectViewChange('chats')}>
              <div className="proj-chat__head">
                <div className="proj-chat__title">{session.alias || projectName}</div>
                <div className="proj-chat__time">{formatRelativeTime(session.lastActivityAt)}</div>
              </div>
              <div className="proj-chat__preview">{recentPreview}</div>
              <div className="proj-chat__meta">
                <span className={`badge badge--dot ${projectStatusBadgeClass(session.status)}`}>{projectStatusLabel(session.status)}</span>
                <span>{session.agent} · {modelLabel}</span>
                <span>{tokenLabel} · project scope</span>
              </div>
            </button>
            <article className="proj-card">
              <div className="proj-card__title">
                <Clock3 size={14} />
                Recent decisions
              </div>
              <div className="proj-item">
                <span className="proj-item__ico proj-item__ico--done">✓</span>
                <div className="proj-item__body">
                  <div className="proj-item__title">최근 작업 범위를 프로젝트 단위로 고정</div>
                  <div className="proj-item__meta">Project context · workspace scope</div>
                </div>
              </div>
              <div className="proj-item">
                <span className="proj-item__ico proj-item__ico--done">✓</span>
                <div className="proj-item__body">
                  <div className="proj-item__title">배포 전 런타임 헬스 체크 유지</div>
                  <div className="proj-item__meta">deploy · health · runtime token</div>
                </div>
              </div>
              <div className="proj-item">
                <span className="proj-item__ico proj-item__ico--idle">·</span>
                <div className="proj-item__body">
                  <div className="proj-item__title">{projectPath}</div>
                  <div className="proj-item__meta">workspace path</div>
                </div>
              </div>
            </article>
          </div>

          <aside className="proj-side">
            <article className="proj-card">
              <div className="proj-card__title">
                <Sparkles size={14} />
                Active signal
              </div>
              <div className="proj-item">
                <span className={`proj-item__ico proj-item__ico--${status}`}>{status === 'appr' ? '!' : '●'}</span>
                <div className="proj-item__body">
                  <div className="proj-item__title">{projectStatusLabel(session.status)}</div>
                  <div className="proj-item__meta">{recentPreview}</div>
                </div>
              </div>
            </article>
            <article className="proj-card">
              <div className="proj-card__title">
                <FolderOpen size={14} />
                Pinned files
              </div>
              <div className="proj-item proj-item--file">
                <FileText size={13} />
                <div className="proj-item__body">
                  <div className="proj-item__title">AGENTS.md</div>
                </div>
              </div>
              <div className="proj-item proj-item--file">
                <FileText size={13} />
                <div className="proj-item__body">
                  <div className="proj-item__title">docs/design/aris-ia-v3.html</div>
                </div>
              </div>
            </article>
            <article className="proj-card">
              <div className="proj-card__title">
                <Activity size={14} />
                Context assets
              </div>
              <div className="proj-item">
                <span className="proj-item__ico proj-item__ico--done">#</span>
                <div className="proj-item__body">
                  <div className="proj-item__title">Runtime memory</div>
                  <div className="proj-item__meta">{Math.max(1, totalChats)} linked chats</div>
                </div>
              </div>
              <div className="proj-item">
                <span className="proj-item__ico proj-item__ico--idle">~</span>
                <div className="proj-item__body">
                  <div className="proj-item__title">Workspace snippets</div>
                  <div className="proj-item__meta">commands · deploy · tests</div>
                </div>
              </div>
            </article>
          </aside>
        </div>
        )}
      </section>
    </div>
  );
}

function readEventRole(event: UiEvent): 'user' | 'agent' {
  return event.meta?.role === 'user' ? 'user' : 'agent';
}

function getEventText(event: UiEvent): string {
  return event.result?.preview || event.body || event.title;
}

function agentLabel(agent: SessionSummary['agent'], model?: string | null): string {
  const provider = agent === 'claude' ? 'Claude' : agent === 'gemini' ? 'Gemini' : agent === 'codex' ? 'Codex' : 'Agent';
  return model ? `${provider} · ${model}` : provider;
}

function agentAvatarClass(agent: SessionSummary['agent'] | SessionChat['agent']): string {
  if (agent === 'claude') return 'msg__avatar--claude';
  if (agent === 'gemini') return 'msg__avatar--gemini';
  if (agent === 'codex') return 'msg__avatar--codex';
  return 'msg__avatar--sys';
}

function agentInitial(agent: SessionSummary['agent'] | SessionChat['agent']): string {
  if (agent === 'claude') return 'C';
  if (agent === 'gemini') return 'G';
  if (agent === 'codex') return 'GPT';
  return 'A';
}

function isToolLikeEvent(event: UiEvent): boolean {
  return event.kind !== 'text_reply'
    && event.kind !== 'unknown'
    || Boolean(event.action?.command || event.action?.path || event.parsed?.commands?.length);
}

function eventCommand(event: UiEvent): string {
  return event.action?.command
    || event.parsed?.commands?.[0]
    || event.action?.path
    || event.result?.preview
    || event.body
    || event.title;
}

function ProjectPlaceholderPanel({
  Icon,
  body,
  eyebrow,
  title,
}: {
  Icon: typeof FileText;
  body: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <article className="proj-empty-panel">
      <span className="proj-empty-panel__icon"><Icon size={18} /></span>
      <div>
        <div className="proj-empty-panel__eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
    </article>
  );
}

function ProjectChatSurface({
  fileCount,
  modelLabel,
  onBackToChatList,
  onChatOpen,
  projectName,
  projectPath,
  recentPreview,
  selectedChatId,
  session,
  tokenLabel,
}: {
  fileCount: number;
  modelLabel: string;
  onBackToChatList: () => void;
  onChatOpen: (chatId: string) => void;
  projectName: string;
  projectPath: string;
  recentPreview: string;
  selectedChatId: string | null;
  session: SessionSummary;
  tokenLabel: string;
}) {
  const [chats, setChats] = useState<SessionChat[]>([]);
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeChat = selectedChatId ? chats.find((chat) => chat.id === selectedChatId) ?? null : null;
  const runtimeModelLabel = activeChat?.model ?? modelLabel;
  const runtimeAgent = activeChat?.agent ?? session.agent;
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const workspaceToggleRef = useRef<HTMLButtonElement | null>(null);
  const workspaceCloseTimerRef = useRef<number | null>(null);
  const [composerMode, setComposerMode] = useState<ComposerMode>('agent');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('run');
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [workspaceDrawerPhase, setWorkspaceDrawerPhase] = useState<'idle' | 'closing'>('idle');
  const [workspaceLayoutReady, setWorkspaceLayoutReady] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>('dock');
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>(() => providerFromAgent(runtimeAgent));
  const [selectedModel, setSelectedModel] = useState(runtimeModelLabel);
  const [selectedEffort, setSelectedEffort] = useState<ReasoningEffort>(() => normalizeReasoningEffort(activeChat?.modelReasoningEffort));
  const [expandedTurnId, setExpandedTurnId] = useState<ExpandedTurnState>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState('HomePageClient.tsx');
  const [draftTerminalCommand, setDraftTerminalCommand] = useState('npm test -- --run tests/projectListSurface.test.ts');
  const [previewDevice, setPreviewDevice] = useState<'1200' | '768' | '390'>('1200');
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const visibleEvents = events.slice(-40);
  const activeModelLabel = selectedModel || runtimeModelLabel;
  const activeAgent: SessionSummary['agent'] = selectedProvider;
  const userTurns = visibleEvents.filter((item) => readEventRole(item) === 'user');
  const representativeAgentEvent = visibleEvents.find((item) => readEventRole(item) !== 'user');
  const hasRuntimeEvents = visibleEvents.length > 0;
  const selectedChatPreview = (activeChat?.latestPreview ?? recentPreview).trim()
    || '프로젝트 맥락을 이어서 다루기 위한 채팅입니다.';
  const selectedChatTimestamp = activeChat?.latestEventAt
    ?? activeChat?.lastActivityAt
    ?? session.lastActivityAt
    ?? new Date().toISOString();
  const projectChatRoute = `/?tab=project&project=${session.id}&view=chat${selectedChatId ? `&chat=${selectedChatId}` : ''}`;
  const previewTarget = `aris.lawdigest.cloud${projectChatRoute}`;
  const prototypeRef = useRef<HTMLDivElement | null>(null);
  const composerWrapRef = useRef<HTMLElement | null>(null);
  const workspaceFiles = [
    { id: 'root', name: projectPath, kind: 'dir', meta: 'project' },
    { id: 'home-client', name: 'services/aris-web/app/HomePageClient.tsx', kind: 'file', meta: '+ UI' },
    { id: 'ui-css', name: 'services/aris-web/app/styles/ui.css', kind: 'file', meta: '+ CSS' },
    { id: 'surface-test', name: 'services/aris-web/tests/projectListSurface.test.ts', kind: 'file', meta: '+ tests' },
    { id: 'prototype', name: 'design/chat-prototype.html', kind: 'file', meta: 'source' },
  ];
  const terminalSnippets = [
    { id: 'test', name: 'test target', cmd: 'npm test -- --run tests/projectListSurface.test.ts', tag: 'test' },
    { id: 'mobile', name: 'mobile guard', cmd: 'npm test -- --run tests/mobileOverflowLayout.test.ts', tag: 'mobile' },
    { id: 'typecheck', name: 'typecheck', cmd: 'npx tsc --noEmit', tag: 'type' },
    { id: 'build', name: 'build', cmd: 'npm run build', tag: 'build' },
  ];
  const contextItems = [
    { id: 'ctx-project', name: displayProjectName(session), tokens: tokenLabel },
    { id: 'ctx-route', name: projectChatRoute, tokens: 'route' },
    { id: 'ctx-prototype', name: 'design/chat-prototype.html', tokens: 'source' },
    { id: 'ctx-mode', name: `${COMPOSER_MODE_COPY[composerMode]} mode`, tokens: selectedEffort },
  ];
  const runStepItems = hasRuntimeEvents
    ? visibleEvents.slice(-4).map((item) => ({
      id: item.id,
      title: item.title || item.kind,
      cmd: eventCommand(item),
      time: formatRelativeTime(item.timestamp),
      state: 'done' as const,
    }))
    : [
      {
        id: 'seed-route',
        title: 'Route · project chat',
        cmd: projectChatRoute,
        time: 'now',
        state: 'done' as const,
      },
      {
        id: 'seed-context',
        title: 'Read · project context',
        cmd: projectPath,
        time: 'now',
        state: 'done' as const,
      },
      {
        id: 'seed-preview',
        title: 'Load · chat preview',
        cmd: selectedChatPreview,
        time: formatRelativeTime(selectedChatTimestamp),
        state: 'done' as const,
      },
      {
        id: 'seed-ready',
        title: 'Ready · next turn',
        cmd: 'composer is scoped to this project chat',
        time: 'now',
        state: 'running' as const,
      },
    ];
  const showTransientFeedback = (message: string) => {
    setCopyFeedback(message);
    window.setTimeout(() => {
      setCopyFeedback(null);
    }, 1800);
  };

  const handleCopy = (value: string, label: string) => {
    void copyToClipboard(value).then((copied) => {
      showTransientFeedback(copied ? `${label} copied` : `${label} ready`);
    });
  };

  const defaultWorkspaceOpen = () => !window.matchMedia('(max-width: 1100px)').matches;

  const clearWorkspaceCloseTimer = useCallback(() => {
    if (workspaceCloseTimerRef.current === null) return;
    window.clearTimeout(workspaceCloseTimerRef.current);
    workspaceCloseTimerRef.current = null;
  }, []);

  const setWorkspacePanelImmediate = useCallback((open: boolean) => {
    clearWorkspaceCloseTimer();
    setWorkspaceDrawerPhase('idle');
    setWorkspaceOpen(open);
  }, [clearWorkspaceCloseTimer]);

  const openWorkspacePanel = useCallback(() => {
    setWorkspacePanelImmediate(true);
  }, [setWorkspacePanelImmediate]);

  const closeWorkspacePanel = useCallback(() => {
    clearWorkspaceCloseTimer();
    setWorkspaceOpen(false);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setWorkspaceDrawerPhase('idle');
      return;
    }

    setWorkspaceDrawerPhase('closing');
    workspaceCloseTimerRef.current = window.setTimeout(() => {
      setWorkspaceDrawerPhase('idle');
      workspaceCloseTimerRef.current = null;
    }, WORKSPACE_DRAWER_CLOSE_MS);
  }, [clearWorkspaceCloseTimer]);

  const activateWorkspaceTab = (tab: WorkspaceTab) => {
    setWorkspaceTab(tab);
    openWorkspacePanel();
  };

  const toggleWorkspacePanel = () => {
    if (workspaceOpen) {
      closeWorkspacePanel();
      return;
    }
    openWorkspacePanel();
  };

  const handleJumpToLatest = () => {
    const targetId = visibleEvents.at(-1)?.id ?? 'seed-history-primary';
    setHighlightedMessageId(targetId);
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: 'smooth' });
    window.setTimeout(() => {
      setHighlightedMessageId(null);
    }, 1800);
  };

  const handleJumpToTurn = (turnId: string) => {
    setExpandedTurnId(turnId);
    setHighlightedMessageId(turnId);
    timelineRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => {
      setHighlightedMessageId(null);
    }, 1800);
  };
  const historyTurnItems = hasRuntimeEvents
    ? userTurns.slice(-3).map((item, turnIndex) => ({
      id: item.id,
      timestamp: item.timestamp,
      text: getEventText(item),
      open: turnIndex === 0,
      state: turnIndex === 0 ? 'running' : 'answered',
      agentText: representativeAgentEvent ? getEventText(representativeAgentEvent) : '프로젝트 맥락을 기준으로 응답을 준비합니다.',
    }))
    : [
      {
        id: 'seed-history-primary',
        timestamp: selectedChatTimestamp,
        text: selectedChatPreview,
        open: true,
        state: 'running',
        agentText: '프로젝트 컨텍스트를 기준으로 최근 대화와 작업 경로를 확인하고 있습니다.',
      },
      {
        id: 'seed-history-context',
        timestamp: selectedChatTimestamp,
        text: `${projectName} · ${projectPath}`,
        open: false,
        state: 'answered',
        agentText: '연결된 작업 경로와 채팅 기록을 불러왔습니다.',
      },
    ];
  const defaultExpandedTurnId = historyTurnItems[0]?.id ?? null;
  const visibleExpandedTurnId = expandedTurnId === '__none__'
    ? null
    : expandedTurnId ?? defaultExpandedTurnId;

  useEffect(() => () => {
    if (workspaceCloseTimerRef.current !== null) {
      window.clearTimeout(workspaceCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!workspaceOpen || workspaceDrawerPhase === 'closing') return;

    const handleWorkspaceOutsideClick = (event: PointerEvent) => {
      if (!window.matchMedia('(max-width: 1100px)').matches) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (workspaceRef.current?.contains(target)) return;
      if (workspaceToggleRef.current?.contains(target)) return;
      closeWorkspacePanel();
    };

    document.addEventListener('pointerdown', handleWorkspaceOutsideClick);
    return () => {
      document.removeEventListener('pointerdown', handleWorkspaceOutsideClick);
    };
  }, [closeWorkspacePanel, workspaceDrawerPhase, workspaceOpen]);

  useEffect(() => {
    if (!workspaceOpen || workspaceDrawerPhase === 'closing') return;

    const handleWorkspaceEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!window.matchMedia('(max-width: 1100px)').matches) return;
      closeWorkspacePanel();
    };

    document.addEventListener('keydown', handleWorkspaceEscape);
    return () => {
      document.removeEventListener('keydown', handleWorkspaceEscape);
    };
  }, [closeWorkspacePanel, workspaceDrawerPhase, workspaceOpen]);

  useEffect(() => {
    setComposerMode('agent');
    setWorkspaceTab('run');
    setWorkspacePanelImmediate(defaultWorkspaceOpen());
    setWorkspaceLayoutReady(true);
    setPreviewState('dock');
    setModelSelectorOpen(false);
    setSelectedProvider(providerFromAgent(runtimeAgent));
    setSelectedModel(runtimeModelLabel);
    setSelectedEffort(normalizeReasoningEffort(activeChat?.modelReasoningEffort));
    setExpandedTurnId(null);
    setCopyFeedback(null);
    setSelectedWorkspaceFile('HomePageClient.tsx');
    setDraftTerminalCommand('npm test -- --run tests/projectListSurface.test.ts');
  }, [activeChat?.modelReasoningEffort, runtimeAgent, runtimeModelLabel, selectedChatId, setWorkspacePanelImmediate]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)');
    const syncWorkspacePanel = () => {
      setWorkspacePanelImmediate(defaultWorkspaceOpen());
      setWorkspaceLayoutReady(true);
    };

    syncWorkspacePanel();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', syncWorkspacePanel);
    } else {
      media.addListener(syncWorkspacePanel);
    }

    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', syncWorkspacePanel);
      } else {
        media.removeListener(syncWorkspacePanel);
      }
    };
  }, [selectedChatId, setWorkspacePanelImmediate]);

  useEffect(() => {
    const prototypeNode = prototypeRef.current;
    const composerNode = composerWrapRef.current;
    if (!prototypeNode || !composerNode) return;

    const syncComposerHeight = () => {
      const height = Math.ceil(composerNode.getBoundingClientRect().height);
      prototypeNode.style.setProperty('--pc-composer-height', `${height}px`);
    };

    syncComposerHeight();
    window.addEventListener('resize', syncComposerHeight);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', syncComposerHeight);
      };
    }

    const composerObserver = new ResizeObserver(syncComposerHeight);
    composerObserver.observe(composerNode);

    return () => {
      composerObserver.disconnect();
      window.removeEventListener('resize', syncComposerHeight);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadChats() {
      setIsLoadingChats(true);
      setError(null);
      try {
        const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(session.id)}/chats`, { cache: 'no-store' });
        const body = (await response.json().catch(() => ({}))) as { chats?: SessionChat[]; error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? '채팅 목록을 불러오지 못했습니다.');
        }
        if (cancelled) return;
        const nextChats = body.chats ?? [];
        setChats(nextChats);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '채팅 목록을 불러오지 못했습니다.');
          setChats([]);
        }
      } finally {
        if (!cancelled) setIsLoadingChats(false);
      }
    }
    void loadChats();
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  useEffect(() => {
    if (!selectedChatId) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    const loadEvents = async (showLoading: boolean) => {
      if (showLoading) {
        setIsLoadingEvents(true);
      }
      try {
        const params = new URLSearchParams();
        params.set('limit', '40');
        params.set('chatId', selectedChatId);
        if (activeChat?.isDefault) {
          params.set('includeUnassigned', 'true');
        }
        const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(session.id)}/events?${params.toString()}`, { cache: 'no-store' });
        const body = (await response.json().catch(() => ({}))) as { events?: UiEvent[]; error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? '채팅 이벤트를 불러오지 못했습니다.');
        }
        if (!cancelled) {
          setEvents(body.events ?? []);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '채팅 이벤트를 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled && showLoading) {
          setIsLoadingEvents(false);
        }
      }
    };

    void loadEvents(true);
    const intervalId = window.setInterval(() => {
      void loadEvents(false);
    }, 3500);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeChat?.isDefault, selectedChatId, session.id]);

  const createChat = async (): Promise<SessionChat | null> => {
    setError(null);
    const createdChat = await createProjectSessionChat(session.id, {
      title: `Chat ${Math.max(1, chats.length + 1)}`,
      agent: selectedProvider,
      model: activeModelLabel,
      modelReasoningEffort: serializeReasoningEffort(selectedEffort),
    });
    setChats((previous) => [createdChat, ...previous.filter((chat) => chat.id !== createdChat.id)]);
    setEvents([]);
    onChatOpen(createdChat.id);
    return createdChat;
  };

  const handleNewChat = async () => {
    try {
      await createChat();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '새 채팅을 만들지 못했습니다.');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const chat = activeChat ?? await createChat();
      if (!chat) {
        throw new Error('활성 채팅을 찾지 못했습니다.');
      }
      const submittedAt = new Date().toISOString();
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(session.id)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          title: 'User Instruction',
          text,
          meta: {
            role: 'user',
            chatId: chat.id,
            agent: selectedProvider,
            model: activeModelLabel,
            mode: composerMode,
            modelReasoningEffort: serializeReasoningEffort(selectedEffort),
            workspaceTab,
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { event?: UiEvent; error?: string };
      if (!response.ok || !body.event) {
        throw new Error(body.error ?? '메시지 전송에 실패했습니다.');
      }
      setPrompt('');
      setEvents((previous) => [...previous, body.event as UiEvent]);
      setChats((previous) => previous.map((item) => (
        item.id === chat.id
          ? { ...item, latestPreview: text, latestEventAt: submittedAt, latestEventIsUser: true, lastActivityAt: submittedAt }
          : item
      )));
      void fetch(`/api/runtime/sessions/${encodeURIComponent(session.id)}/chats/${encodeURIComponent(chat.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touchActivity: true,
          latestPreview: text,
          latestEventId: body.event.id,
          latestEventAt: submittedAt,
          latestEventIsUser: true,
        }),
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '메시지 전송에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!selectedChatId) {
    return (
      <div className="pc-chat-directory" data-project-chat-list>
        <div className="pc-chat-directory__head">
          <div>
            <div className="pc-chat-directory__eyebrow">Chats</div>
            <h2>{projectName} conversations</h2>
            <p>{projectPath}</p>
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={handleNewChat}>
            <Plus size={14} />
            New chat
          </button>
        </div>

        <div className="pc-chat-directory__grid">
          <section className="pc-chat-directory__list" aria-label={`${projectName} chat list`}>
            {isLoadingChats && <div className="pc-chat-loading">Loading chats...</div>}
            {!isLoadingChats && chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className="pc-chat-row"
                onClick={() => onChatOpen(chat.id)}
              >
                <span className={`pc-chat-row__dot pc-chat-row__dot--${statusClass(session.status)}`} />
                <span className="pc-chat-row__body">
                  <span className="pc-chat-row__title">{chat.title}</span>
                  <span className="pc-chat-row__preview">{chat.latestPreview || recentPreview}</span>
                  <span className="pc-chat-row__meta">
                    {agentLabel(chat.agent, chat.model ?? modelLabel)} · {formatRelativeTime(chat.lastActivityAt)}
                  </span>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
            {!isLoadingChats && chats.length === 0 && (
              <button type="button" className="pc-chat-row pc-chat-row--empty" onClick={handleNewChat}>
                <span className="pc-chat-row__body">
                  <span className="pc-chat-row__title">Start the first chat</span>
                  <span className="pc-chat-row__preview">프로젝트 하위에 새 채팅을 만들고 프로토타입 화면으로 진입합니다.</span>
                </span>
                <Plus size={14} />
              </button>
            )}
          </section>

          <aside className="pc-chat-directory__side">
            <article className="pc-chat-side-card">
              <div className="pc-chat-side-card__title">
                <MessageSquareText size={14} />
                Project conversation map
              </div>
              <div className="pc-chat-side-stat"><span>Total chats</span><strong>{chats.length || session.totalChats || 0}</strong></div>
              <div className="pc-chat-side-stat"><span>Active signal</span><strong>{projectStatusLabel(session.status)}</strong></div>
              <div className="pc-chat-side-stat"><span>Context</span><strong>{tokenLabel}</strong></div>
            </article>
            <article className="pc-chat-side-card">
              <div className="pc-chat-side-card__title">
                <FolderOpen size={14} />
                Attached context
              </div>
              <div className="ctx-item"><FileText size={13} /><span className="ctx-item__name">design/chat-prototype.html</span><span className="ctx-item__tokens">source</span></div>
              <div className="ctx-item"><FileText size={13} /><span className="ctx-item__name">Project IA shell</span><span className="ctx-item__tokens">active</span></div>
            </article>
          </aside>
        </div>
        {error && <div className="pc-chat-error" role="alert">{error}</div>}
      </div>
    );
  }

  return (
    <div
      ref={prototypeRef}
      className="pc-proto"
      data-project-chat-screen
      data-mode={composerMode}
      data-workspace={workspaceDrawerPhase === 'closing' ? 'closing' : workspaceOpen ? 'open' : 'closed'}
      data-workspace-ready={workspaceLayoutReady ? 'true' : 'false'}
      data-ws-tab={workspaceTab}
      data-preview={previewState}
    >
      <div className="shell">
        <main className="shell__main">
          <header className="ch">
            <button type="button" className="ch__menu ch__menu--visible" onClick={onBackToChatList} aria-label="Back to chats">
              <ChevronLeft size={18} />
            </button>
            <div className="ch__title-wrap">
              <span className="ch__title">{activeChat?.title ?? 'Project chat'}</span>
              <span className="ch__status"><span className="ch__status-dot" />{projectStatusLabel(session.status)}</span>
              <span className="ch__meta">{agentLabel(activeAgent, activeModelLabel)} · {tokenLabel} · {fileCount} files</span>
            </div>
            <div className="ch__actions">
              <button type="button" className="ch__action" aria-label="Share chat route" onClick={() => handleCopy(projectChatRoute, 'Chat route')}>
                <Share2 size={14} />
              </button>
              <button
                type="button"
                id="wsToggle"
                ref={workspaceToggleRef}
                className="ch__action ch__action--ws"
                aria-pressed={workspaceOpen}
                aria-label="Toggle workspace"
                title="Workspace"
                onClick={toggleWorkspacePanel}
              >
                <PanelRight size={14} />
              </button>
              <button type="button" className="ch__action" aria-label="More chat actions" onClick={() => setModelSelectorOpen((current) => !current)}>
                <MoreHorizontal size={15} />
              </button>
            </div>
          </header>

          <div className="tl" ref={timelineRef}>
            <div className="tl__container">
              <div className="tl__day">
                <span className="tl__day-line" />
                <span className="tl__day-label">Project chat · {formatRelativeTime(activeChat?.lastActivityAt)}</span>
                <span className="tl__day-line" />
              </div>

              {isLoadingEvents && <div className="pc-chat-loading">Loading messages...</div>}
              {!isLoadingEvents && !hasRuntimeEvents && (
                <>
                  <div className={`msg${highlightedMessageId === 'seed-history-primary' ? ' msg--highlight' : ''}`}>
                    <span className="msg__avatar msg__avatar--user">U</span>
                    <div className="msg__body">
                      <div className="msg__header"><span className="msg__name">You</span><span className="msg__time">{formatRelativeTime(selectedChatTimestamp)}</span></div>
                      <div className="msg__bubble">{selectedChatPreview}</div>
                      <div className="msg__attachments">
                        <span className="msg__attach">
                          <span className="msg__attach-icon"><FolderOpen size={12} /></span>
                          <span className="msg__attach-name">{displayProjectName(session)}</span>
                          <span className="msg__attach-size">project</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="msg">
                    <span className={`msg__avatar ${agentAvatarClass(activeAgent)}`}>{agentInitial(activeAgent)}</span>
                    <div className="msg__body">
                      <div className="msg__header"><span className="msg__name">{agentLabel(activeAgent, activeModelLabel)}</span><span className="msg__time">now</span></div>
                      <div className="msg__text">
                        <p>프로젝트 컨텍스트를 먼저 확인하겠습니다. 최근 채팅, 작업 경로, 연결된 파일을 기준으로 이어서 볼 수 있습니다.</p>
                      </div>
                      <div
                        className="tool"
                        role="button"
                        tabIndex={0}
                        onClick={() => handleCopy(projectPath, 'Tool command')}
                        onKeyDown={(keyEvent) => {
                          if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                            keyEvent.preventDefault();
                            handleCopy(projectPath, 'Tool command');
                          }
                        }}
                      >
                        <span className="tool__icon tool__icon--success"><Check size={12} /></span>
                        <div className="tool__body">
                          <span className="tool__title">Read · project context</span>
                          <span className="tool__cmd">{projectPath}</span>
                        </div>
                        <span className="tool__meta">active</span>
                        <ChevronRight size={12} className="tool__caret" />
                      </div>
                    </div>
                  </div>

                  <div className="msg">
                    <span className={`msg__avatar ${agentAvatarClass(activeAgent)}`}>{agentInitial(activeAgent)}</span>
                    <div className="msg__body">
                      <div className="msg__header"><span className="msg__name">{agentLabel(activeAgent, activeModelLabel)}</span><span className="msg__time">now</span></div>
                      <div className="msg__text">
                        <p>선택한 대화 흐름을 불러왔습니다. 필요한 파일과 로그를 열어 다음 작업을 진행할 준비가 되어 있습니다.</p>
                      </div>
                      <div className="code">
                        <div className="code__head">
                          <div className="code__head-left">
                            <span className="code__lang">ctx</span>
                            <span>project scope</span>
                          </div>
                          <button type="button" className="code__copy" onClick={() => handleCopy(`project=${projectName}\nchat=${activeChat?.title ?? 'new chat'}\npath=${projectPath}\nentry=${projectChatRoute}`, 'Project scope')}>Copy</button>
                        </div>
                        <pre className="code__body">{`project=${projectName}\nchat=${activeChat?.title ?? 'new chat'}\npath=${projectPath}\nentry=${projectChatRoute}`}</pre>
                      </div>
                    </div>
                  </div>

                  <div className="msg">
                    <span className={`msg__avatar ${agentAvatarClass(activeAgent)}`}>{agentInitial(activeAgent)}</span>
                    <div className="msg__body">
                      <div className="msg__header"><span className="msg__name">{agentLabel(activeAgent, activeModelLabel)}</span><span className="msg__time">now</span></div>
                      <div className="msg__text">
                        <p>다음 요청을 보내면 이 대화에서 이어서 작업하겠습니다. 실행 상태, 파일 맥락, 이전 턴은 오른쪽 작업 패널에서 함께 추적됩니다.</p>
                      </div>
                      <div className="artifact">
                        <div className="artifact__thumb" />
                        <div className="artifact__meta">
                          <span className="artifact__name">project-context.snapshot</span>
                          <span className="artifact__sub">workspace context · ready</span>
                        </div>
                        <button type="button" className="artifact__btn" data-preview-open onClick={() => setPreviewState('open')}>Preview</button>
                      </div>
                      <div className="thinking">
                        <span className="thinking__dots"><span className="thinking__dot" /><span className="thinking__dot" /><span className="thinking__dot" /></span>
                        <span>프로젝트 맥락 대기 중</span>
                        <span className="thinking__time">{tokenLabel}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {visibleEvents.map((item) => {
                const role = readEventRole(item);
                const isUser = role === 'user';
                const snippet = item.parsed?.snippets?.[0];
                const toolLike = !isUser && isToolLikeEvent(item);
                return (
                  <div key={item.id} className={`msg${highlightedMessageId === item.id ? ' msg--highlight' : ''}`}>
                    <span className={`msg__avatar ${isUser ? 'msg__avatar--user' : agentAvatarClass(activeAgent)}`}>{isUser ? 'U' : agentInitial(activeAgent)}</span>
                    <div className="msg__body">
                      <div className="msg__header">
                        <span className="msg__name">{isUser ? 'You' : agentLabel(activeAgent, activeModelLabel)}</span>
                        <span className="msg__time">{formatRelativeTime(item.timestamp)}</span>
                      </div>
                      {isUser ? (
                        <>
                          <div className="msg__bubble">{getEventText(item)}</div>
                          {item.parsed?.files?.length ? (
                            <div className="msg__attachments">
                              {item.parsed.files.slice(0, 3).map((file) => (
                                <span key={file} className="msg__attach">
                                  <span className="msg__attach-icon"><FileText size={12} /></span>
                                  <span className="msg__attach-name">{file}</span>
                                  <span className="msg__attach-size">ref</span>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="msg__text"><p>{getEventText(item)}</p></div>
                          {toolLike && (
                            <div
                              className="tool"
                              role="button"
                              tabIndex={0}
                              onClick={() => handleCopy(eventCommand(item), 'Tool command')}
                              onKeyDown={(keyEvent) => {
                                if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                                  keyEvent.preventDefault();
                                  handleCopy(eventCommand(item), 'Tool command');
                                }
                              }}
                            >
                              <span className="tool__icon tool__icon--success"><Check size={12} /></span>
                              <div className="tool__body">
                                <span className="tool__title">{item.title || item.kind}</span>
                                <span className="tool__cmd">{eventCommand(item)}</span>
                              </div>
                              <span className="tool__meta">{item.kind}</span>
                              <ChevronRight size={12} className="tool__caret" />
                            </div>
                          )}
                          {snippet && (
                            <div className="code">
                              <div className="code__head">
                                <div className="code__head-left">
                                  <span className="code__lang">{snippet.language || 'txt'}</span>
                                  <span>generated snippet</span>
                                </div>
                                <button type="button" className="code__copy" onClick={() => handleCopy(snippet.code, 'Code block')}>Copy</button>
                              </div>
                              <pre className="code__body">{snippet.code}</pre>
                            </div>
                          )}
                          {item.parsed?.files?.[0] && (
                            <div className="artifact">
                              <div className="artifact__thumb" />
                              <div className="artifact__meta">
                                <span className="artifact__name">{item.parsed.files[0]}</span>
                                <span className="artifact__sub">project file · referenced</span>
                              </div>
                              <button type="button" className="artifact__btn" data-preview-open onClick={() => setPreviewState('open')}>Preview</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="jb-wrap">
              <div className="jb">
                <span className="jb__dot" />
                <span>Project scope active</span>
                <button type="button" className="jb__btn" aria-label="Jump" onClick={handleJumpToLatest}>
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </div>

          <footer ref={composerWrapRef} className="cmp-wrap">
            <form className="cmp" onSubmit={handleSubmit}>
              <div className="cmp__top">
                <div className="cmp-mode" role="tablist" aria-label="Mode">
                  {(['agent', 'plan', 'terminal'] as ComposerMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className="cmp-mode__pill"
                      data-mode={mode}
                      aria-pressed={composerMode === mode}
                      onClick={() => setComposerMode(mode)}
                    >
                      <span className="cmp-mode__pill-dot" />
                      {COMPOSER_MODE_COPY[mode]}
                    </button>
                  ))}
                </div>
                <button type="button" className="cmp-ctx" aria-label="Current model" aria-expanded={modelSelectorOpen} onClick={() => setModelSelectorOpen((current) => !current)}>
                  <span className={`cmp-ctx__logo cmp-ctx__logo--${selectedProvider}`}>{agentInitial(activeAgent).slice(0, 1)}</span>
                  <span className="cmp-ctx__name">{activeModelLabel}</span>
                  <span className="cmp-ctx__effort">{selectedEffort}</span>
                  <ChevronRight size={12} />
                </button>
              </div>
              <div className={`ms${modelSelectorOpen ? ' ms--open' : ''}`} role="dialog" aria-label="Model selector">
                <div className="ms__eyebrow-row">
                  <span className="ms__eyebrow">Model</span>
                  <button type="button" className="ms__close" aria-label="Close model selector" onClick={() => setModelSelectorOpen(false)}>
                    <X size={12} />
                  </button>
                </div>
                <div className="ms__providers" role="tablist">
                  {(['claude', 'codex', 'gemini'] as ModelProvider[]).map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      className="ms__provider"
                      data-provider={provider}
                      aria-pressed={selectedProvider === provider}
                      onClick={() => {
                        setSelectedProvider(provider);
                        setSelectedModel(MODEL_OPTIONS[provider][0]?.name ?? activeModelLabel);
                        const allowedEfforts = PROVIDER_EFFORTS[provider];
                        if (!allowedEfforts.includes(selectedEffort)) {
                          setSelectedEffort(allowedEfforts.at(-1) ?? 'High');
                        }
                      }}
                    >
                      <span>{agentInitial(provider).slice(0, 1)}</span>
                      <span className="ms__provider-label">{PROVIDER_LABELS[provider]}</span>
                    </button>
                  ))}
                </div>
                <div className="ms__list-wrap">
                  {(['claude', 'codex', 'gemini'] as ModelProvider[]).map((provider) => (
                    <div key={provider} className="ms__group" data-provider={provider} data-active={selectedProvider === provider ? '' : undefined}>
                      {MODEL_OPTIONS[provider].map((model) => (
                        <button
                          key={model.name}
                          type="button"
                          className="ms__item"
                          aria-pressed={selectedProvider === provider && activeModelLabel === model.name}
                          onClick={() => {
                            setSelectedProvider(provider);
                            setSelectedModel(model.name);
                            setModelSelectorOpen(false);
                            showTransientFeedback(`${model.name} selected`);
                          }}
                        >
                          <span className="ms__item-check" />
                          <span className="ms__item-body">
                            <span className="ms__item-name">{model.name}</span>
                            <span className="ms__item-meta">{model.meta}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="ms__footer">
                  <span className="ms__eyebrow">Effort</span>
                  <div className="ms__effort-chips" role="tablist" aria-label="Reasoning effort">
                    {(['Low', 'Medium', 'High', 'XHigh', 'Max'] as ReasoningEffort[]).map((effort) => {
                      const disabled = !PROVIDER_EFFORTS[selectedProvider].includes(effort);
                      return (
                        <button
                          key={effort}
                          type="button"
                          className={`ms__effort-chip${disabled ? ' ms__effort-chip--disabled' : ''}`}
                          aria-pressed={selectedEffort === effort}
                          disabled={disabled}
                          onClick={() => setSelectedEffort(effort)}
                        >
                          {effort}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="cmp__chips">
                <span className="cmp-attach">
                  <span className="cmp-attach__icon"><FileText size={12} /></span>
                  <span className="cmp-attach__name">{displayProjectName(session)}</span>
                  <button type="button" className="cmp-attach__x" aria-label="Copy attached project path" onClick={() => handleCopy(projectPath, 'Project path')}>
                    <Copy size={10} />
                  </button>
                </span>
              </div>
              <textarea
                className="cmp__input"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="에이전트에게 무엇이든 요청하세요... Shift Enter 줄바꿈 · Cmd Enter 전송"
                rows={2}
              />
              <div className="cmp__toolbar">
                <div className="cmp__tools">
                  <button type="button" className="cmp__tool" aria-label="Add" onClick={() => showTransientFeedback('Context action ready')}><Plus size={15} /></button>
                  <button
                    type="button"
                    className="cmp__tool"
                    aria-label="Attach file"
                    onClick={() => {
                      activateWorkspaceTab('files');
                      showTransientFeedback('Files panel opened');
                    }}
                  >
                    <Paperclip size={15} />
                  </button>
                  <button
                    type="button"
                    className="cmp__tool"
                    aria-label="Mention"
                    onClick={() => setPrompt((value) => `${value}${value.endsWith(' ') || value.length === 0 ? '' : ' '}@${displayProjectName(session)} `)}
                  >
                    <AtSign size={15} />
                  </button>
                  <button type="button" className="cmp__tool" aria-label="Voice" onClick={() => showTransientFeedback('Voice input is not available in this workspace')}>
                    <Mic size={15} />
                  </button>
                </div>
                <div className="cmp__right">
                  <span className="cmp__hint"><span className="kbd">⌘</span><span className="kbd">↵</span><span>send</span></span>
                  <button
                    type="submit"
                    className={`cmp__send${isSubmitting ? ' cmp__send--running' : ''}`}
                    disabled={isSubmitting ? false : !prompt.trim()}
                    aria-label={isSubmitting ? 'Stop generation' : 'Send message'}
                  >
                    {isSubmitting ? 'Stop' : 'Send'}
                    {isSubmitting ? <Square size={11} /> : <Send size={13} />}
                  </button>
                </div>
              </div>
            </form>
            {error && <div className="pc-chat-error" role="alert">{error}</div>}
          </footer>
        </main>

        <aside ref={workspaceRef} className="shell__workspace ws ws-pane" aria-label={`${projectName} workspace`}>
          <div className="ws__head ws-pane__header">
            <div className="ws__title ws-pane__title"><PanelRight size={14} />Workspace</div>
            <div className="ws__actions ws-pane__actions">
              <button type="button" className="ws__action ws-pane__action btn btn--ghost btn--icon btn--sm" aria-label="Open preview" onClick={() => setPreviewState('open')}>
                <Maximize2 size={13} />
              </button>
              <button type="button" className="ws__action ws-pane__action btn btn--ghost btn--icon btn--sm" aria-label="Open files" onClick={() => activateWorkspaceTab('files')}>
                <FileText size={13} />
              </button>
              <button type="button" className="ws__action ws-pane__action btn btn--ghost btn--icon btn--sm" aria-label="Close workspace" onClick={closeWorkspacePanel}>
                <X size={13} />
              </button>
            </div>
          </div>
          <div className="ws__tabs" role="tablist">
            <button type="button" className="ws__tab" data-tab="run" aria-pressed={workspaceTab === 'run'} onClick={() => activateWorkspaceTab('run')}><Clock size={12} />Run</button>
            <button type="button" className="ws__tab" data-tab="files" aria-pressed={workspaceTab === 'files'} onClick={() => activateWorkspaceTab('files')}><FileIcon size={12} />Files</button>
            <button type="button" className="ws__tab" data-tab="terminal" aria-pressed={workspaceTab === 'terminal'} onClick={() => activateWorkspaceTab('terminal')}><Terminal size={12} />Terminal</button>
            <button type="button" className="ws__tab" data-tab="context" aria-pressed={workspaceTab === 'context'} onClick={() => activateWorkspaceTab('context')}><PanelsTopLeft size={12} />Context</button>
          </div>
          <div className="ws__status">
            <div className="ws__status-left">
              <span className={`ws__model ws__model--${selectedProvider}`}><span className="ws__model-dot" />{activeModelLabel}</span>
              <span className="ws__pill"><span className="ws__pill-dot" />{projectStatusLabel(session.status)}</span>
            </div>
            <div className="ws__status-right">
              <span>{tokenLabel}</span>
              <button type="button" className="ws__stop" aria-label="Stop" onClick={() => showTransientFeedback('Stop request staged for this project chat')}><Square size={10} /></button>
            </div>
          </div>
          <div className="ws__body">
            <div className={`ws__pane${workspaceTab === 'run' ? ' ws__pane--active' : ''}`} data-pane="run">
              <div className="run-summary">
                <div className="run-summary__cell"><span className="run-summary__label">Steps</span><span className="run-summary__value">{hasRuntimeEvents ? Math.max(1, visibleEvents.length) : '4 / 5'}</span></div>
                <div className="run-summary__cell"><span className="run-summary__label">Tokens</span><span className="run-summary__value">{tokenLabel}</span></div>
                <div className="run-summary__cell"><span className="run-summary__label">Activity</span><span className="run-summary__value">{formatRelativeTime(selectedChatTimestamp)}</span></div>
              </div>
              <div className="ws-card ws-card--run">
                <div className="ws-card__head">
                  <div className="ws-card__title">Run · {activeChat?.id ? `#${activeChat.id.slice(-4)}` : '#0142'}</div>
                  <div className="ws-card__meta">{formatRelativeTime(selectedChatTimestamp)} · {tokenLabel} tokens</div>
                </div>
                <div className="run-steps">
                  {runStepItems.map((item) => (
                    <button key={item.id} type="button" className={`run-step ws-run-step${item.state === 'running' ? ' run-step--active' : ''}`} onClick={() => handleCopy(item.cmd, 'Run step')}>
                      <span className={`run-step__dot ws-run-step__dot${item.state === 'running' ? ' run-step__dot--running' : ' run-step__dot--done ws-run-step__dot--done'}`} />
                      <div className="run-step__body ws-run-step__body">
                        <div className="run-step__title ws-run-step__title">{item.title}</div>
                        <div className="run-step__cmd ws-run-step__time">{item.cmd}</div>
                      </div>
                      <span className="run-step__time ws-run-step__time">{item.time}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="chist ws-card ws-card--history">
                <div className="chist__head">
                  <span className="chist__title"><MessageSquareText size={12} />Chat history</span>
                  <span className="chist__meta">{historyTurnItems.length} turns</span>
                </div>
                <div className="chist__list">
                  {historyTurnItems.map((item) => (
                    <div key={item.id} className="chturn" data-open={visibleExpandedTurnId === item.id ? 'true' : 'false'}>
                      <button
                        type="button"
                        className="chturn__preview"
                        data-turn-toggle
                        onClick={() => setExpandedTurnId(visibleExpandedTurnId === item.id ? '__none__' : item.id)}
                      >
                        <span className="chturn__avatar">U</span>
                        <span className="chturn__body">
                          <span className="chturn__meta">
                            <span className="chturn__name">You</span>
                            <span className="chturn__time">{formatRelativeTime(item.timestamp)}</span>
                            <span className={`chturn__pill ${item.state === 'running' ? 'chturn__pill--run' : 'chturn__pill--ok'}`}>
                              <span className="chturn__pill-dot" />{item.state}
                            </span>
                          </span>
                          <span className="chturn__text">{item.text}</span>
                        </span>
                        <ChevronRight size={12} className="chturn__caret" />
                      </button>
                      <div className="chturn__expanded">
                        <div className="chturn__agent-head">
                          <span className={`chturn__agent-avatar ${agentAvatarClass(activeAgent)}`}>{agentInitial(activeAgent).slice(0, 1)}</span>
                          <span className="chturn__agent-label"><strong>{agentLabel(activeAgent, activeModelLabel)}</strong></span>
                          <span className="chturn__agent-final">{item.state === 'running' ? 'In progress' : 'Final'}</span>
                        </div>
                        <div className="chturn__agent-text">{item.agentText}</div>
                        <div className="chturn__actions">
                          <button type="button" className="chturn__btn" onClick={() => handleJumpToTurn(item.id)}><ChevronRight size={11} />Jump</button>
                          <button type="button" className="chturn__btn" data-preview-open onClick={() => setPreviewState('open')}><FileText size={11} />Preview</button>
                          <button type="button" className="chturn__btn" onClick={() => handleCopy(`${item.text}\n\n${item.agentText}`, 'Turn summary')}><Copy size={11} />Copy</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className={`ws__pane${workspaceTab === 'files' ? ' ws__pane--active' : ''}`} data-pane="files">
              <div className="file-tree">
                {workspaceFiles.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    className={`file-row${selectedWorkspaceFile === file.name ? ' file-row--selected' : ''}`}
                    onClick={() => {
                      setSelectedWorkspaceFile(file.name);
                      if (file.kind === 'file') setPreviewState('dock');
                    }}
                  >
                    <span className={`file-row__icon${file.kind === 'dir' ? ' file-row__icon--dir' : ''}`}>
                      {file.kind === 'dir' ? <FolderOpen size={13} /> : <FileText size={13} />}
                    </span>
                    <span className="file-row__name">{file.name}</span>
                    <span className="file-row__meta">{file.meta}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={`ws__pane${workspaceTab === 'terminal' ? ' ws__pane--active' : ''}`} data-pane="terminal">
              <div className="term">
                <div className="term__head">
                  <div className="term__head-left">
                    <span className="term__dots"><span className="term__dot term__dot--r" /><span className="term__dot term__dot--y" /><span className="term__dot term__dot--g" /></span>
                    <span className="term__tag">bash · project chat</span>
                  </div>
                  <span className="term__dim">{composerMode}</span>
                </div>
                <div className="term__body">
                  <div className="term__line"><span className="term__prompt">~/aris$</span><span>{draftTerminalCommand}</span></div>
                  <div className="term__line"><span className="term__dim">selected · {selectedWorkspaceFile}</span></div>
                  <div className="term__line"><span className="term__ok">✓</span><span>ready to run in this project context</span></div>
                </div>
              </div>
              <div className="snip-group">
                <div className="snip-group__head">
                  <span className="snip-group__label"><Terminal size={12} />Snippets</span>
                  <span className="snip-group__count">{terminalSnippets.length}</span>
                </div>
                {terminalSnippets.map((snippet) => (
                  <button
                    key={snippet.id}
                    type="button"
                    className="snip-row"
                    onClick={() => {
                      setDraftTerminalCommand(snippet.cmd);
                      setPrompt((value) => value || snippet.cmd);
                    }}
                  >
                    <span className="snip-row__name">{snippet.name}</span>
                    <span className="snip-row__cmd">{snippet.cmd}</span>
                    <span className="snip-row__tag">{snippet.tag}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={`ws__pane${workspaceTab === 'context' ? ' ws__pane--active' : ''}`} data-pane="context">
              <div className="ctx-summary">
                <div className="ctx-ring" aria-label={`${tokenLabel} context usage`}>
                  <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
                    <circle className="ctx-ring__track" cx="40" cy="40" r="34" strokeWidth="6" fill="none" />
                    <circle className="ctx-ring__fill" cx="40" cy="40" r="34" strokeWidth="6" fill="none" strokeDasharray="214" strokeDashoffset="194" strokeLinecap="round" />
                  </svg>
                  <div className="ctx-ring__center">9.2%</div>
                </div>
                <div className="ctx-summary__body">
                  <div className="ctx-summary__title">Context usage</div>
                  <div className="ctx-summary__meta">{tokenLabel} / 200k tokens</div>
                  <div className="ctx-summary__split">
                    <div className="ctx-summary__split-cell"><div className="ctx-summary__split-label">Model</div><div className="ctx-summary__split-value">{activeModelLabel}</div></div>
                    <div className="ctx-summary__split-cell"><div className="ctx-summary__split-label">Mode</div><div className="ctx-summary__split-value">{COMPOSER_MODE_COPY[composerMode]}</div></div>
                  </div>
                </div>
              </div>
              <div className="ctx-group">
                <div className="ctx-group__head"><span className="ctx-group__title">Attached context</span><span className="ctx-group__count">{contextItems.length}</span></div>
                {contextItems.map((item) => (
                  <button key={item.id} type="button" className="ctx-item" onClick={() => handleCopy(item.name, 'Context item')}>
                    <FileText size={13} className="ctx-item__icon" />
                    <span className="ctx-item__name">{item.name}</span>
                    <span className="ctx-item__tokens">{item.tokens}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="ws__footer">
            <div className="ws__footer-row"><span className="ws__footer-label">Context usage</span><span className="ws__footer-value">{tokenLabel} / 200k</span></div>
            <div className="ws__footer-bar"><div className="ws__footer-fill" style={{ width: '9.2%' }} /></div>
            <div className="ws__footer-meta"><span>project scoped</span><span>{fileCount} files</span></div>
          </div>
        </aside>
      </div>
      <div className="overlay" data-preview-overlay role="dialog" aria-modal="true" aria-label="Preview">
        <div className="preview-frame">
          <div className="preview-topbar">
            <div className="preview-topbar__nav">
              <button type="button" className="preview-topbar__btn" aria-label="Back"><ChevronLeft size={13} /></button>
              <button type="button" className="preview-topbar__btn" aria-label="Refresh" onClick={() => showTransientFeedback('Preview refreshed')}><RefreshCcw size={13} /></button>
            </div>
            <div className="preview-url">
              <span className="preview-url__protocol">https://</span>
              <span className="preview-url__target">{previewTarget}</span>
              <span className="preview-url__meta">project</span>
            </div>
            <div className="preview-device" role="tablist" aria-label="Preview size">
              {(['1200', '768', '390'] as const).map((device) => (
                <button key={device} type="button" aria-pressed={previewDevice === device} onClick={() => setPreviewDevice(device)}>{device}</button>
              ))}
            </div>
            <button type="button" className="preview-topbar__btn" aria-label="Copy preview URL" onClick={() => handleCopy(`https://${previewTarget}`, 'Preview URL')}><ExternalLink size={13} /></button>
            <button type="button" className="preview-topbar__btn" data-preview-dock aria-label="Dock preview" onClick={() => setPreviewState('dock')}><PanelsTopLeft size={13} /></button>
            <button type="button" className="preview-topbar__btn" aria-label="Close preview" onClick={() => setPreviewState('closed')}><X size={13} /></button>
          </div>
          <div className="preview-canvas" data-preview-size={previewDevice}>
            <div className="preview-page">
              <aside className="preview-page__sb">
                <div className="preview-page__sb-logo">ARIS</div>
                <div className="preview-page__sb-item preview-page__sb-item--active">{displayProjectName(session)}</div>
                <div className="preview-page__sb-item">{activeChat?.title ?? 'Project chat'}</div>
                <div className="preview-page__sb-item">{selectedWorkspaceFile}</div>
              </aside>
              <main className="preview-page__main">
                <h2 className="preview-page__h">{activeChat?.title ?? 'Project chat'}</h2>
                <p className="preview-page__sub">{agentLabel(activeAgent, activeModelLabel)} · {COMPOSER_MODE_COPY[composerMode]} · {tokenLabel}</p>
                <div className="preview-page__cards">
                  <div className="preview-page__card">
                    <div className="preview-page__card-t">Workspace</div>
                    <div className="preview-page__card-m">{workspaceTab} · {selectedWorkspaceFile}</div>
                    <div className="preview-page__bar"><div className="preview-page__bar-fill" style={{ width: '74%' }} /></div>
                  </div>
                  <div className="preview-page__card">
                    <div className="preview-page__card-t">Context</div>
                    <div className="preview-page__card-m">{projectPath}</div>
                    <div className="preview-page__bar"><div className="preview-page__bar-fill" style={{ width: '42%' }} /></div>
                  </div>
                </div>
              </main>
            </div>
            <div className="preview-controls">
              <button type="button" aria-label="Zoom out" onClick={() => showTransientFeedback('Preview zoom 90%')}><ChevronLeft size={12} /></button>
              <span className="preview-controls__zoom">100%</span>
              <button type="button" aria-label="Zoom in" onClick={() => showTransientFeedback('Preview zoom 110%')}><ChevronRight size={12} /></button>
              <span className="preview-controls__sep" />
              <button type="button" aria-label="Screenshot" onClick={() => showTransientFeedback('Screenshot staged')}><Copy size={12} /></button>
            </div>
          </div>
        </div>
      </div>
      <div className="preview-dock-wrap" data-preview-dock>
        <div className="preview-dock">
          <span className="preview-dock__thumb" />
          <span className="preview-dock__name">{selectedWorkspaceFile}</span>
          <span className="preview-dock__meta">{previewDevice}</span>
          <button type="button" className="preview-dock__btn preview-dock__btn--live" data-preview-open aria-label="Expand preview" onClick={() => setPreviewState('open')}>
            <Maximize2 size={12} />
          </button>
          <button type="button" className="preview-dock__btn" aria-label="Close preview dock" onClick={() => setPreviewState('closed')}>
            <X size={12} />
          </button>
        </div>
      </div>
      {copyFeedback && <div className="pc-toast" data-copy-feedback role="status">{copyFeedback}</div>}
    </div>
  );
}

function ProjectSurface({
  onBackToProjects,
  onProjectChatOpen,
  onProjectOpen,
  onProjectViewChange,
  projectView,
  selectedChatId,
  selectedProjectId,
  sessions,
}: {
  onBackToProjects: () => void;
  onProjectChatOpen: (sessionId: string, chatId: string) => void;
  onProjectOpen: (sessionId: string, view?: ProjectView) => void;
  onProjectViewChange: (view: ProjectView) => void;
  projectView: ProjectView;
  selectedChatId: string | null;
  selectedProjectId: string | null;
  sessions: SessionSummary[];
}) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const projects = sortSessions(sessions);
  const selectedIndex = selectedProjectId ? projects.findIndex((session) => session.id === selectedProjectId) : -1;
  const selectedProject = selectedIndex >= 0 ? projects[selectedIndex] : null;
  const activeCount = projects.filter((session) => session.status === 'running' || session.status === 'error').length;
  const totalChats = projects.reduce((sum, session) => sum + (session.totalChats ?? 0), 0);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProjects = projects.filter((session) => {
    const matchesQuery = !normalizedQuery
      || displayProjectName(session).toLowerCase().includes(normalizedQuery)
      || displayProjectPath(session).toLowerCase().includes(normalizedQuery);
    if (!matchesQuery) return false;
    if (activeFilter === 'Active') return session.status === 'running' || session.status === 'error';
    if (activeFilter === 'Archived') return session.status === 'stopped';
    return true;
  });
  const chips = ['All', 'Active', 'Recent', 'Archived'];

  if (selectedProject) {
    return (
      <ProjectDetailSurface
        session={selectedProject}
        index={selectedIndex}
        onBackToProjects={onBackToProjects}
        onProjectChatOpen={(chatId) => onProjectChatOpen(selectedProject.id, chatId)}
        onProjectViewChange={onProjectViewChange}
        projectView={projectView}
        selectedChatId={selectedChatId}
      />
    );
  }

  return (
    <div className="proj-list-wrap">
      <div className="proj-list-toolbar">
        <label className="proj-list-search">
          <Search size={13} />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects..."
          />
        </label>
        <div className="proj-list-chips" aria-label="프로젝트 필터">
          {chips.map((chip) => {
            const count = chip === 'All'
              ? projects.length
              : chip === 'Active'
                ? activeCount
                : null;
            return (
              <button
                key={chip}
                type="button"
                className={`proj-list-chip${activeFilter === chip ? ' proj-list-chip--active' : ''}`}
                onClick={() => setActiveFilter(chip)}
              >
                {chip}
                {count !== null && <span className="proj-list-chip__count">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="proj-list-body">
        <div className="proj-list-grid">
          {filteredProjects.map((session, index) => (
            <article
              key={session.id}
              className="proj-list-card"
              role="button"
              tabIndex={0}
              aria-label={`${displayProjectName(session)} 프로젝트 열기`}
              onClick={() => onProjectOpen(session.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onProjectOpen(session.id);
                }
              }}
            >
              <div className="proj-list-card__head">
                <div className="proj-list-card__info">
                  <div className="proj-list-card__name">{displayProjectName(session)}</div>
                  <div className="proj-list-card__path">{displayProjectPath(session)}</div>
                </div>
                <span className={`badge badge--dot ${projectStatusBadgeClass(session.status)}`}>
                  {projectStatusLabel(session.status)}
                </span>
              </div>
              <div className="proj-list-stats">
                <div className="proj-list-stat">
                  <div className="proj-list-stat__label">Chats</div>
                  <div className="proj-list-stat__val">
                    {session.totalChats ?? 0}
                    {(session.status === 'running' || session.status === 'error') && (
                      <span className="proj-list-stat__sub">· 1 active</span>
                    )}
                  </div>
                </div>
                <div className="proj-list-stat">
                  <div className="proj-list-stat__label">Files</div>
                  <div className="proj-list-stat__val">{deriveProjectFileCount(session, index)}</div>
                </div>
                <div className="proj-list-stat">
                  <div className="proj-list-stat__label">Tokens</div>
                  <div className="proj-list-stat__val">{deriveProjectTokenLabel(session, index)}</div>
                </div>
              </div>
              <div className="home-proj__chats home-proj__chats--project-list">
                <div className="home-proj__chat">
                  <span className={`home-proj__chat-dot home-proj__chat-dot--${statusClass(session.status)}`} />
                  <div className="home-proj__chat-body">
                    <div className="home-proj__chat-title">{session.alias || displayProjectName(session)}</div>
                    <div className="home-proj__chat-last">{createChatPreview(session, index)}</div>
                  </div>
                </div>
                <div className="home-proj__chat">
                  <span className="home-proj__chat-dot home-proj__chat-dot--done" />
                  <div className="home-proj__chat-body">
                    <div className="home-proj__chat-title">{session.agent} · {session.model || session.metadata?.runtimeModel || 'default model'}</div>
                    <div className="home-proj__chat-last">프로젝트 채팅과 최근 파일 맥락이 이 카드에 묶여 있습니다.</div>
                  </div>
                </div>
              </div>
              <div className="proj-list-card__foot">
                <span className="proj-list-card__foot-meta">last {formatRelativeTime(session.lastActivityAt)}</span>
                <button
                  type="button"
                  className="proj-list-new-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    onProjectOpen(session.id, 'chats');
                  }}
                >
                  <Plus size={11} />
                  New chat
                </button>
              </div>
            </article>
          ))}

          <button type="button" className="proj-list-card proj-list-card--new">
            <Plus size={20} />
            <span className="proj-list-card__new-title">New project</span>
            <span className="proj-list-card__new-meta">로컬 디렉토리 선택 → 프로젝트 생성</span>
          </button>
        </div>
        <div className="proj-list-summary" aria-live="polite">
          {filteredProjects.length} projects · {activeCount} active · {totalChats} chats total
        </div>
      </div>
    </div>
  );
}

function FilesSurface({ browserRootPath }: { browserRootPath: string }) {
  const [currentPath, setCurrentPath] = useState(browserRootPath || '/');
  const [data, setData] = useState<DirectoryData | null>(null);
  const [selected, setSelected] = useState<FileItem | null>(FALLBACK_FILES[1] ?? null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function fetchFiles() {
      try {
        const response = await fetch(`/api/fs/list?path=${encodeURIComponent(currentPath)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('failed');
        const body = await response.json() as DirectoryData;
        if (!cancelled) {
          setData(body);
          const nextSelected = body.directories.find((item) => item.isFile) ?? body.directories[0] ?? null;
          setSelected((previous) => previous && body.directories.some((item) => item.path === previous.path) ? previous : nextSelected);
        }
      } catch {
        if (!cancelled) {
          setData({ currentPath, parentPath: null, directories: FALLBACK_FILES });
          setSelected((previous) => previous ?? FALLBACK_FILES[1] ?? null);
        }
      }
    }
    void fetchFiles();
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  const rows = (data?.directories ?? FALLBACK_FILES)
    .filter((item) => !query.trim() || item.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));

  return (
    <div className="m-main-scroll m-main-scroll--files">
      <div className="files-head">
        <form className="files-search" onSubmit={(event) => event.preventDefault()}>
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" />
        </form>
        <div className="files-chips">
          {['All', 'Code', 'Docs', 'Logs', 'Recent'].map((chip, index) => (
            <button key={chip} type="button" className={`files-chip${index === 0 ? ' files-chip--active' : ''}`}>{chip}</button>
          ))}
        </div>
      </div>

      <div className="files-body">
        <aside className="files-tree">
          <div className="files-tree__group">Projects</div>
          <button type="button" className="files-node files-node--dir" onClick={() => setCurrentPath(browserRootPath || '/')}>
            <ChevronRight size={13} />
            <span className="files-node__name">ARIS</span>
          </button>
          <button type="button" className="files-node files-node--dir" onClick={() => setCurrentPath('/home/ubuntu/project/ARIS/services')}>
            <ChevronRight size={13} />
            <span className="files-node__name">services</span>
          </button>
          <button type="button" className="files-node files-node--active" onClick={() => setCurrentPath('/home/ubuntu/project/ARIS/.worktrees')}>
            <Folder size={13} />
            <span className="files-node__name">design-system-v1</span>
          </button>
          <button type="button" className="files-node files-node--dir">
            <ChevronRight size={13} />
            <span className="files-node__name">Lawdigest</span>
          </button>
          <div className="files-tree__group files-tree__group--system">System</div>
          {['logs', 'scripts', 'obsidian', 'backups'].map((item, index) => (
            <button key={item} type="button" className="files-node">
              <FolderOpen size={13} />
              <span className="files-node__name">{item}</span>
              {index !== 2 && <span className="files-node__count">{index === 0 ? 482 : index === 1 ? 14 : 28}</span>}
            </button>
          ))}
        </aside>

        <section className="files-list" aria-label="Files">
          <div className="files-list__head"><span>Name</span><span>Owner</span><span>Size</span><span>Modified</span></div>
          {rows.map((item) => (
            <button
              key={item.path}
              type="button"
              className={`files-row${selected?.path === item.path ? ' files-row--active' : ''}`}
              onClick={() => {
                if (item.isDirectory) {
                  setCurrentPath(item.path);
                } else {
                  setSelected(item);
                }
              }}
            >
              <span className="files-row__name">
                {item.isDirectory ? <Folder size={14} /> : <FileText size={14} />}
                <span>{item.isDirectory ? `${item.name}/` : item.name}</span>
              </span>
              <span className="files-row__small files-row__small--left">ARIS</span>
              <span className="files-row__small">{item.isDirectory ? '-' : formatBytes(item.sizeBytes)}</span>
              <span className="files-row__small">{item.modifiedAt ? formatRelativeTime(item.modifiedAt) : 'recent'}</span>
            </button>
          ))}
        </section>

        <aside className="files-preview">
          <div className="files-prev-thumb" />
          <div>
            <div className="files-prev-name">{selected?.name ?? 'No file selected'}</div>
            <div className="files-prev-path">{selected?.path ?? currentPath}</div>
          </div>
          <div className="files-prev-facts">
            <div><div className="files-prev-fact-label">Size</div><div className="files-prev-fact-val">{formatBytes(selected?.sizeBytes)}</div></div>
            <div><div className="files-prev-fact-label">Lines</div><div className="files-prev-fact-val">{selected?.isFile ? '3,242' : '-'}</div></div>
            <div><div className="files-prev-fact-label">Type</div><div className="files-prev-fact-val">{selected?.isDirectory ? 'DIR' : selected?.name.split('.').pop()?.toUpperCase() ?? '-'}</div></div>
            <div><div className="files-prev-fact-label">Owner</div><div className="files-prev-fact-val">ARIS</div></div>
          </div>
          <div className="files-prev-actions">
            <button type="button" className="btn btn--secondary" disabled={!selected?.isFile}>Open preview</button>
            <button type="button" className="btn btn--ghost">Copy path</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function HomePageWrapper({
  user,
  initialSessions,
  runtimeError,
  browserRootPath,
}: {
  user: AuthenticatedUser;
  initialSessions: SessionSummary[];
  runtimeError: string | null;
  browserRootPath: string;
}) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectView, setSelectedProjectView] = useState<ProjectView>('overview');
  const [selectedProjectChatId, setSelectedProjectChatId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<RuntimeMetrics | null>(null);

  useEffect(() => {
    const nextTab = normalizeTab(searchParams.get('tab'));
    const nextProjectView = nextTab === 'project' ? normalizeProjectView(searchParams.get('view')) : 'overview';
    setActiveTab(nextTab);
    setSelectedProjectId(nextTab === 'project' ? (searchParams.get('project') ?? null) : null);
    setSelectedProjectView(nextProjectView);
    setSelectedProjectChatId(nextTab === 'project' && nextProjectView === 'chat' ? (searchParams.get('chat') ?? null) : null);
  }, [searchParams]);

  useEffect(() => {
    const syncRouteFromLocation = () => {
      const url = new URL(window.location.href);
      const nextTab = normalizeTab(url.searchParams.get('tab'));
      const nextProjectView = nextTab === 'project' ? normalizeProjectView(url.searchParams.get('view')) : 'overview';
      setActiveTab(nextTab);
      setSelectedProjectId(nextTab === 'project' ? (url.searchParams.get('project') ?? null) : null);
      setSelectedProjectView(nextProjectView);
      setSelectedProjectChatId(nextTab === 'project' && nextProjectView === 'chat' ? (url.searchParams.get('chat') ?? null) : null);
    };

    window.addEventListener('popstate', syncRouteFromLocation);
    return () => {
      window.removeEventListener('popstate', syncRouteFromLocation);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchMetrics() {
      try {
        const response = await fetch('/api/runtime/system', { cache: 'no-store' });
        const body = await response.json() as {
          metrics?: {
            cpu?: RuntimeMetric;
            ram?: RuntimeMetric;
            storage?: RuntimeMetric;
          };
        };
        if (!cancelled && response.ok && body.metrics) {
          setMetrics({
            cpu: { percent: clampPercent(Number(body.metrics.cpu?.percent ?? 0)) },
            ram: {
              percent: clampPercent(Number(body.metrics.ram?.percent ?? 0)),
              usedBytes: Number(body.metrics.ram?.usedBytes ?? 0),
              totalBytes: Number(body.metrics.ram?.totalBytes ?? 0),
            },
            storage: {
              percent: clampPercent(Number(body.metrics.storage?.percent ?? 0)),
              usedBytes: Number(body.metrics.storage?.usedBytes ?? 0),
              totalBytes: Number(body.metrics.storage?.totalBytes ?? 0),
            },
          });
        }
      } catch {
        if (!cancelled) setMetrics(null);
      }
    }
    void fetchMetrics();
    return () => {
      cancelled = true;
    };
  }, []);

  const sessions = useMemo(() => sortSessions(initialSessions), [initialSessions]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSelectedProjectId(null);
    setSelectedProjectView('overview');
    setSelectedProjectChatId(null);
    window.history.replaceState(null, '', withAppBasePath(`/?tab=${tab}`));
  };

  const handleProjectOpen = (sessionId: string, view: ProjectView = 'overview', chatId?: string | null) => {
    setActiveTab('project');
    setSelectedProjectId(sessionId);
    setSelectedProjectView(view);
    setSelectedProjectChatId(view === 'chat' ? chatId ?? null : null);
    window.history.pushState(null, '', withAppBasePath(buildProjectDetailPath(sessionId, view, chatId)));
  };

  const handleProjectViewChange = (view: ProjectView) => {
    if (!selectedProjectId) return;
    setActiveTab('project');
    setSelectedProjectView(view);
    setSelectedProjectChatId(null);
    window.history.pushState(null, '', withAppBasePath(buildProjectDetailPath(selectedProjectId, view)));
  };

  const handleProjectChatOpen = (sessionId: string, chatId: string) => {
    setActiveTab('project');
    setSelectedProjectId(sessionId);
    setSelectedProjectView('chat');
    setSelectedProjectChatId(chatId);
    window.history.pushState(null, '', withAppBasePath(buildProjectDetailPath(sessionId, 'chat', chatId)));
  };

  const handleBackToProjects = () => {
    setActiveTab('project');
    setSelectedProjectId(null);
    setSelectedProjectView('overview');
    setSelectedProjectChatId(null);
    window.history.pushState(null, '', withAppBasePath('/?tab=project'));
  };

  const content = (() => {
    if (activeTab === 'ask') return <AskSurface sessions={sessions} />;
    if (activeTab === 'project') {
      return (
        <ProjectSurface
          onBackToProjects={handleBackToProjects}
          onProjectChatOpen={handleProjectChatOpen}
          onProjectOpen={handleProjectOpen}
          onProjectViewChange={handleProjectViewChange}
          projectView={selectedProjectView}
          selectedChatId={selectedProjectChatId}
          selectedProjectId={selectedProjectId}
          sessions={sessions}
        />
      );
    }
    if (activeTab === 'files') return <FilesSurface browserRootPath={browserRootPath} />;
    return <HomeSurface metrics={metrics} onProjectOpen={handleProjectOpen} sessions={sessions} user={user} />;
  })();

  return (
    <div className="app-shell app-shell-ia">
      <div className="aris-ia-shell">
        <Sidebar
          activeProjectChatId={selectedProjectChatId}
          activeProjectId={selectedProjectId}
          activeTab={activeTab}
          onProjectChatOpen={handleProjectChatOpen}
          onProjectOpen={handleProjectOpen}
          onTabChange={handleTabChange}
          sessions={sessions}
          user={user}
        />
        <main className="m-main">
          <Topbar activeTab={activeTab} sessions={sessions} />
          {runtimeError && <div className="ia-runtime-notice"><BackendNotice message={runtimeError} /></div>}
          {content}
        </main>
      </div>
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
