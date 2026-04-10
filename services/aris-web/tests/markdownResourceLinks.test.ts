import { describe, expect, it } from 'vitest';
import { classifyMarkdownLink } from '@/lib/markdown/resourceLinks';

describe('classifyMarkdownLink', () => {
  it('treats internal document urls as file resources even when the visible label is plain text', () => {
    const resource = classifyMarkdownLink(
      'Thompson Sampling Summary',
      'https://aris.lawdigest.cloud/home/ubuntu/obsidian/wiki/summary/thompson-sampling-summary.md'
    );

    expect(resource).toEqual({
      kind: 'file',
      name: 'Thompson Sampling Summary',
      extension: 'md',
      sourcePath: '/home/ubuntu/obsidian/wiki/summary/thompson-sampling-summary.md',
    });
  });

  it('keeps ordinary external links as regular markdown links', () => {
    expect(classifyMarkdownLink('OpenAI blog', 'https://example.com/blog')).toBeNull();
  });

  it('still recognizes file-named labels', () => {
    const resource = classifyMarkdownLink('summary/thompson-sampling-summary.md', 'https://example.com/redirect');

    expect(resource).toEqual({
      kind: 'file',
      name: 'summary/thompson-sampling-summary.md',
      extension: 'md',
      sourcePath: 'https://example.com/redirect',
    });
  });
});
