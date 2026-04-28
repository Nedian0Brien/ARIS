'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Laptop,
  Monitor,
  RefreshCw,
  Smartphone,
  X,
} from 'lucide-react';
import styles from '../../ChatInterface.module.css';

type PreviewTarget = {
  title: string;
  url?: string | null;
};

type PreviewOverlayProps = {
  target: PreviewTarget | null;
  onClose: () => void;
  onDock: () => void;
};

const DEVICES = [
  { id: 'desktop', label: '1200', Icon: Monitor },
  { id: 'tablet', label: '768', Icon: Laptop },
  { id: 'mobile', label: '390', Icon: Smartphone },
] as const;

type DeviceId = (typeof DEVICES)[number]['id'];

export function PreviewOverlay({ target, onClose, onDock }: PreviewOverlayProps) {
  const [device, setDevice] = useState<DeviceId>('desktop');
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDock();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDock]);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  }, []);

  if (!target) {
    return null;
  }

  const frameClassName = `${styles.previewOverlayFrame} ${styles[`previewOverlayFrame_${device}`] ?? ''}`;

  return (
    <div className={styles.previewOverlayBackdrop} role="dialog" aria-modal="true" aria-label="아티팩트 프리뷰">
      <section className={styles.previewOverlay} ref={dialogRef}>
        <header className={styles.previewOverlayTopbar}>
          <div className={styles.previewOverlayNav}>
            <button type="button" aria-label="뒤로" disabled><ArrowLeft size={14} /></button>
            <button type="button" aria-label="앞으로" disabled><ArrowRight size={14} /></button>
            <button type="button" aria-label="새로고침"><RefreshCw size={14} /></button>
          </div>
          <div className={styles.previewOverlayUrl}>
            <span>https</span>
            <strong>{target.url ?? target.title}</strong>
          </div>
          <div className={styles.previewOverlayDevices} role="group" aria-label="프리뷰 디바이스">
            {DEVICES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={device === id}
                className={device === id ? styles.previewOverlayDeviceActive : ''}
                onClick={() => setDevice(id)}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
          {target.url ? (
            <a href={target.url} target="_blank" rel="noreferrer" aria-label="외부에서 열기">
              <ExternalLink size={14} />
            </a>
          ) : null}
          <button type="button" onClick={onDock} aria-label="도크로 내리기">Dock</button>
          <button type="button" onClick={onClose} aria-label="프리뷰 닫기"><X size={14} /></button>
        </header>
        <div className={styles.previewOverlayCanvas}>
          <div className={frameClassName}>
            {target.url ? (
              <iframe src={target.url} title={target.title} />
            ) : (
              <div className={styles.previewOverlayPlaceholder}>
                <strong>{target.title}</strong>
                <span>이 아티팩트는 URL이 없어 dock/overlay 상태만 표시합니다.</span>
              </div>
            )}
          </div>
          <div className={styles.previewOverlayFloatControls} aria-hidden="true">
            <span>100%</span>
            <span>Screenshot</span>
          </div>
        </div>
      </section>
    </div>
  );
}
