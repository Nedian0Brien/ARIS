import { describe, expect, it } from 'vitest';
import { summarizeDiffText, summarizeFileChangeDiff } from '../src/runtime/diffStats.js';

describe('summarizeDiffText', () => {
  it('returns diff stats for unified git diff text', () => {
    const stats = summarizeDiffText(`diff --git a/a.ts b/a.ts
@@ -1,2 +1,2 @@
-const a = 1;
+const a = 2;
`);
    expect(stats).toEqual({
      additions: 1,
      deletions: 1,
      hasDiffSignal: true,
    });
  });

  it('returns no diff signal for non-diff command output', () => {
    const stats = summarizeDiffText(`Container a_stopped
Container b_removed
exit code: 0`);
    expect(stats).toEqual({
      additions: 0,
      deletions: 0,
      hasDiffSignal: false,
    });
  });

  it('handles empty input safely', () => {
    expect(summarizeDiffText('')).toEqual({
      additions: 0,
      deletions: 0,
      hasDiffSignal: false,
    });
  });
});

describe('summarizeFileChangeDiff', () => {
  it('treats plain file content as additions for add kind', () => {
    const stats = summarizeFileChangeDiff(`line1\nline2\n`, 'add');
    expect(stats).toEqual({
      additions: 2,
      deletions: 0,
      hasDiffSignal: true,
    });
  });

  it('treats plain file content as deletions for delete kind', () => {
    const stats = summarizeFileChangeDiff(`line1\nline2\nline3\n`, 'delete');
    expect(stats).toEqual({
      additions: 0,
      deletions: 3,
      hasDiffSignal: true,
    });
  });

  it('keeps non-diff output as no-signal for unknown kind', () => {
    const stats = summarizeFileChangeDiff('Container removed', 'update');
    expect(stats).toEqual({
      additions: 0,
      deletions: 0,
      hasDiffSignal: false,
    });
  });
});
