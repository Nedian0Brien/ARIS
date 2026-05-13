import React, { type ReactNode } from 'react';
import { File, FileCode, FileText, Folder } from 'lucide-react';
import { readLocalStorage, writeLocalStorage } from '@/lib/browser/localStorage';
import {
  RECENT_FILES_MAX,
  RECENT_FILES_STORAGE_KEY,
  WORKSPACE_FILE_OPEN_EVENT,
} from './constants';
import type { WorkspaceFileOpenDetail } from './types';

export function getRecentFiles(): string[] {
  try {
    return JSON.parse(readLocalStorage(RECENT_FILES_STORAGE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function saveRecentFile(filePath: string): void {
  try {
    const prev = getRecentFiles().filter((path) => path !== filePath);
    writeLocalStorage(RECENT_FILES_STORAGE_KEY, JSON.stringify([filePath, ...prev].slice(0, RECENT_FILES_MAX)));
  } catch {
    // localStorage unavailable
  }
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('clipboard-unavailable');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('clipboard-unavailable');
  }
}

export function getFileIcon(name: string, isDirectory: boolean): ReactNode {
  if (isDirectory) return <Folder size={14} />;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'cs'].includes(ext)) {
    return <FileCode size={14} />;
  }
  if (['md', 'txt', 'yaml', 'yml', 'toml', 'json'].includes(ext)) {
    return <FileText size={14} />;
  }
  return <File size={14} />;
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

export function joinWorkspacePath(dirPath: string, name: string): string {
  const normalizedDir = normalizeWorkspaceClientPath(dirPath);
  const trimmedName = name.trim().replace(/^\/+/, '');
  return normalizedDir === '/' ? `/${trimmedName}` : `${normalizedDir}/${trimmedName}`;
}

export function buildChatUrl(sessionId: string, chatId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}?chat=${encodeURIComponent(chatId)}`;
}

export function readChatIdFromLocation(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = new URL(window.location.href).searchParams.get('chat');
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed || null;
}

export function writeChatIdToHistory(url: string, mode: 'push' | 'replace' = 'push') {
  if (typeof window === 'undefined') {
    return;
  }
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === url) {
    return;
  }
  if (mode === 'replace') {
    window.history.replaceState({}, '', url);
    return;
  }
  window.history.pushState({}, '', url);
}

export function isWorkspacePathWithinRoot(targetPath: string, rootPath: string): boolean {
  const normalizedTarget = normalizeWorkspaceClientPath(targetPath);
  const normalizedRoot = normalizeWorkspaceClientPath(rootPath);
  return normalizedRoot === '/'
    ? normalizedTarget.startsWith('/')
    : normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}

export function dispatchWorkspaceFileOpen(detail: WorkspaceFileOpenDetail) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<WorkspaceFileOpenDetail>(WORKSPACE_FILE_OPEN_EVENT, {
    detail: {
      ...detail,
      path: normalizeWorkspaceClientPath(detail.path),
      line: typeof detail.line === 'number' ? detail.line : null,
    },
  }));
}
