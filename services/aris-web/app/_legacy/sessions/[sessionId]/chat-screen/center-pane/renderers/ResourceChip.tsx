'use client';

import React from 'react';
import type { ReactNode } from 'react';
import { FilePenLine, FileSearch, FolderTree, MessageSquareText, TerminalSquare } from 'lucide-react';
import { dispatchWorkspaceFileOpen } from '../../helpers';
import type { ResourceLabel } from '../../types';
import styles from '../../../ChatInterface.module.css';

function resolveFileIconMeta(extension: string): { Icon: React.ComponentType<{ size?: number }>; iconClassName: string } {
  const ext = extension.toLowerCase();
  if (ext === 'py' || ext === 'sh' || ext === 'bash' || ext === 'zsh') {
    return { Icon: TerminalSquare, iconClassName: styles.resourceIconShell };
  }
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
    return { Icon: FilePenLine, iconClassName: styles.resourceIconCode };
  }
  if (ext === 'json' || ext === 'yml' || ext === 'yaml' || ext === 'toml') {
    return { Icon: FileSearch, iconClassName: styles.resourceIconConfig };
  }
  if (ext === 'md' || ext === 'txt' || ext === 'rst') {
    return { Icon: MessageSquareText, iconClassName: styles.resourceIconDoc };
  }
  return { Icon: FileSearch, iconClassName: styles.resourceIconOther };
}

export function ResourceChip({ resource }: { resource: ResourceLabel }) {
  if (resource.kind === 'folder') {
    return (
      <span className={`${styles.resourceChip} ${styles.resourceChipFolder}`} title={resource.sourcePath}>
        <span className={`${styles.resourceChipIcon} ${styles.resourceIconFolder}`}>
          <FolderTree size={12} />
        </span>
        <span className={styles.resourceChipText}>{resource.name}</span>
      </span>
    );
  }

  const { Icon, iconClassName } = resolveFileIconMeta(resource.extension);
  return (
    <button
      type="button"
      className={`${styles.resourceChip} ${styles.resourceChipFile} ${styles.resourceChipButton}`}
      title={resource.sourcePath}
      onClick={() => {
        if (resource.sourcePath) {
          dispatchWorkspaceFileOpen({
            path: resource.sourcePath,
            name: resource.name,
            line: resource.sourceLine ?? null,
          });
        }
      }}
      disabled={!resource.sourcePath}
    >
      <span className={`${styles.resourceChipIcon} ${iconClassName}`}>
        <Icon size={12} />
      </span>
      <span className={styles.resourceChipText}>{resource.name}</span>
    </button>
  );
}

export function InlineResourceChip({ resource }: { resource: ResourceLabel }) {
  return (
    <span className={styles.inlineResourceChipWrap}>
      <ResourceChip resource={resource} />
    </span>
  );
}

export function ResourceLabelStrip({ resources }: { resources: ResourceLabel[] }): ReactNode {
  if (resources.length === 0) {
    return null;
  }

  return (
    <div className={styles.resourceLabelList}>
      {resources.map((resource, index) => (
        <ResourceChip key={`${resource.kind}:${resource.name}:${resource.sourcePath ?? index}`} resource={resource} />
      ))}
    </div>
  );
}
