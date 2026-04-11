import { describe, expect, it } from 'vitest';
import {
  parseLocalFileReferenceTarget,
  scanMarkdownLinks,
  tokenizePlainTextFileReferences,
} from '@/app/sessions/[sessionId]/chatFileReferences';

describe('parseLocalFileReferenceTarget', () => {
  it('parses absolute paths with line suffixes', () => {
    expect(parseLocalFileReferenceTarget('/home/ubuntu/project/ARIS/docs/spec.md:12')).toEqual({
      path: '/home/ubuntu/project/ARIS/docs/spec.md',
      line: 12,
      extension: 'md',
      name: 'spec.md',
    });
  });

  it('parses angle-bracket paths with spaces', () => {
    expect(parseLocalFileReferenceTarget('</home/ubuntu/project/ARIS/docs/spec file.md:3>')).toEqual({
      path: '/home/ubuntu/project/ARIS/docs/spec file.md',
      line: 3,
      extension: 'md',
      name: 'spec file.md',
    });
  });

  it('ignores external urls', () => {
    expect(parseLocalFileReferenceTarget('https://example.com/docs/spec.md')).toBeNull();
  });
});

describe('scanMarkdownLinks', () => {
  it('finds markdown links whose targets are local files', () => {
    const matches = scanMarkdownLinks(
      'See [design doc](</home/ubuntu/project/ARIS/docs/superpowers/specs/2026-04-11-chat-file-badge-design.md:1>)',
    );

    expect(matches).toEqual([
      {
        fullMatch: '[design doc](</home/ubuntu/project/ARIS/docs/superpowers/specs/2026-04-11-chat-file-badge-design.md:1>)',
        label: 'design doc',
        target: '</home/ubuntu/project/ARIS/docs/superpowers/specs/2026-04-11-chat-file-badge-design.md:1>',
      },
    ]);
  });
});

describe('tokenizePlainTextFileReferences', () => {
  it('extracts relative plain-text file paths with line suffixes', () => {
    expect(tokenizePlainTextFileReferences('Updated services/aris-web/app/page.tsx:24 right after the header.')).toEqual([
      { type: 'text', value: 'Updated ' },
      {
        type: 'file',
        value: 'services/aris-web/app/page.tsx:24',
        path: 'services/aris-web/app/page.tsx',
        line: 24,
        extension: 'tsx',
        name: 'page.tsx',
      },
      { type: 'text', value: ' right after the header.' },
    ]);
  });

  it('does not turn external urls into file references', () => {
    expect(tokenizePlainTextFileReferences('Reference https://example.com/spec.md for details.')).toEqual([
      { type: 'text', value: 'Reference https://example.com/spec.md for details.' },
    ]);
  });
});
