import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectChatSurfacePath = resolve(__dirname, '../components/project-chat/ProjectChatSurface.tsx');
const projectChatCssPath = resolve(__dirname, '../app/styles/project-chat.css');

const projectChatSurface = readFileSync(projectChatSurfacePath, 'utf8');
const projectChatCss = readFileSync(projectChatCssPath, 'utf8');

function readCssBlock(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? '';
}

describe('chat mobile scroll ownership', () => {
  it('keeps the active project chat shell and timeline as contained scroll regions', () => {
    const proto = readCssBlock(projectChatCss, '.pc-proto');
    const shell = readCssBlock(projectChatCss, '.pc-proto .shell');
    const main = readCssBlock(projectChatCss, '.pc-proto .shell__main');
    const timeline = readCssBlock(projectChatCss, '.pc-proto .tl');

    expect(proto).toContain('overflow: hidden;');
    expect(shell).toContain('height: calc(100vh - 238px);');
    expect(main).toContain('min-height: 0;');
    expect(timeline).toContain('overflow-y: auto;');
    expect(timeline).not.toContain('overflow: visible;');
  });

  it('drives project chat tail restore through the timeline instead of window scroll writes', () => {
    expect(projectChatSurface).toContain('timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight');
    expect(projectChatSurface).toContain('node.scrollTop = node.scrollHeight;');
    expect(projectChatSurface).not.toContain('window.scrollTo(');
  });

  it('avoids window-scroll reads in the active project chat scroll sync path', () => {
    expect(projectChatSurface).not.toContain('getWindowScrollTop()');
    expect(projectChatSurface).not.toContain('isNearWindowBottom()');
  });
});
