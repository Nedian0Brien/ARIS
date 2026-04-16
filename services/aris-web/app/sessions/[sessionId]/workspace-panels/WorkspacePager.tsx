import React, { type ReactNode } from 'react';
import styles from './WorkspacePager.module.css';
import type { WorkspacePagerItem } from './pagerModel';

type WorkspacePagerProps = {
  items: WorkspacePagerItem[];
  activePageId: string;
  renderChatPage: () => ReactNode;
  renderCreatePage: () => ReactNode;
  renderPanelPage: (item: Extract<WorkspacePagerItem, { kind: 'panel' }>) => ReactNode;
};

export function WorkspacePager({
  items,
  activePageId,
  renderChatPage,
  renderCreatePage,
  renderPanelPage,
}: WorkspacePagerProps) {
  return (
    <div className={styles.pager} data-active-page-id={activePageId}>
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
