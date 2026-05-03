import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const homeClient = readFileSync(resolve(__dirname, '../app/HomePageClient.tsx'), 'utf8');
const providerLogo = readFileSync(resolve(__dirname, '../components/ui/ProviderLogo.tsx'), 'utf8');
const chatTimeline = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/ChatTimeline.tsx'), 'utf8');
const chatInterfaceCss = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css'), 'utf8');
const middleware = readFileSync(resolve(__dirname, '../middleware.ts'), 'utf8');
const uiCss = readFileSync(resolve(__dirname, '../app/styles/ui.css'), 'utf8');

describe('project layout and provider logo guards', () => {
  it('lets the mobile project shell and project tabs fill the browser width', () => {
    expect(uiCss).toMatch(/@media \(max-width:\s*767px\)[\s\S]*?\.aris-ia-shell\s*\{[^}]*width:\s*100%;/);
    expect(uiCss).toMatch(/@media \(max-width:\s*767px\)[\s\S]*?\.aris-ia-shell\s*\{[^}]*margin-inline:\s*0;/);
    expect(uiCss).toMatch(/@media \(max-width:\s*767px\)[\s\S]*?\.m-main-scroll--project-detail\s*\{[^}]*padding:\s*0;/);
    expect(uiCss).toMatch(/@media \(max-width:\s*767px\)[\s\S]*?\.proj-tabs\s*\{[^}]*width:\s*100%;/);
  });

  it('uses the real provider logo assets in the model picker', () => {
    expect(providerLogo).toContain('PROVIDER_ICON_SVGS');
    expect(providerLogo).toContain('svgToMaskDataUrl');
    expect(providerLogo).toContain('data:image/svg+xml');
    expect(middleware).toContain("pathname.startsWith('/icons/')");
    expect(homeClient).toContain("import { ProviderLogo, type ProviderLogoProvider } from '@/components/ui/ProviderLogo';");
    expect(homeClient).toContain('<ProviderLogo provider={selectedProvider} />');
    expect(homeClient).toContain('<ProviderLogo provider={provider} />');
    expect(homeClient).not.toContain('function ProviderLogo({');
    expect(homeClient).not.toContain('<span>{agentInitial(provider).slice(0, 1)}</span>');

    expect(uiCss).toContain('.provider-logo');
    expect(uiCss).toContain('mask-image: var(--provider-logo-url);');
  });

  it('uses the shared provider logo in chat avatars', () => {
    expect(homeClient).toContain('msg__avatar');
    expect(homeClient).toContain('<ProviderLogo provider={selectedProvider} />');
    expect(homeClient).not.toContain("agentInitial(activeAgent)");
    expect(uiCss).toContain('.pc-proto .msg__avatar .provider-logo');
    expect(uiCss).toContain('.pc-proto .chturn__agent-avatar .provider-logo');

    expect(chatTimeline).toContain("import { ProviderLogo } from '@/components/ui/ProviderLogo';");
    expect(chatTimeline).toContain('<ProviderLogo provider={activeAgentFlavor} />');
    expect(chatInterfaceCss).toContain(':global(.provider-logo)');
  });
});
