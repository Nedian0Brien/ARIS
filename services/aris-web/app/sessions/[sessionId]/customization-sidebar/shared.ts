import {
  FolderKanban,
  GitBranch,
  TerminalSquare,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import styles from '../CustomizationSidebar.module.css';
import type { GitDiffScope, MpcServerSummary, SidebarSurface } from './types';

export const SURFACE_ITEMS: Array<{
  id: SidebarSurface;
  label: string;
  hint: string;
  Icon: LucideIcon;
  disabled?: boolean;
}> = [
  { id: 'customization', label: 'Customization', hint: '활성', Icon: Wrench },
  { id: 'files', label: 'Files', hint: '활성', Icon: FolderKanban },
  { id: 'git', label: 'Git', hint: '활성', Icon: GitBranch },
  { id: 'terminal', label: 'Terminal', hint: '다음 단계', Icon: TerminalSquare, disabled: true },
];

export const SURFACE_COPY: Record<SidebarSurface, { title: string; subtle: string }> = {
  customization: {
    title: 'Customization',
    subtle: '지침 문서, Skills, MCP 상태를 한 곳에서 확인하고 조정합니다.',
  },
  files: {
    title: 'Files',
    subtle: '워크스페이스 파일을 탐색하고 바로 열어 수정합니다.',
  },
  git: {
    title: 'Source Control',
    subtle: 'VS Code처럼 변경 파일, 스테이징, diff, 커밋과 동기화를 한 흐름으로 처리합니다.',
  },
  terminal: {
    title: 'Terminal',
    subtle: '다음 단계에서 연결될 터미널 패널입니다.',
  },
};

export function formatTimestamp(value: string | null): string {
  if (!value) return '시간 정보 없음';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function formatBytes(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '--';
  }
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
}

export function formatGitStatusLabel(code: string): string | null {
  if (code === 'M') return '수정';
  if (code === 'A') return '추가';
  if (code === 'D') return '삭제';
  if (code === 'R') return '이름 변경';
  if (code === 'C') return '복사';
  if (code === 'U') return '충돌';
  if (code === '?') return '추적 안 됨';
  return null;
}

export function gitTreeExpansionKey(scope: GitDiffScope, path: string): string {
  return `${scope}:${path}`;
}

export function expandGitTreeAncestors(
  current: Record<string, boolean>,
  scope: GitDiffScope,
  path: string,
): Record<string, boolean> {
  const segments = path.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return current;
  }

  const next = { ...current };
  let partial = '';
  for (let index = 0; index < segments.length - 1; index += 1) {
    partial = partial ? `${partial}/${segments[index]}` : (segments[index] ?? '');
    next[gitTreeExpansionKey(scope, partial)] = true;
  }
  return next;
}

export function getGitFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

export function getGitParentLabel(path: string): string {
  const segments = path.split('/');
  if (segments.length <= 1) {
    return '루트';
  }
  return segments.slice(0, -1).join('/');
}

export function getMcpStatusClass(status: MpcServerSummary['status']): string {
  if (status === 'connected') return styles.tagGood;
  if (status === 'needs_auth') return styles.tagWarn;
  if (status === 'failed') return styles.tagDanger;
  return styles.tagMuted;
}

export function getMcpStatusLabel(status: MpcServerSummary['status']): string {
  if (status === 'connected') return '연결됨';
  if (status === 'needs_auth') return '인증 필요';
  if (status === 'failed') return '실패';
  if (status === 'connecting') return '연결 중';
  return '확인 불가';
}

export function normalizeWorkspaceClientPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized || '/';
}

export function getParentWorkspacePath(targetPath: string): string | null {
  const normalized = normalizeWorkspaceClientPath(targetPath);
  if (normalized === '/') {
    return null;
  }
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash <= 0 ? '/' : normalized.slice(0, lastSlash);
}

export function joinWorkspacePath(dirPath: string, name: string): string {
  const normalizedDir = normalizeWorkspaceClientPath(dirPath);
  const trimmedName = name.trim().replace(/^\/+/, '');
  return normalizedDir === '/' ? `/${trimmedName}` : `${normalizedDir}/${trimmedName}`;
}

export function isWorkspacePathWithinRoot(targetPath: string, rootPath: string): boolean {
  const normalizedTarget = normalizeWorkspaceClientPath(targetPath);
  const normalizedRoot = normalizeWorkspaceClientPath(rootPath);
  return normalizedRoot === '/'
    ? normalizedTarget.startsWith('/')
    : normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}
