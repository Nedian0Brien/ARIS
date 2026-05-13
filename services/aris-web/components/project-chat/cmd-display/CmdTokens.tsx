'use client';
import React from 'react';
import type { ParsedCommand } from '@/lib/cmd/types';
import { FileChip } from './FileChip';

export function CmdTokens({ parsed, raw, onOpenFile }: { parsed: ParsedCommand; raw?: string; onOpenFile?: (path: string) => void }) {
  if (parsed.tokens.length === 0) {
    // Agent tool — render fileArgs only
    return (
      <span className="pc-action-card__cmd">
        {parsed.fileArgs.map((file, i) => (
          <FileChip key={i} file={file} onOpen={onOpenFile} />
        ))}
      </span>
    );
  }

  const filePaths = new Set(parsed.fileArgs.map((f) => f.path));
  const fileMap = new Map(parsed.fileArgs.map((f) => [f.path, f]));
  const rawString = raw ?? parsed.tokens.map((t) => t.text).join(' ');

  let index = 0;
  return (
    <span className="pc-action-card__cmd" aria-label={rawString} title={rawString}>
      {(rawString.match(/\s+|[^\s]+/g) ?? []).map((segment, segIdx) => {
        if (/^\s+$/.test(segment)) return <span key={`s${segIdx}`}>{segment}</span>;
        if (filePaths.has(segment)) {
          const file = fileMap.get(segment)!;
          return <FileChip key={`f${segIdx}`} file={file} onOpen={onOpenFile} />;
        }
        const className = (() => {
          if (index === 0) { index += 1; return 'pc-action-token--bin'; }
          index += 1;
          if (/^[A-Z_][A-Z0-9_]*=/.test(segment)) return 'pc-action-token--env';
          if (/^-{1,2}[\w-]+/.test(segment)) return 'pc-action-token--flag';
          if (/^["'].*["']$/.test(segment)) return 'pc-action-token--str';
          if (/^https?:\/\//.test(segment)) return 'pc-action-token--url';
          if (/^(?:\/|~\/|\.{1,2}\/)/.test(segment)) return 'pc-action-token--path';
          if (/^(?:&&|\|\||[|;])$/.test(segment)) return 'pc-action-token--op';
          if (/^\d+(?:\.\d+)?(?::\d+)?$/.test(segment) || /:\d+/.test(segment)) return 'pc-action-token--number';
          return 'pc-action-token--arg';
        })();
        return <span key={`t${segIdx}`} className={`pc-action-token ${className}`}>{segment}</span>;
      })}
    </span>
  );
}
