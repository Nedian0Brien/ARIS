'use client';

import { useState } from 'react';
import { Cpu, KeyRound, Settings2 } from 'lucide-react';
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
  const active = ITEMS.find((item) => item.id === section) ?? ITEMS[0];

  return (
    <div className={styles.shell}>
      <header className={styles.hero}>
        <span className={styles.heroEyebrow}>
          <Settings2 size={12} aria-hidden />
          Workspace · Runtime Settings
        </span>
        <h1 className={styles.heroTitle}>Settings</h1>
        <p className={styles.heroDescription}>
          Provider credentials, model catalogs, and terminal access all live here. Keys are stored
          encrypted and stay scoped to this workspace.
        </p>
      </header>

      <div className={styles.layout}>
        <nav
          className={styles.nav}
          aria-label="Settings sub-navigation"
          role="tablist"
          aria-orientation="vertical"
        >
          <span className={styles.navHeader}>Sections</span>
          {ITEMS.map(({ id, label, Icon }) => {
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
                className={`${styles.navItem}${isActive ? ' ' + styles.navItemActive : ''}`}
                onClick={() => setSection(id)}
              >
                <span className={styles.navIcon} aria-hidden>
                  <Icon size={16} />
                </span>
                {label}
              </button>
            );
          })}
          <div className={styles.navHint}>
            <strong>{active.label}</strong>
            {active.hint}
          </div>
        </nav>

        <div
          className={styles.body}
          role="tabpanel"
          id={`settings-panel-${section}`}
          aria-labelledby={`settings-tab-${section}`}
        >
          {section === 'models' ? <ModelsSection /> : <SshSection />}
        </div>
      </div>
    </div>
  );
}
