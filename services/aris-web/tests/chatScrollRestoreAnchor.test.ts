import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Tail-restore anchor logic lives in the dedicated hook (extracted from ChatInterface)
const hookPath = resolve(__dirname, '../app/sessions/[sessionId]/useChatTailRestore.ts');
const hookSource = readFileSync(hookPath, 'utf8');

describe('chat tail restore anchor guards', () => {
  it('restores existing chat entry using the latest visible event anchor', () => {
    expect(hookSource).toMatch(/resolveTailScrollAnchorId/);
    expect(hookSource).toMatch(/latestVisibleEventId/);
    expect(hookSource).toMatch(/scrollIntoView\(\{ behavior, block: 'end' \}\)/);
  });
});
