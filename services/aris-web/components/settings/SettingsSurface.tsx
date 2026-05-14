'use client';

import { useState } from 'react';
import { Cpu, KeyRound } from 'lucide-react';
import { ModelsSection } from './ModelsSection';
import { SshSection } from './SshSection';
import styles from './SettingsSurface.module.css';

type Section = 'models' | 'ssh';

const ITEMS: Array<{ id: Section; label: string; Icon: typeof Cpu }> = [
  { id: 'models', label: 'Models', Icon: Cpu },
  { id: 'ssh', label: 'SSH', Icon: KeyRound },
];

export function SettingsSurface() {
  const [section, setSection] = useState<Section>('models');
  return (
    <div className={styles.shell}>
      <aside className={styles.nav} aria-label="Settings sub-navigation">
        {ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`${styles.navItem}${section === id ? ' ' + styles.navItemActive : ''}`}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => setSection(id)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </aside>
      <div className={styles.body}>
        {section === 'models' ? <ModelsSection /> : <SshSection />}
      </div>
    </div>
  );
}
