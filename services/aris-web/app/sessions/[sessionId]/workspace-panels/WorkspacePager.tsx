'use client';

import React, { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import styles from './WorkspacePager.module.css';
import type { WorkspacePagerItem } from './pagerModel';
import { resolveWorkspacePagerSwipeTarget } from './swipeGesture';
import { transitionWorkspacePageScrollMemory, type WorkspacePageScrollMemory } from './workspacePageScrollMemory';
import { recordScrollDebugEvent } from '../scrollDebug';

const SWIPE_THRESHOLD_PX = 56;
const GESTURE_LOCK_THRESHOLD_PX = 8;

type WorkspacePagerProps = {
  items: readonly WorkspacePagerItem[];
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
  const gestureRef = useRef({
    tracking: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    horizontal: false,
    vertical: false,
  });

  useEffect(() => {
    const previousPageId = previousActivePageIdRef.current;
    if (previousPageId !== activePageId && typeof window !== 'undefined') {
      const previousPage = items.find((item) => item.id === previousPageId);
      const activePage = items.find((item) => item.id === activePageId);
      const { memory, nextScrollTop } = transitionWorkspacePageScrollMemory({
        memory: scrollMemoryRef.current,
        previousPageId,
        previousScrollTop: window.scrollY,
        nextPageId: activePageId,
        shouldStorePreviousPage: previousPage?.kind !== 'chat',
        shouldRestoreNextPage: activePage?.kind !== 'chat',
      });

      scrollMemoryRef.current = memory;
      if (nextScrollTop !== null) {
        recordScrollDebugEvent({
          kind: 'write',
          source: 'workspacePager:window-restore',
          top: nextScrollTop,
          behavior: 'auto',
          detail: {
            previousPageId,
            activePageId,
          },
        });
        window.scrollTo({
          top: nextScrollTop,
          behavior: 'auto',
        });
      }
      previousActivePageIdRef.current = activePageId;
    }
  }, [activePageId, items]);

  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) {
      return;
    }

    const nextIndex = items.findIndex((item) => item.id === activePageId);
    if (nextIndex < 0) {
      return;
    }

    const nextLeft = nextIndex * pager.clientWidth;
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

  const resetGesture = () => {
    gestureRef.current = {
      tracking: false,
      pointerId: -1,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      horizontal: false,
      vertical: false,
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      tracking: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      horizontal: false,
      vertical: false,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) {
      return;
    }

    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (!gesture.horizontal && !gesture.vertical) {
      if (absDeltaX < GESTURE_LOCK_THRESHOLD_PX && absDeltaY < GESTURE_LOCK_THRESHOLD_PX) {
        return;
      }

      if (absDeltaY > absDeltaX) {
        gesture.vertical = true;
        return;
      }

      gesture.horizontal = true;
    }

    if (gesture.horizontal && event.cancelable) {
      event.preventDefault();
    }
  };

  const commitGesture = () => {
    const gesture = gestureRef.current;
    if (!gesture.tracking) {
      return;
    }

    const deltaX = gesture.lastX - gesture.startX;
    const deltaY = gesture.lastY - gesture.startY;
    resetGesture();

    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }

    const nextPageId = resolveWorkspacePagerSwipeTarget(
      items,
      activePageId,
      deltaX,
      SWIPE_THRESHOLD_PX,
    );

    if (nextPageId !== activePageId) {
      onActivePageChange?.(nextPageId);
    }
  };

  return (
    <div
      ref={pagerRef}
      className={styles.pager}
      data-active-page-id={activePageId}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={commitGesture}
      onPointerCancel={commitGesture}
      onLostPointerCapture={commitGesture}
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
