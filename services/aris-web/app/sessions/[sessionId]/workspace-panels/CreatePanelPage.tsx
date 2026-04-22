import React from 'react';
import type { WorkspacePanelType } from '@/lib/workspacePanels/types';
import styles from './CreatePanelPage.module.css';

const PANEL_CHOICES: Array<{
  type: WorkspacePanelType;
  label: string;
  description: string;
  badge: string;
}> = [
  {
    type: 'preview',
    label: 'Preview',
    description: '로컬 웹 개발서버를 바로 띄웁니다.',
    badge: 'Ready',
  },
  {
    type: 'explorer',
    label: 'Workspace',
    description: 'Customization, 파일, Git 도구를 한 화면에 엽니다.',
    badge: 'Ready',
  },
  {
    type: 'terminal',
    label: 'Terminal',
    description: '세션 셸과 명령 실행 화면이 들어올 자리입니다.',
    badge: 'Soon',
  },
  {
    type: 'bookmark',
    label: 'Bookmark',
    description: '스크립트와 문서 바로가기가 들어올 자리입니다.',
    badge: 'Soon',
  },
];

type CreatePanelPageProps = {
  onCreatePanel: (type: WorkspacePanelType) => void;
  onReturnToChat?: () => void;
};

export function CreatePanelPage({ onCreatePanel, onReturnToChat }: CreatePanelPageProps) {
  return (
    <section className={styles.root}>
      <div className={styles.hero}>
        {onReturnToChat ? (
          <button type="button" className={styles.backButton} onClick={onReturnToChat}>
            채팅으로 돌아가기
          </button>
        ) : null}
        <h3 className={styles.title}>새 패널 만들기</h3>
        <p className={styles.description}>워크스페이스 화면에 추가할 패널 타입을 고르세요.</p>
      </div>
      <div className={styles.grid}>
        {PANEL_CHOICES.map((choice) => (
          <button
            key={choice.type}
            type="button"
            className={styles.tile}
            onClick={() => onCreatePanel(choice.type)}
          >
            <span className={styles.tileBadge}>{choice.badge}</span>
            <div>
              <div className={styles.tileLabel}>{choice.label}</div>
              <div className={styles.tileMeta}>{choice.description}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
