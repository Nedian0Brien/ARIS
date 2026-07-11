'use client';

import type { CSSProperties } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Maximize2,
  PanelsTopLeft,
  RefreshCcw,
  X,
} from 'lucide-react';
import type { SessionChat, SessionSummary } from '@/lib/happy/types';
import {
  COMPOSER_MODE_COPY,
  agentLabel,
  displayProjectName,
  type ComposerMode,
  type PreviewState,
  type WorkspaceTab,
} from '../projectChatSurfaceUtils';

export type PreviewDevice = '1200' | '768' | '390';

export type ProjectPreviewOverlayProps = {
  previewTarget: string;
  previewDevice: PreviewDevice;
  setPreviewDevice: (device: PreviewDevice) => void;
  setPreviewState: (state: PreviewState) => void;
  handleCopy: (value: string, label: string) => void;
  showTransientFeedback: (message: string) => void;
  session: SessionSummary;
  activeChat: SessionChat | null;
  activeAgent: SessionSummary['agent'];
  activeModelLabel: string;
  composerMode: ComposerMode;
  workspaceTab: WorkspaceTab;
  selectedWorkspaceFile: string;
  projectPath: string;
  tokenLabel: string;
};

export function ProjectPreviewOverlay({
  previewTarget,
  previewDevice,
  setPreviewDevice,
  setPreviewState,
  handleCopy,
  showTransientFeedback,
  session,
  activeChat,
  activeAgent,
  activeModelLabel,
  composerMode,
  workspaceTab,
  selectedWorkspaceFile,
  projectPath,
  tokenLabel,
}: ProjectPreviewOverlayProps) {
  return (
    <>
      <div className="overlay" data-preview-overlay role="dialog" aria-modal="true" aria-label="Preview">
        <div className="preview-frame">
          <div className="preview-topbar">
            <div className="preview-topbar__nav">
              <button type="button" className="preview-topbar__btn" aria-label="Back"><ChevronLeft size={13} /></button>
              <button type="button" className="preview-topbar__btn" aria-label="Refresh" onClick={() => showTransientFeedback('Preview refreshed')}><RefreshCcw size={13} /></button>
            </div>
            <div className="preview-url">
              <span className="preview-url__protocol">https://</span>
              <span className="preview-url__target">{previewTarget}</span>
              <span className="preview-url__meta">project</span>
            </div>
            <div className="preview-device" role="tablist" aria-label="Preview size">
              {(['1200', '768', '390'] as const).map((device) => (
                <button key={device} type="button" aria-pressed={previewDevice === device} onClick={() => setPreviewDevice(device)}>{device}</button>
              ))}
            </div>
            <button type="button" className="preview-topbar__btn" aria-label="Copy preview URL" onClick={() => handleCopy(`https://${previewTarget}`, 'Preview URL')}><ExternalLink size={13} /></button>
            <button type="button" className="preview-topbar__btn" data-preview-dock aria-label="Dock preview" onClick={() => setPreviewState('dock')}><PanelsTopLeft size={13} /></button>
            <button type="button" className="preview-topbar__btn" aria-label="Close preview" onClick={() => setPreviewState('closed')}><X size={13} /></button>
          </div>
          <div className="preview-canvas" data-preview-size={previewDevice}>
            <div className="preview-page">
              <aside className="preview-page__sb">
                <div className="preview-page__sb-logo">ARIS</div>
                <div className="preview-page__sb-item preview-page__sb-item--active">{displayProjectName(session)}</div>
                <div className="preview-page__sb-item">{activeChat?.title ?? 'Project chat'}</div>
                <div className="preview-page__sb-item">{selectedWorkspaceFile}</div>
              </aside>
              <main className="preview-page__main">
                <h2 className="preview-page__h">{activeChat?.title ?? 'Project chat'}</h2>
                <p className="preview-page__sub">{agentLabel(activeAgent, activeModelLabel)} · {COMPOSER_MODE_COPY[composerMode]} · {tokenLabel}</p>
                <div className="preview-page__cards">
                  <div className="preview-page__card">
                    <div className="preview-page__card-t">Workspace</div>
                    <div className="preview-page__card-m">{workspaceTab} · {selectedWorkspaceFile}</div>
                    <div className="preview-page__bar"><div className="preview-page__bar-fill" style={{ width: '74%' } as CSSProperties} /></div>
                  </div>
                  <div className="preview-page__card">
                    <div className="preview-page__card-t">Context</div>
                    <div className="preview-page__card-m">{projectPath}</div>
                    <div className="preview-page__bar"><div className="preview-page__bar-fill" style={{ width: '42%' } as CSSProperties} /></div>
                  </div>
                </div>
              </main>
            </div>
            <div className="preview-controls">
              <button type="button" aria-label="Zoom out" onClick={() => showTransientFeedback('Preview zoom 90%')}><ChevronLeft size={12} /></button>
              <span className="preview-controls__zoom">100%</span>
              <button type="button" aria-label="Zoom in" onClick={() => showTransientFeedback('Preview zoom 110%')}><ChevronRight size={12} /></button>
              <span className="preview-controls__sep" />
              <button type="button" aria-label="Screenshot" onClick={() => showTransientFeedback('Screenshot staged')}><Copy size={12} /></button>
            </div>
          </div>
        </div>
      </div>
      <div className="preview-dock-wrap" data-preview-dock>
        <div className="preview-dock">
          <span className="preview-dock__thumb" />
          <span className="preview-dock__name">{selectedWorkspaceFile}</span>
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
