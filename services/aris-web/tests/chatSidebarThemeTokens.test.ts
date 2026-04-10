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
    expect(css).toMatch(/\.chatListItemStateRunning\s*\{[^}]*border-color:\s*var\(--chat-status-running-border\);[^}]*background:\s*var\(--chat-status-running-bg\);/s);
    expect(css).toMatch(/\.chatListItemStateCompleted\s*\{[^}]*border-color:\s*var\(--chat-status-completed-border\);[^}]*background:\s*var\(--chat-status-completed-bg\);/s);
    expect(css).toMatch(/\.chatListItemStateApproval\s*\{[^}]*border-color:\s*var\(--chat-status-approval-border\);[^}]*background:\s*var\(--chat-status-approval-bg\);/s);
    expect(css).toMatch(/\.chatListItemStateError\s*\{[^}]*border-color:\s*var\(--chat-status-error-border\);[^}]*background:\s*var\(--chat-status-error-bg\);/s);
    expect(css).toMatch(/\.chatListRunPhaseBadgeSubmitting\s*\{[^}]*background:\s*var\(--chat-status-submitting-badge-bg\);[^}]*color:\s*var\(--chat-status-submitting-text\);/s);
    expect(css).toMatch(/\.chatListRunPhaseBadgeApproval\s*\{[^}]*background:\s*var\(--chat-status-approval-badge-bg\);[^}]*color:\s*var\(--chat-status-approval-text\);/s);
  });
});
