import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceShell } from '@/app/sessions/[sessionId]/workspace-panels/WorkspaceShell';

const workspaceShellCssPath = resolve(__dirname, '../app/sessions/[sessionId]/workspace-panels/WorkspaceShell.module.css');

vi.mock('@/app/sessions/[sessionId]/customization-sidebar/sections/CustomizationFilesSection', () => ({
  CustomizationFilesSection: () => React.createElement('div', null, 'Workspace Files Navigation'),
}));

describe('WorkspaceShell', () => {
  it('renders Files, Git, and Context as the primary workspace modes', () => {
    const markup = renderToStaticMarkup(React.createElement(WorkspaceShell, {
      sessionId: 'session-1',
      projectName: '/workspace',
      workspaceRootPath: '/workspace',
      requestedFile: null,
      mode: 'desktop',
    }));

    expect(markup).toContain('Workspace');
    expect(markup).toContain('Files');
    expect(markup).toContain('Git');
    expect(markup).toContain('Context');
    expect(markup).toContain('파일 링크를 누르거나 좌측 목록에서 선택하면 이 영역에서 바로 열립니다.');
    expect(markup).not.toContain('Customization');
  });

  it('locks the desktop rail and responsive breakpoint thresholds into the shell stylesheet', () => {
    const css = readFileSync(workspaceShellCssPath, 'utf8');

    expect(css).toContain('grid-template-columns: 88px minmax(0, 1fr);');
    expect(css).toContain('@media (min-width: 961px) and (max-width: 1279px)');
    expect(css).toContain('@media (min-width: 1280px)');
    expect(css).toContain('@media (max-width: 960px)');
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
  });
});
