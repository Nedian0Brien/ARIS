'use client';

import React from 'react';

export function GitActionMark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Git">
      <path
        d="M22.1 10.9 13.1 1.9a1.55 1.55 0 0 0-2.2 0L8.98 3.82l2.38 2.38a1.92 1.92 0 0 1 2.43 2.45l2.28 2.28a1.92 1.92 0 1 1-1.15 1.15l-2.13-2.13v5.6a1.92 1.92 0 1 1-1.58-.02V9.82a1.92 1.92 0 0 1-.9-2.55L7.85 4.81 1.9 10.76a1.55 1.55 0 0 0 0 2.2l9.14 9.14a1.55 1.55 0 0 0 2.2 0l8.86-8.86a1.65 1.65 0 0 0 0-2.34Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function DockerActionMark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Docker">
      <path
        d="M4.9 11.8h2.2V9.7H4.9v2.1Zm2.7 0h2.2V9.7H7.6v2.1Zm2.7 0h2.2V9.7h-2.2v2.1Zm2.7 0h2.2V9.7H13v2.1Zm-5.4-2.6h2.2V7.1H7.6v2.1Zm2.7 0h2.2V7.1h-2.2v2.1Zm2.7 0h2.2V7.1H13v2.1Zm0-2.6h2.2V4.5H13v2.1Zm9.1 5.1c-.5-.3-1.5-.4-2.3-.2-.1-.8-.6-1.5-1.3-2l-.5-.3-.3.5c-.4.7-.5 1.7-.1 2.4.2.4.5.8.9 1-1.2.7-3.2.7-3.5.7H2.2l-.1.5c-.2 1.4.1 2.6.8 3.5.8 1.1 2.1 1.7 3.8 1.7 3.7 0 6.5-1.7 8-4.8 1 .1 3.1.1 4.5-1.3.6 0 1.9-.1 2.8-1l.4-.4-.3-.3Z"
        fill="currentColor"
      />
    </svg>
  );
}
