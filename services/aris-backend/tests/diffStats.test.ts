import { describe, expect, it } from 'vitest';
import { summarizeDiffText } from '../src/runtime/diffStats.js';

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
