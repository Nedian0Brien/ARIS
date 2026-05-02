import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const homeClient = readFileSync(resolve(__dirname, '../app/HomePageClient.tsx'), 'utf8');
const uiCss = readFileSync(resolve(__dirname, '../app/styles/ui.css'), 'utf8');

describe('project layout and provider logo guards', () => {
  it('lets the mobile project shell and project tabs fill the browser width', () => {
    expect(uiCss).toMatch(/@media \(max-width:\s*767px\)[\s\S]*?\.aris-ia-shell\s*\{[^}]*width:\s*100%;/);
    expect(uiCss).toMatch(/@media \(max-width:\s*767px\)[\s\S]*?\.aris-ia-shell\s*\{[^}]*margin-inline:\s*0;/);
    expect(uiCss).toMatch(/@media \(max-width:\s*767px\)[\s\S]*?\.m-main-scroll--project-detail\s*\{[^}]*padding:\s*0;/);
    expect(uiCss).toMatch(/@media \(max-width:\s*767px\)[\s\S]*?\.proj-tabs\s*\{[^}]*width:\s*100%;/);
  });

  it('uses the real provider logo assets in the model picker', () => {
    expect(homeClient).toContain("claude: '/icons/claude.svg'");
    expect(homeClient).toContain("codex: '/icons/codex.svg'");
    expect(homeClient).toContain("gemini: '/icons/gemini.svg'");
    expect(homeClient).toContain('function ProviderLogo({');
    expect(homeClient).toContain('<ProviderLogo provider={selectedProvider} />');
    expect(homeClient).toContain('<ProviderLogo provider={provider} />');
    expect(homeClient).not.toContain('<span>{agentInitial(provider).slice(0, 1)}</span>');

    expect(uiCss).toContain('.provider-logo');
    expect(uiCss).toContain('mask-image: var(--provider-logo-url);');
  });
});
