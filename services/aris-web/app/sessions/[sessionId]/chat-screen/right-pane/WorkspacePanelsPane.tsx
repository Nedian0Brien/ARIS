'use client';

import { BackendNotice } from '@/components/ui/BackendNotice';
import type { WorkspacePanelLayout, WorkspacePanelType } from '@/lib/workspacePanels/types';
import { CreatePanelPage } from '../../workspace-panels/CreatePanelPage';
import { PanelPageRenderer } from '../../workspace-panels/PanelPageRenderer';
import styles from '../../ChatInterface.module.css';

type WorkspacePanelsPaneBaseProps = {
  sessionId: string;
  isMobileLayout: boolean;
  workspacePanelsError: string | null;
  workspacePanelsLoading: boolean;
  workspacePanelLayout: WorkspacePanelLayout;
};

type WorkspacePanelsCreatePaneProps = WorkspacePanelsPaneBaseProps & {
  mode: 'create';
  onCreatePanel: (type: WorkspacePanelType) => void;
};

type WorkspacePanelsPanelPaneProps = WorkspacePanelsPaneBaseProps & {
  mode: 'panel';
  panelId: string;
  onSavePanel: (panelId: string, updates: { title?: string; config?: Record<string, unknown> }) => Promise<unknown>;
  onDeletePanel: (panelId: string) => Promise<unknown>;
};

type WorkspacePanelsPaneProps = WorkspacePanelsCreatePaneProps | WorkspacePanelsPanelPaneProps;

export function WorkspacePanelsPane(props: WorkspacePanelsPaneProps) {
  const frameClassName = `${styles.centerFrame} ${props.isMobileLayout ? styles.centerFrameMobileScroll : ''}`;
  const streamClassName = `${styles.stream} ${props.isMobileLayout ? styles.streamMobileScroll : ''}`;

  return (
    <section className={frameClassName}>
      <div className={streamClassName}>
        {props.workspacePanelsError ? (
          <div className={styles.noticeWrap}>
            <BackendNotice message={props.workspacePanelsError} />
          </div>
        ) : null}
        {props.mode === 'create' ? (
          props.workspacePanelsLoading ? (
            <div className={styles.emptyChatState}>
              <div className={styles.agentSelectorTitle}>패널 화면을 준비하는 중…</div>
            </div>
          ) : (
            <CreatePanelPage onCreatePanel={props.onCreatePanel} />
          )
        ) : (
          (() => {
            const panel = props.workspacePanelLayout.panels.find((candidate) => candidate.id === props.panelId);

            return panel ? (
              <PanelPageRenderer
                sessionId={props.sessionId}
                panel={panel}
                onSavePanel={props.onSavePanel}
                onDeletePanel={props.onDeletePanel}
              />
            ) : (
              <div className={styles.emptyChatState}>
                <div className={styles.agentSelectorTitle}>패널을 찾을 수 없습니다.</div>
              </div>
            );
          })()
        )}
      </div>
    </section>
  );
}
