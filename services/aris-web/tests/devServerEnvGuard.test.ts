import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dev server environment guard', () => {
  it('fails fast before Prisma starts when DATABASE_URL is missing', () => {
    const serverSource = readFileSync(resolve(__dirname, '../server.mjs'), 'utf8');
    const guardIndex = serverSource.indexOf('DATABASE_URL is not set');
    const prismaIndex = serverSource.indexOf('const prisma = new PrismaClient()');

    expect(guardIndex).toBeGreaterThan(-1);
    expect(prismaIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(prismaIndex);
    expect(serverSource).toContain('deploy/dev/run_web_dev_hot_reload.sh');
    expect(serverSource).toContain('process.exit(1)');
  });
});
