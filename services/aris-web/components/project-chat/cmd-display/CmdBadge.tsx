'use client';
import React from 'react';
import type { ToneName, IconName } from '@/lib/cmd/types';
import { CmdIcon } from './icons';

export type CmdBadgeProps = {
  tone: ToneName;
  icon: IconName;
  label: string;
  isRunning?: boolean;
  isError?: boolean;
  isOpen?: boolean;
  clickable?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  ariaLabel?: string;
};

export function CmdBadge({ tone, icon, label, isRunning, isError, isOpen, clickable, onClick, ariaLabel }: CmdBadgeProps) {
  const Tag: 'button' | 'span' = clickable ? 'button' : 'span';
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      className="cmd-badge"
      data-tone={tone}
      data-clickable={clickable ? 'true' : undefined}
      data-open={isOpen ? 'true' : undefined}
      data-running={isRunning ? 'true' : undefined}
      data-error={isError ? 'true' : undefined}
      onClick={onClick}
      aria-label={ariaLabel ?? `${label}${isError ? ' · error' : isRunning ? ' · running' : ''}`}
    >
      <CmdIcon name={icon} size={11} />
      <span>{label}</span>
    </Tag>
  );
}
