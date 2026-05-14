import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Ask ARIS knowledge product contract', () => {
  it('defines knowledge assets, source refs, Ask threads, and Ask messages in Prisma', () => {
    const schema = read('prisma/schema.prisma');

    expect(schema).toContain('model KnowledgeAsset');
    expect(schema).toContain('model KnowledgeSourceRef');
    expect(schema).toContain('model AskThread');
    expect(schema).toContain('model AskMessage');
    expect(schema).toContain('enum KnowledgeAssetStatus');
    expect(schema).toContain('candidate');
    expect(schema).toContain('confirmed');
    expect(schema).toContain('dismissed');
    expect(schema).toContain('includeInAskIndex Boolean @default(true)');
  });

  it('exposes the Ask ARIS and knowledge asset API routes from the plan', () => {
    [
      'app/api/ask/search/route.ts',
      'app/api/ask/threads/route.ts',
      'app/api/ask/threads/[threadId]/messages/route.ts',
      'app/api/knowledge-assets/route.ts',
      'app/api/knowledge-assets/[assetId]/route.ts',
      'app/api/knowledge-assets/extract/route.ts',
    ].forEach((relativePath) => {
      expect(existsSync(resolve(root, relativePath)), relativePath).toBe(true);
    });
  });

  it('renders Ask ARIS as a memory chatbot with assets, citations, and Project chat handoff', () => {
    const homePageClient = read('app/HomePageClient.tsx');
    const askSurface = read('components/ask/AskArisSurface.tsx');
    const uiCss = read('app/styles/ui.css');

    expect(homePageClient).toContain("from '@/components/ask/AskArisSurface'");
    expect(homePageClient).toContain('<AskArisSurface sessions={sessions}');
    expect(askSurface).toContain('/api/ask/search');
    expect(askSurface).toContain('/api/knowledge-assets');
    expect(askSurface).toContain('Project chat으로 이어가기');
    expect(askSurface).toContain('data-source-type="aris-memory"');
    expect(askSurface).toContain('data-source-type="external-search"');
    expect(uiCss).toContain('.ask-layout');
    expect(uiCss).toContain('.ask-citation');
    expect(uiCss).toContain('.ask-asset-card');
  });
});
