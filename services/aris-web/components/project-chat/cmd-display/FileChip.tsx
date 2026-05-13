'use client';
import React from 'react';
import type { FileArg } from '@/lib/cmd/types';
import { CmdIcon } from './icons';

function basename(path: string): string {
  const cleaned = path.replace(/\/$/, '');
  const i = cleaned.lastIndexOf('/');
  return i >= 0 ? cleaned.slice(i + 1) : cleaned;
}

export function FileChip({ file, display, onOpen }: { file: FileArg; display?: string; onOpen?: (path: string) => void }) {
  const name = display ?? basename(file.path) ?? file.path;
  return (
    <button
      type="button"
      className="cmd-file-chip"
      data-variant={file.variant}
      title={file.path}
      onClick={() => onOpen?.(file.path)}
      disabled={!onOpen}
    >
      <CmdIcon name={file.variant === 'folder' ? 'folder' : 'file'} size={11} />
      <span className="cmd-file-chip__name">{name}</span>
    </button>
  );
}
