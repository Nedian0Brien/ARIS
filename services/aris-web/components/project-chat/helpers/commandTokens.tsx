'use client';

import React from 'react';

export function commandTokenClass(token: string, tokenIndex: number): string {
  if (tokenIndex === 0) return 'pc-action-token--bin';
  if (/^[A-Z_][A-Z0-9_]*=/.test(token)) return 'pc-action-token--env';
  if (/^-{1,2}[\w-]+/.test(token)) return 'pc-action-token--flag';
  if (/^["'].*["']$/.test(token)) return 'pc-action-token--str';
  if (/^https?:\/\//.test(token)) return 'pc-action-token--url';
  if (/^(?:\/|~\/|\.{1,2}\/)/.test(token)) return 'pc-action-token--path';
  if (/^(?:&&|\|\||[|;])$/.test(token)) return 'pc-action-token--op';
  if (/^\d+(?:\.\d+)?(?::\d+)?$/.test(token) || /:\d+/.test(token)) return 'pc-action-token--number';
  return 'pc-action-token--arg';
}

export function renderCommandTokens(command: string) {
  let tokenIndex = 0;
  return (command.match(/\s+|[^\s]+/g) ?? []).map((token, index) => {
    if (/^\s+$/.test(token)) {
      return <span key={`space-${index}`}>{token}</span>;
    }
    const className = commandTokenClass(token, tokenIndex);
    tokenIndex += 1;
    return <span key={`${className}-${index}`} className={`pc-action-token ${className}`}>{token}</span>;
  });
}
