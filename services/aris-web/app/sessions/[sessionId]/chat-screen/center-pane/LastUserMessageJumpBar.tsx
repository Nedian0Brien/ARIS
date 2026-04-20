'use client';

import React from 'react';
import { ArrowUp } from 'lucide-react';
import styles from '../../ChatInterface.module.css';

export function LastUserMessageJumpBar({
  preview,
  onJump,
  showPendingReveal = false,
}: {
  preview: string;
  onJump: () => void;
  showPendingReveal?: boolean;
}) {
  return (
    <div className={`${styles.lastUserJumpBar} ${showPendingReveal ? styles.chatEntryPendingReveal : ''}`}>
      <button type="button" className={styles.lastUserJumpButton} onClick={onJump}>
        <span className={styles.lastUserJumpLabel}>지난 사용자 메시지</span>
        <span className={styles.lastUserJumpPreview}>{preview}</span>
        <span className={styles.lastUserJumpAction}>
          <ArrowUp size={14} />
          이동
        </span>
      </button>
    </div>
  );
}
