import { describe, expect, it } from 'vitest';
import {
  findNearestMarkdownSourceLine,
  renderMarkdownWithSourceLines,
  resolveCodeLineSelection,
} from '@/components/files/workspaceFileLineNavigation';

describe('resolveCodeLineSelection', () => {
  it('returns the requested line range for in-bounds lines', () => {
    expect(resolveCodeLineSelection('alpha\nbeta\ngamma', 2)).toEqual({
      line: 2,
      start: 6,
      end: 10,
    });
  });

  it('clamps oversized lines to the last line', () => {
    expect(resolveCodeLineSelection('alpha\nbeta\ngamma', 99)).toEqual({
      line: 3,
      start: 11,
      end: 16,
    });
  });
});

describe('findNearestMarkdownSourceLine', () => {
  it('prefers the nearest following block before falling back backward', () => {
    expect(findNearestMarkdownSourceLine([1, 4, 9], 5)).toBe(9);
    expect(findNearestMarkdownSourceLine([1, 4, 9], 11)).toBe(9);
  });
});

describe('renderMarkdownWithSourceLines', () => {
  it('wraps top-level markdown blocks with source-line metadata', () => {
    const { html, sourceLines } = renderMarkdownWithSourceLines('# 제목\n\n본문 문장\n\n- 항목', { startLine: 3 });

    expect(sourceLines).toEqual([3, 5, 7]);
    expect(html).toContain('data-source-line="3"');
    expect(html).toContain('data-source-line="5"');
    expect(html).toContain('data-source-line="7"');
  });
});
