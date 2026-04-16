import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css');
const css = readFileSync(cssPath, 'utf8');

describe('chat sidebar status theming tokens', () => {
  it('defines sidebar status tokens for light and dark mode', () => {
    expect(css).toContain('--chat-sidebar-preview-text:');
    expect(css).toContain('--chat-sidebar-preview-icon:');
    expect(css).toContain('--chat-status-running-bg:');
    expect(css).toContain('--chat-status-running-border:');
    expect(css).toContain('--chat-status-running-text:');
    expect(css).toContain('--chat-status-completed-bg:');
    expect(css).toContain('--chat-status-approval-bg:');
    expect(css).toContain('--chat-status-error-bg:');
    expect(css).toContain(":global(html[data-theme='dark']) .chatShell {");
    expect(css).toContain('--chat-status-running-bg:');
  });

  it('uses tokens instead of hard-coded colors in sidebar chat status styles', () => {
    expect(css).toMatch(/\.chatListPreviewIcon\s*\{[^}]*color:\s*var\(--chat-sidebar-preview-icon\)/s);
    expect(css).toMatch(/\.chatListPreviewText\s*\{[^}]*color:\s*var\(--chat-sidebar-preview-text\)/s);
    // Phase 1 visual redesign: state is expressed via left accent bar (::before)
    // using semantic accent tokens instead of full border/background fills.
    expect(css).toMatch(/\.chatListItemStateRunning::before\s*\{[^}]*background:\s*var\(--accent-sky\)/s);
    expect(css).toMatch(/\.chatListItemStateCompleted::before\s*\{[^}]*background:\s*color-mix\([^)]*var\(--chat-text-muted\)/s);
    expect(css).toMatch(/\.chatListItemStateApproval::before\s*\{[^}]*background:\s*var\(--accent-amber\)/s);
    expect(css).toMatch(/\.chatListItemStateError::before\s*\{[^}]*background:\s*var\(--accent-red\)/s);
    // Run phase label is inline, muted, and derives color from tokens rather than hard-coded values.
    expect(css).toMatch(/\.chatListRunPhaseBadgeRunning\s*\{[^}]*color:\s*var\(--accent-sky\)/s);
    expect(css).toMatch(/\.chatListRunPhaseBadgeApproval\s*\{[^}]*color:\s*var\(--accent-amber\)/s);
  });
});
