import { describe, expect, it } from 'vitest';
import { inferActionTypeFromCommand } from '../src/runtime/actionType.js';

describe('inferActionTypeFromCommand', () => {
  it('classifies mixed read/write shell commands as file_write', () => {
    const command = '/bin/bash -lc "cd /tmp/work && sed -n \'1,120p\' foo.ts && mkdir -p prisma/migrations && cat > prisma/migrations/001_init.sql <<\'SQL\'"';
    expect(inferActionTypeFromCommand(command)).toBe('file_write');
  });

  it('keeps pure read commands as file_read', () => {
    const command = '/bin/bash -lc "sed -n \'1,200p\' services/aris-web/app/page.tsx"';
    expect(inferActionTypeFromCommand(command)).toBe('file_read');
  });
});
