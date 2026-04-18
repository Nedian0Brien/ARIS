import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('workspace header layout', () => {
  it('renders the workspace header outside the pager so every page keeps navigation controls', () => {
    const headerIndex = source.indexOf('<header className={styles.centerHeader} ref={centerHeaderRef}>');
    const pagerIndex = source.indexOf('<WorkspacePager');

    expect(headerIndex).toBeGreaterThan(-1);
    expect(pagerIndex).toBeGreaterThan(-1);
    expect(headerIndex).toBeLessThan(pagerIndex);
  });

  it('keeps a dedicated customization sidebar button in the shared header', () => {
    expect(source).toContain('const handleCustomizationSidebarButtonClick = useCallback(() => {');
    expect(source).toContain('const customizationSidebarButtonLabel = isCustomizationOverlayLayout');
    expect(source).toContain('aria-label={customizationSidebarButtonLabel}');
  });
});
