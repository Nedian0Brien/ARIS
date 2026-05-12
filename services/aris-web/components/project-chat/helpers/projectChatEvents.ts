'use client';

import { Brain, FilePenLine, FileSearch, FolderTree, TerminalSquare } from 'lucide-react';
import { readUiEventRunStatus } from '@/lib/happy/chatRuntime';
import type { UiEvent } from '@/lib/happy/types';
import { GitActionMark, DockerActionMark } from './actionMarks';

function readEventRole(event: UiEvent): 'user' | 'agent' | 'terminal' {
  if (event.meta?.role === 'user') return 'user';
  if (event.meta?.role === 'terminal') return 'terminal';
  return 'agent';
}

export function isProjectActionEvent(event: UiEvent): boolean {
  if (readEventRole(event) === 'user') return false;
  if (event.action?.command || event.action?.path || event.parsed?.commands?.length) return true;
  return event.kind === 'command_execution'
    || event.kind === 'docker_execution'
    || event.kind === 'exec_execution'
    || event.kind === 'file_list'
    || event.kind === 'file_read'
    || event.kind === 'file_write'
    || event.kind === 'git_execution'
    || event.kind === 'run_execution'
    || event.kind === 'think';
}

export function isProjectRunStatusEvent(event: UiEvent): boolean {
  if (readEventRole(event) === 'user') return false;
  const runStatus = readUiEventRunStatus(event);
  if (!runStatus) return false;
  const streamEvent = typeof event.meta?.streamEvent === 'string' ? event.meta.streamEvent.trim().toLowerCase() : '';
  return streamEvent === 'run_status' || /^run status:/i.test(event.body || event.title);
}

export function eventCommand(event: UiEvent): string {
  return event.action?.command
    || event.parsed?.commands?.[0]
    || event.action?.path
    || event.result?.preview
    || event.body
    || event.title;
}

export function projectActionMeta(kind: UiEvent['kind']) {
  if (kind === 'file_read') return { Icon: FileSearch, label: 'Read', tone: 'read' };
  if (kind === 'file_write') return { Icon: FilePenLine, label: 'Write', tone: 'write' };
  if (kind === 'file_list') return { Icon: FolderTree, label: 'List', tone: 'list' };
  if (kind === 'think') return { Icon: Brain, label: 'Thinking', tone: 'think' };
  if (kind === 'git_execution') return { Icon: GitActionMark, label: 'Git', tone: 'git' };
  if (kind === 'docker_execution') return { Icon: DockerActionMark, label: 'Docker', tone: 'docker' };
  return { Icon: TerminalSquare, label: 'Run', tone: 'run' };
}

export function projectActionPreview(event: UiEvent): string {
  const command = eventCommand(event);
  const preview = event.result?.preview || event.body || event.title || '';
  if (!preview || preview === command) return '';
  return preview.trim();
}
