import { marked } from 'marked';

marked.use({
  extensions: [{
    name: 'wikilink',
    level: 'inline' as const,
    start(src: string) { return src.indexOf('[['); },
    tokenizer(src: string) {
      const match = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(src);
      if (match) {
        const path = match[1].trim();
        const text = match[2] ? match[2].trim() : (path.split('/').pop() ?? path);
        return { type: 'wikilink', raw: match[0], path, text };
      }
      return undefined;
    },
    renderer(token) {
      const safeText = String(token['text']).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safePath = String(token['path']).replace(/"/g, '&quot;');
      return `<span class="md-wikilink" data-path="${safePath}">${safeText}</span>`;
    },
  }],
});

export type CodeLineSelection = {
  line: number;
  start: number;
  end: number;
};

export function resolveCodeLineSelection(content: string, requestedLine: number | null | undefined): CodeLineSelection | null {
  if (!requestedLine || requestedLine < 1) {
    return null;
  }

  const lines = content.split('\n');
  if (lines.length === 0) {
    return null;
  }

  const line = Math.min(requestedLine, lines.length);
  let start = 0;
  for (let index = 0; index < line - 1; index += 1) {
    start += (lines[index]?.length ?? 0) + 1;
  }
  const end = start + (lines[line - 1]?.length ?? 0);
  return { line, start, end };
}

export function findNearestMarkdownSourceLine(sourceLines: number[], requestedLine: number | null | undefined): number | null {
  if (!requestedLine || requestedLine < 1 || sourceLines.length === 0) {
    return null;
  }

  const nextLine = sourceLines.find((line) => line >= requestedLine);
  if (typeof nextLine === 'number') {
    return nextLine;
  }

  return sourceLines[sourceLines.length - 1] ?? null;
}

type RenderMarkdownWithSourceLinesOptions = {
  startLine?: number;
  renderer?: unknown;
};

export function renderMarkdownWithSourceLines(
  markdown: string,
  options: RenderMarkdownWithSourceLinesOptions = {},
): { html: string; sourceLines: number[] } {
  const startLine = options.startLine ?? 1;
  const tokens = marked.lexer(markdown, { gfm: true, breaks: true }) as Array<{
    type: string;
    raw?: string;
    [key: string]: unknown;
  }>;
  const sourceLines: number[] = [];
  let nextLine = startLine;

  const htmlParts: string[] = [];
  for (const token of tokens) {
    const raw = typeof token.raw === 'string' ? token.raw : '';
    const sourceLine = nextLine;
    nextLine += raw.split('\n').length - 1;

    if (token.type === 'space') {
      continue;
    }

    sourceLines.push(sourceLine);
    const rendered = marked.parser([token as never], {
      gfm: true,
      breaks: true,
      renderer: options.renderer as never,
    });
    htmlParts.push(`<div class="md-source-block" data-source-line="${sourceLine}">${rendered}</div>`);
  }

  return { html: htmlParts.join(''), sourceLines };
}
