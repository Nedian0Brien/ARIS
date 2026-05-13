'use client';

import React from 'react';
import { ExternalLink, MonitorUp, X } from 'lucide-react';
import styles from '../../ChatInterface.module.css';

type PreviewTarget = {
  title: string;
  url?: string | null;
};

type PreviewDockProps = {
  target: PreviewTarget | null;
  onClose: () => void;
  onOpen: () => void;
};

export function PreviewDock({ target, onClose, onOpen }: PreviewDockProps) {
  if (!target) {
    return null;
  }

  return (
    <aside className={styles.previewDock} aria-label="프리뷰 도크">
      <button type="button" className={styles.previewDockMain} onClick={onOpen}>
        <MonitorUp size={16} />
        <span>
          <strong>{target.title}</strong>
          <small>{target.url ?? 'Inline artifact preview'}</small>
        </span>
      </button>
      {target.url ? (
        <a className={styles.previewDockIcon} href={target.url} target="_blank" rel="noreferrer" aria-label="외부에서 열기">
          <ExternalLink size={14} />
        </a>
      ) : null}
      <button type="button" className={styles.previewDockIcon} onClick={onClose} aria-label="프리뷰 닫기">
        <X size={14} />
      </button>
    </aside>
  );
}
