import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from '@/app/_legacy/sessions/[sessionId]/chat-screen/center-pane/renderers/MarkdownContent';
import { ResourceChip } from '@/app/_legacy/sessions/[sessionId]/chat-screen/center-pane/renderers/ResourceChip';

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

  it('renders nested markdown lists instead of flattening child items', () => {
    const markup = renderToStaticMarkup(
      React.createElement(MarkdownContent, {
        body: '- parent\n  - child',
      }),
    );

    expect(markup).toContain('<ul');
    expect(markup).toContain('parent');
    expect(markup).toContain('child');
    expect(markup.match(/<ul/g)?.length).toBe(2);
  });

  it('keeps full markdown link targets that include parentheses', () => {
    const markup = renderToStaticMarkup(
      React.createElement(MarkdownContent, {
        body: '[spec](https://example.com/a_(b))',
      }),
    );

    expect(markup).toContain('href="https://example.com/a_(b)"');
    expect(markup).toContain('>spec<');
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
