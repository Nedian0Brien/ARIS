'use client';

import { useState } from 'react';
import { Cpu, KeyRound } from 'lucide-react';
import { ModelsSection } from './ModelsSection';
import { SshSection } from './SshSection';
import styles from './SettingsSurface.module.css';

type Section = 'models' | 'ssh';

type NavItem = {
  id: Section;
  label: string;
  hint: string;
  Icon: typeof Cpu;
};

const ITEMS: NavItem[] = [
  { id: 'models', label: 'Models', hint: 'API keys · catalog · defaults', Icon: Cpu },
  { id: 'ssh', label: 'SSH', hint: 'Terminal credentials', Icon: KeyRound },
];

export function SettingsSurface() {
  const [section, setSection] = useState<Section>('models');
  const activeItem = ITEMS.find((item) => item.id === section) ?? ITEMS[0];

  return (
    <div className={styles.shell}>
      <aside className={styles.rail} aria-label="Settings navigation">
        <header className={styles.railHeader}>
          <span className={styles.eyebrow}>Workspace</span>
          <h1 className={styles.title}>Settings</h1>
        </header>
        <nav className={styles.nav} role="tablist" aria-orientation="vertical">
          {ITEMS.map(({ id, label, hint, Icon }) => {
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
                <Icon size={16} aria-hidden className={styles.navIcon} />
                <span className={styles.navBody}>
                  <span className={styles.navLabel}>{label}</span>
                  <span className={styles.navHint}>{hint}</span>
                </span>
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
          <span className={styles.paneEyebrow}>{activeItem.hint}</span>
          <h2 className={styles.paneTitle}>{activeItem.label}</h2>
        </header>
        <div className={styles.paneBody}>
          {section === 'models' ? <ModelsSection /> : <SshSection />}
        </div>
      </main>
    </div>
  );
}
