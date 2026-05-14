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

  return (
    <div className={styles.shell}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>Workspace · Runtime Settings</span>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.lede}>
          Provider credentials, model catalogs, and terminal access. Keys are stored encrypted and stay
          scoped to this workspace.
        </p>
      </header>

      <nav className={styles.tabs} aria-label="Settings sub-navigation" role="tablist">
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
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => setSection(id)}
            >
              <Icon size={14} aria-hidden className={styles.tabIcon} />
              <span className={styles.tabLabel}>{label}</span>
              <span className={styles.tabHint}>{hint}</span>
            </button>
          );
        })}
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
  );
}
