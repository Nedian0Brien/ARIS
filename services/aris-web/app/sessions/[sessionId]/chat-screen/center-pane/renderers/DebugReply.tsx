'use client';

import React from 'react';
import { looksLikeShellTranscript } from '../../../chatDebugMode';
import styles from '../../../ChatInterface.module.css';

function DebugRawBody({ body }: { body: string }) {
  const normalized = body.replace(/\r\n/g, '\n');
  if (!normalized.trim()) {
    return null;
  }

  const transcriptLike = looksLikeShellTranscript(normalized);
  const lines = normalized.split('\n');

  return (
    <pre className={`${styles.debugRawBody} ${transcriptLike ? styles.debugRawBodyTranscript : ''}`}>
      {lines.map((line, index) => {
        const lineKey = `debug-line-${index}`;

        if (!line.trim()) {
          return <span key={lineKey} className={styles.debugRawBlankLine}> </span>;
        }

        const commandMatch = transcriptLike ? line.match(/^(\s*)([$>])\s+(.*)$/) : null;
        if (commandMatch) {
          const [, prefix, prompt, command] = commandMatch;
          return (
            <span key={lineKey} className={styles.debugRawLine}>
              <span className={styles.debugRawPrompt}>{prefix}{prompt}</span>
              <span className={styles.debugRawCommand}> {command}</span>
            </span>
          );
        }

        if (/^(diff --git |\+\+\+ |--- |\*\*\* |@@ )/.test(line)) {
          return <span key={lineKey} className={`${styles.debugRawLine} ${styles.diffLineMeta}`}>{line}</span>;
        }

        if (/^[+-](?!\+\+\+|---)/.test(line)) {
          return (
            <span key={lineKey} className={`${styles.debugRawLine} ${line.startsWith('+') ? styles.diffLineAdd : styles.diffLineDel}`}>
              {line}
            </span>
          );
        }

        return <span key={lineKey} className={styles.debugRawLine}>{line}</span>;
      })}
    </pre>
  );
}

export function DebugReply({ body }: { body: string }) {
  const normalized = body.trim();
  if (!normalized) {
    return null;
  }

  return (
    <div className={styles.debugReply}>
      <DebugRawBody body={normalized} />
    </div>
  );
}
