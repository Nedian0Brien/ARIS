import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const homePageClient = readFileSync(resolve(__dirname, '../app/HomePageClient.tsx'), 'utf8');

describe('home surface copy', () => {
  it('labels the home projects section as Recent Project', () => {
    expect(homePageClient).toContain('<h2>Recent Project</h2>');
    expect(homePageClient).toContain('aria-label="Recent Project"');
  });

  it('labels the home feed section as Recent Chat', () => {
    expect(homePageClient).toContain('<h2>Recent Chat</h2>');
    expect(homePageClient).toContain('aria-label="Recent Chat"');
    expect(homePageClient).not.toContain('<h2>Recent activity</h2>');
    expect(homePageClient).not.toContain('aria-label="Recent activity"');
  });
});
