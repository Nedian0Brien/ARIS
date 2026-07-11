'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  Maximize2,
  PanelsTopLeft,
  RefreshCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { readLocalStorage, writeLocalStorage } from '@/lib/browser/localStorage';
import { withAppBasePath } from '@/lib/routing/appPath';
import { buildLocalPreviewProxyBasePath, parseLocalPreviewPort } from '@/lib/preview/localPreviewProxy';
import type { PreviewState } from '../projectChatSurfaceUtils';

export type PreviewDevice = '1200' | '768' | '390';

type PreviewMode = 'server' | 'file';

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;
const DEFAULT_PREVIEW_PORT = 3305;

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);

function fileExtension(path: string): string {
  const name = path.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function portStorageKey(projectId: string): string {
  return `aris.preview-port.${projectId}`;
}

export type ProjectPreviewOverlayProps = {
  projectId: string;
  previewDevice: PreviewDevice;
  setPreviewDevice: (device: PreviewDevice) => void;
  setPreviewState: (state: PreviewState) => void;
  handleCopy: (value: string, label: string) => void;
  selectedWorkspaceFile: string;
};

// 실동작 프리뷰: 로컬 dev 서버를 동일 출처 프록시(iframe)로 렌더하고,
// dev 서버가 없으면 선택한 HTML/이미지 파일을 렌더한다.
export function ProjectPreviewOverlay({
  projectId,
  previewDevice,
  setPreviewDevice,
  setPreviewState,
  handleCopy,
  selectedWorkspaceFile,
}: ProjectPreviewOverlayProps) {
  const [mode, setMode] = useState<PreviewMode>('server');
  const [portInput, setPortInput] = useState(() => {
    const saved = parseLocalPreviewPort(readLocalStorage(portStorageKey(projectId)));
    return String(saved ?? DEFAULT_PREVIEW_PORT);
  });
  const [zoomIndex, setZoomIndex] = useState(2);
  const [iframeEpoch, setIframeEpoch] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const saved = parseLocalPreviewPort(readLocalStorage(portStorageKey(projectId)));
    setPortInput(String(saved ?? DEFAULT_PREVIEW_PORT));
  }, [projectId]);

  const port = parseLocalPreviewPort(portInput);
  const proxyBasePath = port !== null
    ? withAppBasePath(buildLocalPreviewProxyBasePath({ projectId, port }))
    : null;
  const serverSrc = proxyBasePath ? `${proxyBasePath}/` : null;

  const fileTarget = useMemo(() => {
    if (!selectedWorkspaceFile) return null;
    const ext = fileExtension(selectedWorkspaceFile);
    const kind = HTML_EXTENSIONS.has(ext) ? 'html' : IMAGE_EXTENSIONS.has(ext) ? 'image' : null;
    if (!kind) return null;
    const params = new URLSearchParams();
    params.set('path', selectedWorkspaceFile);
    params.set('projectId', projectId);
    return { kind, url: withAppBasePath(`/api/fs/raw?${params.toString()}`) } as const;
  }, [projectId, selectedWorkspaceFile]);

  const zoom = ZOOM_STEPS[zoomIndex] ?? 1;
  const displayTarget = mode === 'server'
    ? `127.0.0.1:${portInput}/`
    : selectedWorkspaceFile || '파일을 선택하세요';

  const commitPort = (value: string) => {
    const parsed = parseLocalPreviewPort(value);
    if (parsed !== null) {
      writeLocalStorage(portStorageKey(projectId), String(parsed));
      setIframeEpoch((epoch) => epoch + 1);
    }
  };

  const navigateHistory = (delta: -1 | 1) => {
    // 동일 출처 프록시라 iframe history 접근이 가능하다.
    try {
      iframeRef.current?.contentWindow?.history.go(delta);
    } catch {
      // 파일 모드 등 접근 불가 시 무시
    }
  };

  return (
    <>
      <div className="overlay" data-preview-overlay role="dialog" aria-modal="true" aria-label="Preview">
        <div className="preview-frame">
          <div className="preview-topbar">
            <div className="preview-topbar__nav">
              <button type="button" className="preview-topbar__btn" aria-label="Back" disabled={mode !== 'server'} onClick={() => navigateHistory(-1)}><ChevronLeft size={13} /></button>
              <button type="button" className="preview-topbar__btn" aria-label="Forward" disabled={mode !== 'server'} onClick={() => navigateHistory(1)}><ChevronRight size={13} /></button>
              <button type="button" className="preview-topbar__btn" aria-label="Refresh" onClick={() => setIframeEpoch((epoch) => epoch + 1)}><RefreshCcw size={13} /></button>
            </div>
            <div className="preview-url">
              {mode === 'server' ? (
                <>
                  <span className="preview-url__protocol">127.0.0.1:</span>
                  <input
                    className="preview-url__port"
                    value={portInput}
                    inputMode="numeric"
                    aria-label="dev 서버 포트"
                    onChange={(event) => setPortInput(event.target.value.replace(/[^0-9]/g, ''))}
                    onBlur={(event) => commitPort(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitPort((event.target as HTMLInputElement).value);
                    }}
                  />
                  <span className="preview-url__meta">local dev</span>
                </>
              ) : (
                <>
                  <span className="preview-url__target" title={displayTarget}>{displayTarget}</span>
                  <span className="preview-url__meta">file</span>
                </>
              )}
            </div>
            <div className="preview-mode-toggle" role="tablist" aria-label="Preview source">
              <button type="button" aria-pressed={mode === 'server'} onClick={() => setMode('server')}><Globe size={12} />Server</button>
              <button type="button" aria-pressed={mode === 'file'} onClick={() => setMode('file')}><FileText size={12} />File</button>
            </div>
            <div className="preview-device" role="tablist" aria-label="Preview size">
              {(['1200', '768', '390'] as const).map((device) => (
                <button key={device} type="button" aria-pressed={previewDevice === device} onClick={() => setPreviewDevice(device)}>{device}</button>
              ))}
            </div>
            <button
              type="button"
              className="preview-topbar__btn"
              aria-label="Copy preview URL"
              onClick={() => handleCopy(mode === 'server' ? `http://${displayTarget}` : displayTarget, 'Preview URL')}
            >
              <ExternalLink size={13} />
            </button>
            <button type="button" className="preview-topbar__btn" data-preview-dock aria-label="Dock preview" onClick={() => setPreviewState('dock')}><PanelsTopLeft size={13} /></button>
            <button type="button" className="preview-topbar__btn" aria-label="Close preview" onClick={() => setPreviewState('closed')}><X size={13} /></button>
          </div>
          <div className="preview-canvas" data-preview-size={previewDevice}>
            <div
              className="preview-viewport"
              style={{ transform: `scale(${zoom})`, width: `${100 / zoom}%`, height: `${100 / zoom}%` }}
            >
              {mode === 'server' ? (
                serverSrc ? (
                  <iframe
                    key={`server-${iframeEpoch}-${serverSrc}`}
                    ref={iframeRef}
                    className="preview-iframe"
                    src={serverSrc}
                    title="Local dev server preview"
                  />
                ) : (
                  <div className="preview-empty">유효한 포트를 입력하세요.</div>
                )
              ) : fileTarget ? (
                fileTarget.kind === 'html' ? (
                  <iframe
                    key={`file-${iframeEpoch}-${fileTarget.url}`}
                    className="preview-iframe"
                    src={fileTarget.url}
                    sandbox=""
                    title="Workspace file preview"
                  />
                ) : (
                  <div className="preview-image-wrap">
                    <img className="preview-image" src={fileTarget.url} alt={selectedWorkspaceFile} />
                  </div>
                )
              ) : (
                <div className="preview-empty">
                  Files 탭에서 HTML 또는 이미지 파일을 선택하면 여기서 렌더됩니다.
                </div>
              )}
            </div>
            <div className="preview-controls">
              <button type="button" aria-label="Zoom out" disabled={zoomIndex === 0} onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}><ZoomOut size={12} /></button>
              <span className="preview-controls__zoom">{Math.round(zoom * 100)}%</span>
              <button type="button" aria-label="Zoom in" disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}><ZoomIn size={12} /></button>
            </div>
          </div>
        </div>
      </div>
      <div className="preview-dock-wrap" data-preview-dock>
        <div className="preview-dock">
          <span className="preview-dock__thumb" />
          <span className="preview-dock__name">{mode === 'server' ? `127.0.0.1:${portInput}` : selectedWorkspaceFile || 'preview'}</span>
          <span className="preview-dock__meta">{previewDevice}</span>
          <button type="button" className="preview-dock__btn preview-dock__btn--live" data-preview-open aria-label="Expand preview" onClick={() => setPreviewState('open')}>
            <Maximize2 size={12} />
          </button>
          <button type="button" className="preview-dock__btn" aria-label="Close preview dock" onClick={() => setPreviewState('closed')}>
            <X size={12} />
          </button>
        </div>
      </div>
    </>
  );
}
