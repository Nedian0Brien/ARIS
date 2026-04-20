'use client';

import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { normalizeLocalPreviewConfig } from '@/lib/preview/localPreviewProxy';
import type { WorkspacePanelRecord } from '@/lib/workspacePanels/types';
import styles from './PreviewPanelPage.module.css';

type PreviewPanelPageProps = {
  sessionId: string;
  panel: WorkspacePanelRecord;
  onSavePanel?: (panelId: string, updates: { title?: string; config?: Record<string, unknown> }) => Promise<unknown>;
  onDeletePanel?: (panelId: string) => Promise<unknown>;
  onReturnToChat?: () => void;
};

type PreviewStatus = 'idle' | 'connecting' | 'ready' | 'saving' | 'error';

function getStatusLabel(status: PreviewStatus): string {
  switch (status) {
    case 'connecting':
      return '연결 중';
    case 'ready':
      return '준비 완료';
    case 'saving':
      return '저장 중';
    case 'error':
      return '연결 실패';
    default:
      return '설정 대기';
  }
}

export function PreviewPanelPage({
  sessionId,
  panel,
  onSavePanel,
  onDeletePanel,
  onReturnToChat,
}: PreviewPanelPageProps) {
  const initialConfig = normalizeLocalPreviewConfig(panel.config);
  const [draftPort, setDraftPort] = useState(String(initialConfig.port));
  const [draftPath, setDraftPath] = useState(initialConfig.path);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const [message, setMessage] = useState('포트와 경로를 확인한 뒤 프리뷰를 새로고침하세요.');
  const frameKeyRef = useRef(0);
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    const nextConfig = normalizeLocalPreviewConfig(panel.config);
    setDraftPort(String(nextConfig.port));
    setDraftPath(nextConfig.path);
  }, [panel.config]);

  const loadPreview = async (portValue: string, pathValue: string) => {
    setStatus('connecting');
    setMessage('로컬 개발서버 프리뷰 주소를 준비하는 중입니다.');

    const response = await fetch(
      `/api/runtime/sessions/${encodeURIComponent(sessionId)}/panels/${encodeURIComponent(panel.id)}/preview-url?port=${encodeURIComponent(portValue)}&path=${encodeURIComponent(pathValue)}`,
      {
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      setStatus('error');
      setMessage('프리뷰 주소를 만들지 못했습니다. 포트와 경로를 확인해 주세요.');
      setPreviewUrl(null);
      return;
    }

    const body = await response.json() as { previewUrl?: string };
    if (!body.previewUrl) {
      setStatus('error');
      setMessage('프리뷰 주소가 비어 있습니다.');
      setPreviewUrl(null);
      return;
    }

    setPreviewUrl(body.previewUrl);
    frameKeyRef.current += 1;
    setFrameKey(frameKeyRef.current);
  };

  useEffect(() => {
    void loadPreview(draftPort, draftPath);
    // We want the initial fetch only when the panel identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id, sessionId]);

  const handleSave = async () => {
    const normalized = normalizeLocalPreviewConfig({
      port: draftPort,
      path: draftPath,
    });

    setDraftPort(String(normalized.port));
    setDraftPath(normalized.path);
    setStatus('saving');
    setMessage('프리뷰 설정을 저장하는 중입니다.');

    try {
      await onSavePanel?.(panel.id, {
        config: normalized,
      });
      await loadPreview(String(normalized.port), normalized.path);
    } catch {
      setStatus('error');
      setMessage('프리뷰 설정 저장에 실패했습니다.');
    }
  };

  const handleRefresh = async () => {
    await loadPreview(draftPort, draftPath);
  };

  const handleDelete = async () => {
    try {
      await onDeletePanel?.(panel.id);
    } catch {
      setStatus('error');
      setMessage('패널 삭제에 실패했습니다.');
    }
  };

  return (
    <section className={styles.root}>
      <div className={styles.hero}>
        {onReturnToChat ? (
          <button type="button" className={styles.backButton} onClick={onReturnToChat}>
            채팅으로 돌아가기
          </button>
        ) : null}
        <span className={styles.eyebrow}>Live Preview</span>
        <h3 className={styles.title}>{panel.title}</h3>
        <p className={styles.description}>로컬 개발서버를 같은 세션 워크스페이스 안에서 바로 열어 둡니다.</p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span className={styles.label}>포트</span>
            <input
              className={styles.input}
              inputMode="numeric"
              value={draftPort}
              onChange={(event) => setDraftPort(event.target.value)}
              aria-label="포트"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>경로</span>
            <input
              className={styles.input}
              value={draftPath}
              onChange={(event) => setDraftPath(event.target.value)}
              aria-label="경로"
            />
          </label>
        </div>

        <div className={styles.actions}>
          <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={handleSave}>
            연결 저장
          </button>
          <button type="button" className={styles.button} onClick={handleRefresh}>
            새로고침
          </button>
          {onDeletePanel ? (
            <button type="button" className={`${styles.button} ${styles.buttonDanger}`} onClick={handleDelete}>
              패널 삭제
            </button>
          ) : null}
        </div>

        <div className={styles.statusRow}>
          <span
            className={`${styles.statusBadge} ${
              status === 'ready' ? styles.statusReady : status === 'error' ? styles.statusError : ''
            }`}
          >
            {getStatusLabel(status)}
          </span>
          <span className={styles.statusMeta}>{message}</span>
        </div>
      </div>

      <div className={styles.frameWrap}>
        {previewUrl ? (
          <iframe
            key={frameKey}
            className={styles.frame}
            src={previewUrl}
            title={`${panel.title} preview`}
            onLoad={() => {
              setStatus('ready');
              setMessage('프리뷰가 로드되었습니다.');
            }}
          />
        ) : (
          <div className={styles.emptyState}>
            <strong>로컬 개발서버</strong>
            <span>프리뷰 URL을 아직 준비하지 못했습니다.</span>
          </div>
        )}
      </div>
    </section>
  );
}
