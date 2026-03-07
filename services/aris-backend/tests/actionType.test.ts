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

  it('classifies echo/printf redirects without spaces as file_write', () => {
    expect(inferActionTypeFromCommand('/bin/bash -lc "echo hello>out.txt"')).toBe('file_write');
    expect(inferActionTypeFromCommand('/bin/bash -lc "printf %s\\\\n hello>>out.txt"')).toBe('file_write');
  });

  it('classifies redirects with spaces as file_write', () => {
    expect(inferActionTypeFromCommand('/bin/bash -lc "sed -n \'1,120p\' src/app.ts > out.txt"')).toBe('file_write');
    expect(inferActionTypeFromCommand('/bin/bash -lc "awk \'{print $1}\' src/app.ts > out.txt"')).toBe('file_write');
  });

  it('unwraps multiline bash -lc commands before classification', () => {
    const command = '/bin/bash -lc "echo hello > out.txt\\ncat out.txt"';
    expect(inferActionTypeFromCommand(command)).toBe('file_write');
  });

  it('prioritizes file_write over file_list for mixed commands', () => {
    const command = '/bin/bash -lc "ls -la && echo hello > out.txt"';
    expect(inferActionTypeFromCommand(command)).toBe('file_write');
  });

  it('does not treat quoted greater-than as redirect', () => {
    const command = "/bin/bash -lc 'echo \"a > b\"'";
    expect(inferActionTypeFromCommand(command)).toBe('command_execution');
  });
});
