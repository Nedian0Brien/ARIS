import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modalTsxPath = resolve(
  __dirname,
  '../app/sessions/[sessionId]/customization-sidebar/modals/CustomizationFileModal.tsx',
);
const modalCssPath = resolve(__dirname, '../app/sessions/[sessionId]/CustomizationSidebar.module.css');

const modalTsx = readFileSync(modalTsxPath, 'utf8');
const modalCss = readFileSync(modalCssPath, 'utf8');

describe('customization file modal mobile blocked-state guards', () => {
  it('adds a dedicated blocked-state close header without changing the editor path', () => {
    expect(modalTsx).toMatch(/import\s+\{[^}]*X[^}]*\}\s+from\s+'lucide-react';/s);
    expect(modalTsx).toMatch(/const\s+isPreviewBlocked\s*=\s*Boolean\(filePreviewBlock\);/);
    expect(modalTsx).toMatch(/className=\{\`\$\{styles\.modalOverlay\}\s+\$\{isPreviewBlocked\s*\?\s*styles\.fileModalBlockedOverlay\s*:\s*''\}\`\}/);
    expect(modalTsx).toMatch(/className=\{\`\$\{styles\.modalCard\}\s+\$\{styles\.fileModalCard\}\s+\$\{isPreviewBlocked\s*\?\s*styles\.fileModalBlockedCard\s*:\s*''\}\`\}/);
    expect(modalTsx).toMatch(/isPreviewBlocked\s*\?\s*\(\s*<>\s*<div className=\{styles\.modalHeader\}>[\s\S]*?className=\{styles\.modalCloseButton\}[\s\S]*?aria-label="모달 닫기"/s);
    expect(modalTsx).toMatch(/:\s*\(\s*<>\s*\{fileStatus \? <div className=\{styles\.fileModalStatus\}>/s);
  });

  it('keeps blocked previews as centered cards on mobile instead of forcing fullscreen', () => {
    expect(modalCss).toMatch(/\.fileModalBlockedOverlay\s*\{[^}]*padding:\s*1rem;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
    expect(modalCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.fileModalBlockedOverlay\s*\{[^}]*padding:\s*1rem;/s);
    expect(modalCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.fileModalBlockedCard\s*\{[^}]*width:\s*min\(32rem,\s*100%\);/s);
    expect(modalCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.fileModalBlockedCard\s*\{[^}]*max-height:\s*min\(28rem,\s*calc\(100vh - 2rem\)\);/s);
    expect(modalCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.fileModalBlockedCard\s*\{[^}]*border-radius:\s*22px;/s);
    expect(modalCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.fileModalBlockedBody\s*\{[^}]*min-height:\s*auto;/s);
  });
});
