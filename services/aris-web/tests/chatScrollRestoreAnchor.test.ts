import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterfaceTsxPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx');
const chatInterfaceTsx = readFileSync(chatInterfaceTsxPath, 'utf8');

describe('chat tail restore anchor guards', () => {
  it('restores existing chat entry using the latest visible event anchor', () => {
    expect(chatInterfaceTsx).toMatch(/resolveTailScrollAnchorId/);
    expect(chatInterfaceTsx).toMatch(/latestVisibleEventId/);
    expect(chatInterfaceTsx).toMatch(/scrollIntoView\(\{ behavior, block: 'end' \}\)/);
  });
});
