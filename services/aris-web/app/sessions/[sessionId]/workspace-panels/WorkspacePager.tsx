'use client';

import React, { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import styles from './WorkspacePager.module.css';
import type { WorkspacePagerItem } from './pagerModel';
import { resolveWorkspacePagerSwipeTarget } from './swipeGesture';

const SWIPE_THRESHOLD_PX = 60;
const EDGE_RESISTANCE = 0.32;
const GESTURE_LOCK_THRESHOLD_PX = 8;

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
  const activeIndex = useMemo(() => {
    const index = items.findIndex((item) => item.id === activePageId);
    return index >= 0 ? index : 0;
  }, [activePageId, items]);

  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef(0);
  const gestureRef = useRef({
    tracking: false,
    horizontal: false,
    vertical: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
  });

  useEffect(() => {
    dragOffsetRef.current = 0;
    setDragOffsetPx(0);
    setIsDragging(false);
  }, [activePageId]);

  const resetGesture = () => {
    gestureRef.current = {
      tracking: false,
      horizontal: false,
      vertical: false,
      pointerId: -1,
      startX: 0,
      startY: 0,
    };
    dragOffsetRef.current = 0;
    setDragOffsetPx(0);
    setIsDragging(false);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      tracking: true,
      horizontal: false,
      vertical: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) {
      return;
    }

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
      setIsDragging(true);
    }

    if (!gesture.horizontal) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const isAtLeadingEdge = activeIndex === 0 && deltaX > 0;
    const isAtTrailingEdge = activeIndex === items.length - 1 && deltaX < 0;
    const nextOffset = isAtLeadingEdge || isAtTrailingEdge
      ? deltaX * EDGE_RESISTANCE
      : deltaX;

    dragOffsetRef.current = nextOffset;
    setDragOffsetPx(nextOffset);
  };

  const commitGesture = () => {
    const gesture = gestureRef.current;
    if (!gesture.tracking) {
      return;
    }

    if (!gesture.horizontal) {
      resetGesture();
      return;
    }

    const nextPageId = resolveWorkspacePagerSwipeTarget(
      items,
      activePageId,
      dragOffsetRef.current,
      SWIPE_THRESHOLD_PX,
    );
    resetGesture();
    if (nextPageId !== activePageId) {
      onActivePageChange?.(nextPageId);
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture.pointerId !== event.pointerId) {
      return;
    }

    commitGesture();
  };

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture.pointerId !== event.pointerId) {
      return;
    }

    commitGesture();
  };

  const trackTransform = `translate3d(calc(-${activeIndex * 100}% + ${dragOffsetPx}px), 0, 0)`;

  return (
    <div
      className={styles.pager}
      data-active-page-id={activePageId}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={commitGesture}
    >
      <div
        className={isDragging ? `${styles.track} ${styles.trackDragging}` : styles.track}
        style={{ transform: trackTransform }}
      >
        {items.map((item) => {
          const pageClassName = styles.page;

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
    </div>
  );
}
