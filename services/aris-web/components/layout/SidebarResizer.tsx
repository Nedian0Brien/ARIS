'use client';

import { useRef } from 'react';
import { SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN } from '@/lib/hooks/useSidebarWidth';
import styles from './SidebarResizer.module.css';

interface Props {
  width: number;
  onWidthChange: (next: number) => void;
}

export function SidebarResizer({ width, onWidthChange }: Props) {
  const draggingRef = useRef(false);
  const startWidthRef = useRef(width);
  const startXRef = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    startWidthRef.current = width;
    startXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    onWidthChange(startWidthRef.current + delta);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 24 : 8;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onWidthChange(width - step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onWidthChange(width + step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onWidthChange(SIDEBAR_WIDTH_MIN);
    } else if (e.key === 'End') {
      e.preventDefault();
      onWidthChange(SIDEBAR_WIDTH_MAX);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={SIDEBAR_WIDTH_MAX}
      aria-label="사이드바 폭 조절"
      tabIndex={0}
      className={styles.handle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}
