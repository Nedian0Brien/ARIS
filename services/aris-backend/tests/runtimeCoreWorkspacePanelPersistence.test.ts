import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const runtimeCore = readFileSync(resolve(__dirname, '../src/runtime/runtimeCore.ts'), 'utf8');

describe('RuntimeCore workspace panel persistence boundary', () => {
  it('runs through the panel runtime session while persisting events to the project session', () => {
    expect(runtimeCore).toContain('persistenceSessionId?: string');
    expect(runtimeCore).toContain('runtimePersistenceProjectId');
    expect(runtimeCore).toContain('this.appendRunLifecycleEvent(persistenceSessionId');
    expect(runtimeCore).toContain('this.appendAgentMessage(persistenceSessionId');
  });
});
