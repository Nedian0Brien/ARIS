import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookPath = resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/hooks/useChatLayoutState.ts');

const hookSource = readFileSync(hookPath, 'utf8');

describe('chat responsive layout sync guards', () => {
  it('resyncs layout state on generic viewport resizes so desktop breakpoint crossings do not stale', () => {
    expect(hookSource).toContain("window.addEventListener('resize', syncLayout, { passive: true });");
    expect(hookSource).toContain("window.visualViewport?.addEventListener('resize', syncLayout);");
  });
});
