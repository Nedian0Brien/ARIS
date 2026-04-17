import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from '@/app/sessions/[sessionId]/chat-screen/center-pane/renderers/MarkdownContent';
import { ResourceChip } from '@/app/sessions/[sessionId]/chat-screen/center-pane/renderers/ResourceChip';

describe('chat renderers', () => {
  it('renders markdown links and local file references in separate affordances', () => {
    const markup = renderToStaticMarkup(
      React.createElement(MarkdownContent, {
        body: 'Open [README](https://example.com) and inspect `/src/app.tsx:12`.',
      }),
    );

    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain('README');
    expect(markup).toContain('src/app.tsx');
  });

  it('renders folder chips as non-button labels', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResourceChip, {
        resource: {
          kind: 'folder',
          name: 'src',
          sourcePath: '/workspace/src',
        },
      }),
    );

    expect(markup).toContain('src');
    expect(markup).not.toContain('<button');
  });
});
