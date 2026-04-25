'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  Check,
  ChevronRight,
  Clock3,
  Cpu,
  Database,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Home,
  MessageSquareText,
  Monitor,
  Moon,
  PanelsTopLeft,
  Plus,
  Search,
  Send,
  Sparkles,
  Sun,
  Wifi,
} from 'lucide-react';
import { BottomNav, TabType } from '@/components/layout/BottomNav';
import { BackendNotice } from '@/components/ui/BackendNotice';
import { selectRecentProjects } from './homeProjects';
import { withAppBasePath } from '@/lib/routing/appPath';
import { applyTheme, readThemeMode, type ThemeMode } from '@/lib/theme/clientTheme';
import type { AuthenticatedUser } from '@/lib/auth/types';
import type { SessionStatus, SessionSummary } from '@/lib/happy/types';

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
  onTabChange,
  sessions,
  user,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  sessions: SessionSummary[];
  user: AuthenticatedUser;
}) {
  const projects = sortSessions(sessions).slice(0, 6);
  const totalChats = sessions.reduce((sum, session) => sum + (session.totalChats ?? 0), 0);
  const userInitial = (user.email?.trim()?.[0] ?? 'A').toUpperCase();

  const navItems: Array<{ id: TabType; label: string; Icon: typeof Home; count?: number }> = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'ask', label: 'Ask ARIS', Icon: MessageSquareText, count: totalChats },
    { id: 'project', label: 'Project', Icon: PanelsTopLeft },
    { id: 'files', label: 'Files', Icon: FileText },
  ];

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
          : projects.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`m-sb__proj m-sb__proj--${statusClass(session.status)}`}
                onClick={() => onTabChange('project')}
              >
                <span className="m-sb__proj-dot" />
                <span className="m-sb__proj-name">{displayProjectName(session)}</span>
                <span className="m-sb__proj-count">{session.totalChats ?? 0}</span>
              </button>
            ))}
      </div>

      <div className="m-sb__footer">
        <span className="m-sb__avatar">{userInitial}</span>
        <div>
          <div className="m-sb__footer-name">{user.email.split('@')[0] || 'ARIS'}</div>
          <div className="m-sb__footer-meta">{user.role}</div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ activeTab, sessions }: { activeTab: TabType; sessions: SessionSummary[] }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const activeProjects = sessions.filter((session) => session.status === 'running' || session.status === 'error').length;
  const totalChats = sessions.reduce((sum, session) => sum + (session.totalChats ?? 0), 0);
  const copy: Record<TabType, { title: string; crumb: string }> = {
    home: { title: 'Home', crumb: 'workspace overview' },
    ask: { title: 'Ask ARIS', crumb: 'global memory' },
    project: { title: 'Projects', crumb: `${activeProjects} active · ${totalChats} chats total` },
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
  sessions,
  user,
  metrics,
}: {
  sessions: SessionSummary[];
  user: AuthenticatedUser;
  metrics: RuntimeMetrics | null;
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
            data-session-href={`/sessions/${session.id}`}
            onClick={() => navigateTo(`/sessions/${session.id}`)}
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
          <button key={session.id} type="button" className="home-feed-row" onClick={() => navigateTo(`/sessions/${session.id}`)}>
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

function ProjectSurface({ sessions }: { sessions: SessionSummary[] }) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const projects = sortSessions(sessions);
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
              onClick={() => navigateTo(`/sessions/${session.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigateTo(`/sessions/${session.id}`);
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
                    navigateTo(`/sessions/${session.id}`);
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
  const [metrics, setMetrics] = useState<RuntimeMetrics | null>(null);

  useEffect(() => {
    setActiveTab(normalizeTab(searchParams.get('tab')));
  }, [searchParams]);

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
    window.history.replaceState(null, '', withAppBasePath(`/?tab=${tab}`));
  };

  const content = (() => {
    if (activeTab === 'ask') return <AskSurface sessions={sessions} />;
    if (activeTab === 'project') return <ProjectSurface sessions={sessions} />;
    if (activeTab === 'files') return <FilesSurface browserRootPath={browserRootPath} />;
    return <HomeSurface sessions={sessions} user={user} metrics={metrics} />;
  })();

  return (
    <div className="app-shell app-shell-ia">
      <div className="aris-ia-shell">
        <Sidebar activeTab={activeTab} onTabChange={handleTabChange} sessions={sessions} user={user} />
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
