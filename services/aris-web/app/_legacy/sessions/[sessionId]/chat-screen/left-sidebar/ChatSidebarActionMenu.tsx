'use client';

import React from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Pencil, Pin, Trash2 } from 'lucide-react';
import styles from '../../ChatInterface.module.css';

export function ChatSidebarActionMenu({
  isMounted,
  isOpen,
  menuRect,
  menuRef,
  canMarkAsRead,
  isPinned,
  isBusy,
  onMarkAsRead,
  onRename,
  onTogglePin,
  onDelete,
}: {
  isMounted: boolean;
  isOpen: boolean;
  menuRect: DOMRect | null;
  menuRef: RefObject<HTMLDivElement | null>;
  canMarkAsRead: boolean;
  isPinned: boolean;
  isBusy: boolean;
  onMarkAsRead: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  if (!isMounted || !isOpen || !menuRect || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className={styles.chatShell}>
      <div
        ref={menuRef}
        className={styles.chatListMenuPanel}
        style={{
          position: 'fixed',
          top: `${menuRect.bottom + 4}px`,
          left: `${menuRect.right - 140}px`,
          zIndex: 9999,
        }}
      >
        <button
          type="button"
          className={styles.chatListMenuItem}
          onClick={onMarkAsRead}
          disabled={!canMarkAsRead}
        >
          <CheckCircle2 size={14} />
          읽음 처리
        </button>
        <button
          type="button"
          className={styles.chatListMenuItem}
          onClick={onRename}
        >
          <Pencil size={14} />
          이름 변경
        </button>
        <button
          type="button"
          className={styles.chatListMenuItem}
          onClick={onTogglePin}
          disabled={isBusy}
        >
          <Pin size={14} />
          {isPinned ? '고정 해제' : '고정'}
        </button>
        <button
          type="button"
          className={`${styles.chatListMenuItem} ${styles.chatListMenuDelete}`}
          onClick={onDelete}
          disabled={isBusy}
        >
          <Trash2 size={14} />
          삭제
        </button>
      </div>
    </div>,
    document.body,
  );
}
