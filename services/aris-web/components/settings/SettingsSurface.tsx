'use client';

import { useState } from 'react';
import { ModelsSection } from './ModelsSection';
import { SshSection } from './SshSection';
import styles from './SettingsSurface.module.css';

type Section = 'models' | 'ssh';

type NavItem = {
  id: Section;
  label: string;
  badge?: string;
};

const ITEMS: NavItem[] = [
  { id: 'models', label: 'Models' },
  { id: 'ssh', label: 'SSH' },
];

export function SettingsSurface() {
  const [section, setSection] = useState<Section>('models');
  const activeItem = ITEMS.find((item) => item.id === section) ?? ITEMS[0];

  return (
    <div className={styles.shell}>
      <aside className={styles.rail} aria-label="Settings navigation">
        <h1 className={styles.title}>설정</h1>
        <nav className={styles.nav} role="tablist" aria-orientation="vertical">
          {ITEMS.map(({ id, label, badge }) => {
            const isActive = section === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`settings-tab-${id}`}
                aria-controls={`settings-panel-${id}`}
                aria-selected={isActive}
                aria-current={isActive ? 'page' : undefined}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                onClick={() => setSection(id)}
              >
                <span className={styles.navLabel}>{label}</span>
                {badge ? <span className={styles.navBadge}>{badge}</span> : null}
              </button>
            );
          })}
        </nav>
      </aside>

      <main
        className={styles.pane}
        role="tabpanel"
        id={`settings-panel-${section}`}
        aria-labelledby={`settings-tab-${section}`}
      >
        <header className={styles.paneHeader}>
          <h2 className={styles.paneTitle}>{activeItem.label}</h2>
        </header>
        <div className={styles.paneBody}>
          {section === 'models' ? <ModelsSection /> : <SshSection />}
        </div>
      </main>
    </div>
  );
}
