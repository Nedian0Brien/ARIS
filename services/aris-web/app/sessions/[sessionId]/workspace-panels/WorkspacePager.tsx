'use client';

import React, { useEffect, useRef, type ReactNode } from 'react';
import styles from './WorkspacePager.module.css';
import type { WorkspacePagerItem } from './pagerModel';
import { transitionWorkspacePageScrollMemory, type WorkspacePageScrollMemory } from './workspacePageScrollMemory';

type WorkspacePagerProps = {
  items: WorkspacePagerItem[];
  activePageId: string;
  onActivePageChange?: (pageId: string) => void;
  renderChatPage: () => ReactNode;
  renderCreatePage: () => ReactNode;
  renderPanelPage: (item: Extract<WorkspacePagerItem, { kind: 'panel' }>) => ReactNode;
};

export function WorkspacePager({
  items,
  activePageId,
  onActivePageChange,
  renderChatPage,
  renderCreatePage,
  renderPanelPage,
}: WorkspacePagerProps) {
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const syncRef = useRef(false);
  const scrollMemoryRef = useRef<WorkspacePageScrollMemory>({});
  const previousActivePageIdRef = useRef(activePageId);

  useEffect(() => {
    const previousPageId = previousActivePageIdRef.current;
    if (previousPageId !== activePageId && typeof window !== 'undefined') {
      const { memory, nextScrollTop } = transitionWorkspacePageScrollMemory({
        memory: scrollMemoryRef.current,
        previousPageId,
        previousScrollTop: window.scrollY,
        nextPageId: activePageId,
      });

      scrollMemoryRef.current = memory;
      window.scrollTo({
        top: nextScrollTop,
        behavior: 'auto',
      });
      previousActivePageIdRef.current = activePageId;
    }
  }, [activePageId]);

  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) {
      return;
    }

    const nextIndex = items.findIndex((item) => item.id === activePageId);
    if (nextIndex < 0) {
      return;
    }

    const nextPage = pager.querySelector<HTMLElement>(`[data-workspace-page-id="${CSS.escape(activePageId)}"]`);
    const nextLeft = nextPage?.offsetLeft ?? nextIndex * pager.clientWidth;
    if (Math.abs(pager.scrollLeft - nextLeft) < 2) {
      return;
    }

    syncRef.current = true;
    pager.scrollTo({
      left: nextLeft,
      behavior: 'smooth',
    });

    const timeout = window.setTimeout(() => {
      syncRef.current = false;
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      syncRef.current = false;
    };
  }, [activePageId, items]);

  return (
    <div
      ref={pagerRef}
      className={styles.pager}
      data-active-page-id={activePageId}
      onScroll={(event) => {
        if (syncRef.current) {
          return;
        }

        const pager = event.currentTarget;
        if (pager.clientWidth <= 0) {
          return;
        }

        const nextIndex = Math.round(pager.scrollLeft / pager.clientWidth);
        const nextItem = items[Math.max(0, Math.min(items.length - 1, nextIndex))];
        if (!nextItem || nextItem.id === activePageId) {
          return;
        }

        onActivePageChange?.(nextItem.id);
      }}
    >
      {items.map((item) => {
        const pageClassName = item.id === activePageId
          ? styles.page
          : `${styles.page} ${styles.pageHidden}`;

        return (
          <section
            key={item.id}
            className={pageClassName}
            data-workspace-page-id={item.id}
            data-workspace-page-kind={item.kind}
            aria-hidden={item.id === activePageId ? undefined : true}
          >
            {item.kind === 'chat'
              ? renderChatPage()
              : item.kind === 'create-panel'
                ? renderCreatePage()
                : renderPanelPage(item)}
          </section>
        );
      })}
    </div>
  );
}
