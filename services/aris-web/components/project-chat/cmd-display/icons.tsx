import React from 'react';
import type { IconName } from '@/lib/cmd/types';

type Props = { size?: number; className?: string };

const PATHS: Record<IconName, React.ReactNode> = {
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>,
  pen: <><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
  folder: <path d="M3 6a2 2 0 0 1 2-2h3l2 2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
  folderSearch: <><path d="M3 6a2 2 0 0 1 2-2h3l2 2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="13" cy="13" r="2"/><path d="M15 15l2.2 2.2"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8l3 3-3 3M13 14h4"/></>,
  globe: <><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></>,
  package: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></>,
  shield: <><path d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z"/><path d="M9 12l2 2 4-4"/></>,
  flask: <><path d="M9 2v6.5a2 2 0 0 1-.34 1.12L3.4 18.4A1 1 0 0 0 4.23 20h15.54a1 1 0 0 0 .83-1.6l-5.26-8.78a2 2 0 0 1-.34-1.12V2"/><path d="M7 2h10"/></>,
  gitBranch: <><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><circle cx="6" cy="18" r="2"/><path d="M6 8v8M8 18h2a4 4 0 0 0 4-4V8"/></>,
  container: <><rect x="3" y="9" width="14" height="9" rx="1"/><path d="M17 13h3.5L22 11l-1.5-1H17M3 13l3-3M9 13l3-3"/></>,
  trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></>,
  brain: <path d="M9.5 2A4.5 4.5 0 0 0 5 6.5v0a4 4 0 0 0-2 7.5v0a4 4 0 0 0 2 7.5v0a4.5 4.5 0 0 0 4.5 0V2zM14.5 2A4.5 4.5 0 0 1 19 6.5v0a4 4 0 0 1 2 7.5v0a4 4 0 0 1-2 7.5v0a4.5 4.5 0 0 1-4.5 0V2z"/>,
  todoList: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  prompt: <><path d="M4 7l4 4-4 4"/><path d="M12 17h8"/></>,
  chevronRight: <path d="M9 18l6-6-6-6"/>,
  chevronDown: <path d="M6 9l6 6 6-6"/>,
  x: <path d="M18 6L6 18M6 6l12 12"/>,
};

export function CmdIcon({ name, size = 12, className }: { name: IconName } & Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
