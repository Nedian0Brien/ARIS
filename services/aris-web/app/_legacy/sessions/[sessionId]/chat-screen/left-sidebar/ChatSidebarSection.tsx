'use client';

import React from 'react';
import type { ReactNode, RefObject } from 'react';
import type { ChatSidebarSectionKey } from '../types';
import styles from '../../ChatInterface.module.css';

type ChatSidebarSectionSummary = {
  key: ChatSidebarSectionKey;
  label: string;
  totalCount: number;
};

export function ChatSidebarSection({
  section,
  sectionIndex,
  children,
  showInfiniteSentinel = false,
  sentinelRef,
}: {
  section: ChatSidebarSectionSummary;
  sectionIndex: number;
  children?: ReactNode;
  showInfiniteSentinel?: boolean;
  sentinelRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <section className={styles.sidebarSection}>
      {sectionIndex > 0 && <div className={styles.sidebarSectionDivider} aria-hidden="true" />}
      <div className={styles.sidebarSectionLabelRow}>
        <span className={styles.sidebarSectionLabel}>{section.label}</span>
        <span className={styles.sidebarSectionCount}>{section.totalCount}</span>
      </div>
      <div id={`chat-sidebar-section-${section.key}`} className={styles.sidebarSectionBody}>
        {children}
        {showInfiniteSentinel && (
          <div
            ref={sentinelRef}
            className={styles.chatSidebarInfiniteSentinel}
            role="status"
            aria-label="이전 채팅 불러오는 중"
          >
            <div className={styles.chatSidebarSkeletonRow} aria-hidden="true" />
            <div className={styles.chatSidebarSkeletonRow} aria-hidden="true" />
          </div>
        )}
      </div>
    </section>
  );
}
