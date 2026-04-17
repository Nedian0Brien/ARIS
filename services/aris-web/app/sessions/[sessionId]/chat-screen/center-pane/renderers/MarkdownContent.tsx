'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { classifyLabelLink, copyTextToClipboard } from '../../helpers';
import { tokenizePlainTextFileReferences } from '../../../chatFileReferences';
import styles from '../../../ChatInterface.module.css';
import { InlineResourceChip } from './ResourceChip';

const SyntaxHighlighter = dynamic(
  () => import('../../../CodeHighlighter').then((module) => module.CodeHighlighter),
  { ssr: false, loading: () => null },
);

type TableAlign = 'left' | 'center' | 'right' | null;
type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; start: number; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; headers: string[]; rows: string[][]; alignments: TableAlign[] };

function parseMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) {
    return [];
  }

  let normalized = trimmed;
  if (normalized.startsWith('|')) {
    normalized = normalized.slice(1);
  }
  if (normalized.endsWith('|')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized
    .split('|')
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function isMarkdownTableDelimiterLine(line: string): boolean {
  const cells = parseMarkdownTableRow(line);
  if (cells.length === 0) {
    return false;
  }
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTableAlignments(delimiterLine: string, columns: number): TableAlign[] {
  const cells = parseMarkdownTableRow(delimiterLine);
  const alignments: TableAlign[] = [];
  for (let index = 0; index < columns; index += 1) {
    const cell = (cells[index] ?? '').trim();
    if (/^:-{3,}:$/.test(cell)) {
      alignments.push('center');
      continue;
    }
    if (/^-{3,}:$/.test(cell)) {
      alignments.push('right');
      continue;
    }
    if (/^:-{3,}$/.test(cell)) {
      alignments.push('left');
      continue;
    }
    alignments.push(null);
  }
  return alignments;
}

function normalizeMarkdownTableRow(cells: string[], columns: number): string[] {
  const normalized = [...cells];
  if (normalized.length < columns) {
    for (let index = normalized.length; index < columns; index += 1) {
      normalized.push('');
    }
  }
  if (normalized.length > columns) {
    normalized.length = columns;
  }
  return normalized;
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length) {
    return false;
  }

  const headerCells = parseMarkdownTableRow(lines[index]);
  if (headerCells.length === 0 || headerCells.every((cell) => !cell)) {
    return false;
  }

  return isMarkdownTableDelimiterLine(lines[index + 1]);
}

function isMarkdownBoundary(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }
  return (
    trimmed.startsWith('```') ||
    /^#{1,4}\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed)
  );
}

function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length && lines[index].trim().startsWith('```')) {
        index += 1;
      }
      blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(4, headingMatch[1].length) as 1 | 2 | 3 | 4;
      blocks.push({ type: 'heading', level, text: headingMatch[2].trim() });
      index += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const headerCells = parseMarkdownTableRow(lines[index]);
      const delimiterCells = parseMarkdownTableRow(lines[index + 1]);
      const columns = Math.max(headerCells.length, delimiterCells.length);
      const headers = normalizeMarkdownTableRow(headerCells, columns);
      const alignments = parseMarkdownTableAlignments(lines[index + 1], columns);
      index += 2;

      const rows: string[][] = [];
      while (index < lines.length) {
        const rowLine = lines[index];
        if (!rowLine.trim() || isMarkdownBoundary(rowLine)) {
          break;
        }

        const rowCells = parseMarkdownTableRow(rowLine);
        if (rowCells.length === 0) {
          break;
        }
        rows.push(normalizeMarkdownTableRow(rowCells, columns));
        index += 1;
      }

      blocks.push({ type: 'table', headers, rows, alignments });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: quoteLines.join('\n').trim() });
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        const match = current.match(/^[-*+]\s+(.+)$/);
        if (match) {
          items.push(match[1]);
          index += 1;
          continue;
        }
        if (!current) {
          let lookahead = index + 1;
          while (lookahead < lines.length && !lines[lookahead].trim()) {
            lookahead += 1;
          }
          if (lookahead < lines.length && /^[-*+]\s+/.test(lines[lookahead].trim())) {
            index = lookahead;
            continue;
          }
        }
        break;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const start = Number.parseInt(trimmed.match(/^(\d+)\.\s+/)?.[1] ?? '1', 10);
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        const match = current.match(/^\d+\.\s+(.+)$/);
        if (match) {
          items.push(match[1]);
          index += 1;
          continue;
        }
        if (!current) {
          let lookahead = index + 1;
          while (lookahead < lines.length && !lines[lookahead].trim()) {
            lookahead += 1;
          }
          if (lookahead < lines.length && /^\d+\.\s+/.test(lines[lookahead].trim())) {
            index = lookahead;
            continue;
          }
        }
        break;
      }
      blocks.push({ type: 'ol', start: Number.isFinite(start) && start > 0 ? start : 1, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim() && !isMarkdownBoundary(lines[index])) {
      if (isMarkdownTableStart(lines, index)) {
        break;
      }
      paragraphLines.push(lines[index]);
      index += 1;
    }
    if (paragraphLines.length === 0) {
      paragraphLines.push(line);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n').trim() });
  }

  return blocks;
}

function renderTextWithFileReferences(text: string, keyPrefix: string): ReactNode[] {
  const result: ReactNode[] = [];
  let token = 0;

  for (const part of tokenizePlainTextFileReferences(text)) {
    if (part.type === 'text') {
      if (part.value) {
        result.push(part.value);
      }
      continue;
    }

    result.push(
      <InlineResourceChip
        key={`${keyPrefix}-file-${token}`}
        resource={{
          kind: 'file',
          name: part.name,
          extension: part.extension,
          sourcePath: part.path,
          sourceLine: part.line,
        }}
      />,
    );
    token += 1;
  }

  return result;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\[([^\]]+)\]\((<[^>]+>|[^)\n]+?)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_)/g;
  const result: ReactNode[] = [];
  let cursor = 0;
  let token = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      result.push(...renderTextWithFileReferences(text.slice(cursor, index), `${keyPrefix}-text-${token}`));
    }

    if (match[2] && match[3]) {
      const resource = classifyLabelLink(match[2], match[3]);
      if (resource) {
        result.push(<InlineResourceChip key={`${keyPrefix}-resource-${token}`} resource={resource} />);
      } else {
        const href = match[3].trim().startsWith('<') && match[3].trim().endsWith('>')
          ? match[3].trim().slice(1, -1).trim()
          : match[3];
        result.push(
          <a
            key={`${keyPrefix}-link-${token}`}
            className={styles.markdownLink}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {match[2]}
          </a>,
        );
      }
    } else if (match[4]) {
      result.push(
        <code key={`${keyPrefix}-code-${token}`} className={styles.markdownInlineCode}>
          {match[4]}
        </code>,
      );
    } else if (match[5] || match[6]) {
      result.push(
        <strong key={`${keyPrefix}-strong-${token}`} className={styles.markdownStrong}>
          {match[5] || match[6]}
        </strong>,
      );
    } else if (match[7] || match[8]) {
      result.push(
        <em key={`${keyPrefix}-em-${token}`} className={styles.markdownEmphasis}>
          {match[7] || match[8]}
        </em>,
      );
    }

    cursor = index + match[0].length;
    token += 1;
  }

  if (cursor < text.length) {
    result.push(...renderTextWithFileReferences(text.slice(cursor), `${keyPrefix}-tail`));
  }

  if (result.length === 0) {
    result.push(...renderTextWithFileReferences(text, `${keyPrefix}-plain`));
  }

  return result;
}

function renderInlineWithBreaks(text: string, keyPrefix: string): ReactNode[] {
  const lines = text.split('\n');
  const result: ReactNode[] = [];

  lines.forEach((line, index) => {
    if (index > 0) {
      result.push(<br key={`${keyPrefix}-br-${index}`} />);
    }
    result.push(...renderInlineMarkdown(line, `${keyPrefix}-line-${index}`));
  });

  return result;
}

export function MarkdownContent({ body }: { body: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(body), [body]);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const copyCodeToClipboard = useCallback((code: string, key: string) => {
    void copyTextToClipboard(code).then(() => {
      setCopiedCodeKey(key);
      setTimeout(() => setCopiedCodeKey((prev) => (prev === key ? null : prev)), 2000);
    });
  }, []);

  return (
    <div className={styles.markdownRoot}>
      {blocks.map((block, index) => {
        const key = `md-${index}`;

        if (block.type === 'heading') {
          if (block.level === 1) return <h1 key={key} className={styles.markdownHeading}>{renderInlineWithBreaks(block.text, key)}</h1>;
          if (block.level === 2) return <h2 key={key} className={styles.markdownHeading}>{renderInlineWithBreaks(block.text, key)}</h2>;
          if (block.level === 3) return <h3 key={key} className={styles.markdownHeading}>{renderInlineWithBreaks(block.text, key)}</h3>;
          return <h4 key={key} className={styles.markdownHeading}>{renderInlineWithBreaks(block.text, key)}</h4>;
        }

        if (block.type === 'paragraph') {
          return <p key={key} className={styles.markdownParagraph}>{renderInlineWithBreaks(block.text, key)}</p>;
        }

        if (block.type === 'ul') {
          return (
            <ul key={key} className={styles.markdownList}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-li-${itemIndex}`} className={styles.markdownListItem}>
                  {renderInlineWithBreaks(item, `${key}-li-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol key={key} className={styles.markdownOrderedList} start={block.start}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-oi-${itemIndex}`} className={styles.markdownListItem}>
                  {renderInlineWithBreaks(item, `${key}-oi-${itemIndex}`)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'quote') {
          return <blockquote key={key} className={styles.markdownQuote}>{renderInlineWithBreaks(block.text, key)}</blockquote>;
        }

        if (block.type === 'table') {
          return (
            <div key={key} className={styles.markdownTableWrap}>
              <table className={styles.markdownTable}>
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th
                        key={`${key}-th-${headerIndex}`}
                        style={block.alignments[headerIndex] ? { textAlign: block.alignments[headerIndex] } : undefined}
                      >
                        {renderInlineWithBreaks(header, `${key}-th-${headerIndex}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${key}-tr-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${key}-td-${rowIndex}-${cellIndex}`}
                          style={block.alignments[cellIndex] ? { textAlign: block.alignments[cellIndex] } : undefined}
                        >
                          {renderInlineWithBreaks(cell, `${key}-td-${rowIndex}-${cellIndex}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <div key={key} className={styles.markdownCodeBlock}>
            <div className={styles.markdownCodeHeader}>
              {block.language && <span className={styles.markdownCodeLang}>{block.language}</span>}
              <button
                type="button"
                className={styles.copyCodeBtn}
                onClick={() => copyCodeToClipboard(block.code, key)}
                aria-label="코드 복사"
              >
                {copiedCodeKey === key ? '✓ 복사됨' : '복사'}
              </button>
            </div>
            <SyntaxHighlighter
              language={block.language?.toLowerCase() || 'text'}
              customStyle={{
                margin: 0,
                padding: '0.4rem 0.56rem 0.56rem',
                background: 'transparent',
                fontSize: '0.76rem',
                lineHeight: 1.45,
              }}
              wrapLongLines={false}
              PreTag="div"
            >
              {block.code}
            </SyntaxHighlighter>
          </div>
        );
      })}
    </div>
  );
}
