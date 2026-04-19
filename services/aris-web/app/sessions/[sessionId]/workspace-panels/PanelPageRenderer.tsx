import React from 'react';
import type { WorkspacePanelRecord } from '@/lib/workspacePanels/types';
import { PlaceholderPanelPage } from './PlaceholderPanelPage';
import { PreviewPanelPage } from './PreviewPanelPage';

type PanelPageRendererProps = {
  sessionId: string;
  panel: WorkspacePanelRecord;
  onSavePanel?: (panelId: string, updates: { title?: string; config?: Record<string, unknown> }) => Promise<unknown>;
  onDeletePanel?: (panelId: string) => Promise<unknown>;
  onReturnToChat?: () => void;
};

const PLACEHOLDER_DESCRIPTIONS: Record<WorkspacePanelRecord['type'], string> = {
  preview: '로컬 웹 개발서버 프리뷰가 여기에 연결됩니다.',
  explorer: '파일 트리와 문서 탐색이 여기에 들어옵니다.',
  terminal: '세션 셸과 명령 실행 화면이 여기에 들어옵니다.',
  bookmark: '스크립트와 문서 바로가기가 여기에 들어옵니다.',
};

export function PanelPageRenderer({
  sessionId,
  panel,
  onSavePanel,
  onDeletePanel,
  onReturnToChat,
}: PanelPageRendererProps) {
  if (panel.type === 'preview') {
    return (
      <PreviewPanelPage
        sessionId={sessionId}
        panel={panel}
        onSavePanel={onSavePanel}
        onDeletePanel={onDeletePanel}
        onReturnToChat={onReturnToChat}
      />
    );
  }

  return (
    <PlaceholderPanelPage
      title={panel.title}
      description={PLACEHOLDER_DESCRIPTIONS[panel.type]}
      onReturnToChat={onReturnToChat}
    />
  );
}
