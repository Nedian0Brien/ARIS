import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css');
const tsxPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx');
const css = readFileSync(cssPath, 'utf8');
const tsx = readFileSync(tsxPath, 'utf8');

describe('link preview carousel mobile layout', () => {
  it('keeps the carousel wrapper constrained to the agent bubble stack width', () => {
    expect(tsx).toMatch(/className=\{styles\.agentMessageStack\}/);
    expect(css).toMatch(/\.agentMessageStack\s*\{[^}]*width:\s*fit-content;/s);
    expect(css).toMatch(/\.agentMessageStack\s*\{[^}]*max-width:\s*min\(100%,\s*48rem\);/s);
    expect(css).toMatch(/\.linkPreviewWrap\s*\{[^}]*width:\s*100%;/s);
    expect(css).toMatch(/\.linkPreviewWrap\s*\{[^}]*max-width:\s*100%;/s);
    expect(css).toMatch(/\.linkPreviewWrap\s*\{[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/\.linkPreviewWrap\s*\{[^}]*align-self:\s*stretch;/s);
    expect(css).toMatch(/\.linkPreviewTrack\s*\{[^}]*max-width:\s*100%;/s);
  });

  it('uses a viewport-safe card width on mobile instead of a fixed pixel basis', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.linkPreviewCard\s*\{[^}]*flex:\s*0 0 clamp\(/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.linkPreviewCard\s*\{[^}]*max-width:\s*100%;/s);
  });

  it('scrolls by the rendered card width instead of a hard-coded desktop value', () => {
    expect(tsx).not.toContain('const cardWidth = 296;');
    expect(tsx).toMatch(/firstElementChild as HTMLElement \| null/);
  });

  it('lets the agent bubble define the stack width instead of the full message body', () => {
    expect(css).toMatch(/\.messageBubbleAgent\s*\{[^}]*width:\s*fit-content;/s);
    expect(css).toMatch(/\.messageBubbleAgent\s*\{[^}]*max-width:\s*100%;/s);
  });

  it('forces long url text inside chat bubbles to wrap without triggering mobile text autosizing', () => {
    expect(css).toMatch(/\.userText,\s*\.agentText\s*\{[^}]*max-width:\s*100%;/s);
    expect(css).toMatch(/\.userText,\s*\.agentText\s*\{[^}]*-webkit-text-size-adjust:\s*100%;/s);
    expect(css).toMatch(/\.userText,\s*\.agentText\s*\{[^}]*text-size-adjust:\s*100%;/s);
    expect(css).toMatch(/\.markdownLink\s*\{[^}]*max-width:\s*100%;/s);
    expect(css).toMatch(/\.markdownLink\s*\{[^}]*word-break:\s*break-all;/s);
  });

  it('keeps Korean user and agent text from splitting into single trailing characters', () => {
    expect(css).toMatch(/\.userText,\s*\.agentText\s*\{[^}]*overflow-wrap:\s*break-word;/s);
    expect(css).toMatch(/\.userText,\s*\.agentText\s*\{[^}]*word-break:\s*keep-all;/s);
    expect(css).toMatch(/\.markdownParagraph\s*\{[^}]*overflow-wrap:\s*break-word;/s);
    expect(css).toMatch(/\.markdownParagraph\s*\{[^}]*word-break:\s*keep-all;/s);
  });
});
