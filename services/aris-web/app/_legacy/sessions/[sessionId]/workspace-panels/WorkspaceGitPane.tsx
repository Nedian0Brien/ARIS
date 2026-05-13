'use client';

import React from 'react';
import type { ComponentProps } from 'react';
import { CustomizationGitSection } from '../customization-sidebar/sections/CustomizationGitSection';
import styles from './WorkspaceShell.module.css';

type Props = ComponentProps<typeof CustomizationGitSection>;

export function WorkspaceGitPane(props: Props) {
  return (
    <div className={styles.modePaneSurface}>
      <CustomizationGitSection {...props} />
    </div>
  );
}
