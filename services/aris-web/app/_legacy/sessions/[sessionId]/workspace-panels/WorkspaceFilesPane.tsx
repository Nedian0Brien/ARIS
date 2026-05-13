'use client';

import React from 'react';
import type { ReactNode } from 'react';
import styles from './WorkspaceShell.module.css';

type Props = {
  detailBody: ReactNode;
  detailPath: string | null;
  detailTitle: string;
  isMobileLayout: boolean;
  navigationBody: ReactNode;
};

export function WorkspaceFilesPane({
  detailBody,
  detailPath,
  detailTitle,
  isMobileLayout,
  navigationBody,
}: Props) {
  if (isMobileLayout) {
    return (
      <div className={styles.modePaneMobileOnly}>
        {navigationBody}
      </div>
    );
  }

  return (
    <div className={styles.modePaneSplit}>
      <div className={styles.modePaneNavColumn}>
        {navigationBody}
      </div>
      <section className={styles.modePaneDetailCard}>
        <header className={styles.modePaneDetailHeader}>
          <div>
            <span className={styles.modePaneDetailEyebrow}>File</span>
            <h3 className={styles.modePaneDetailTitle}>{detailTitle}</h3>
            <p className={styles.modePaneDetailPath}>{detailPath ?? '파일을 선택하면 이 영역에서 바로 열립니다.'}</p>
          </div>
        </header>
        <div className={styles.modePaneDetailBody}>
          {detailBody}
        </div>
      </section>
    </div>
  );
}
