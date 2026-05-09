'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { marked, type Token, type Tokens } from 'marked';
import { classifyLabelLink, copyTextToClipboard } from '../../helpers';
import { tokenizePlainTextFileReferences } from '../../../chatFileReferences';
import styles from '../../../ChatInterface.module.css';
import { InlineResourceChip } from './ResourceChip';

const SyntaxHighlighter = dynamic(
  () => import('../../../CodeHighlighter').then((module) => module.CodeHighlighter),
  { ssr: false, loading: () => null },
);

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

function getNestedTokens(token: Token): Token[] | undefined {
  return 'tokens' in token && Array.isArray(token.tokens) ? token.tokens : undefined;
}

function renderInlineTokens(tokens: Token[] | undefined, keyPrefix: string): ReactNode[] {
  const result: ReactNode[] = [];
  let tokenIndex = 0;

  for (const token of tokens ?? []) {
    const key = `${keyPrefix}-token-${tokenIndex}`;

    if (token.type === 'text' || token.type === 'escape') {
      const nestedTokens = getNestedTokens(token);
      if (nestedTokens?.length) {
        result.push(...renderInlineTokens(nestedTokens, key));
      } else if (token.text) {
        result.push(...renderTextWithFileReferences(token.text, key));
      }
      tokenIndex += 1;
      continue;
    }

    if (token.type === 'link') {
      const resource = classifyLabelLink(token.text, token.href);
      if (resource) {
        result.push(<InlineResourceChip key={key} resource={resource} />);
      } else {
        result.push(
          <a
            key={key}
            className={styles.markdownLink}
            href={token.href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {renderInlineTokens(token.tokens, `${key}-label`)}
          </a>,
        );
      }
      tokenIndex += 1;
      continue;
    }

    if (token.type === 'image') {
      result.push(
        <a
          key={key}
          className={styles.markdownLink}
          href={token.href}
          target="_blank"
          rel="noreferrer noopener"
        >
          {token.text || token.href}
        </a>,
      );
      tokenIndex += 1;
      continue;
    }

    if (token.type === 'codespan') {
      result.push(
        <code key={key} className={styles.markdownInlineCode}>
          {token.text}
        </code>,
      );
      tokenIndex += 1;
      continue;
    }

    if (token.type === 'strong') {
      result.push(
        <strong key={key} className={styles.markdownStrong}>
          {renderInlineTokens(token.tokens, `${key}-strong`)}
        </strong>,
      );
      tokenIndex += 1;
      continue;
    }

    if (token.type === 'em') {
      result.push(
        <em key={key} className={styles.markdownEmphasis}>
          {renderInlineTokens(token.tokens, `${key}-em`)}
        </em>,
      );
      tokenIndex += 1;
      continue;
    }

    if (token.type === 'del') {
      result.push(<del key={key}>{renderInlineTokens(token.tokens, `${key}-del`)}</del>);
      tokenIndex += 1;
      continue;
    }

    if (token.type === 'br') {
      result.push(<br key={key} />);
      tokenIndex += 1;
      continue;
    }

    if (token.type === 'html') {
      result.push(...renderTextWithFileReferences(token.text, key));
      tokenIndex += 1;
      continue;
    }

    const nestedTokens = getNestedTokens(token);
    if (nestedTokens?.length) {
      result.push(...renderInlineTokens(nestedTokens, key));
    } else if ('text' in token && typeof token.text === 'string') {
      result.push(...renderTextWithFileReferences(token.text, key));
    }
    tokenIndex += 1;
  }

  return result;
}

function renderListItemContent(tokens: Token[], keyPrefix: string): ReactNode[] {
  return tokens.flatMap((token, index) => renderBlockToken(token, `${keyPrefix}-item-${index}`));
}

function renderBlockToken(token: Token, key: string): ReactNode[] {
  if (token.type === 'space' || token.type === 'def') {
    return [];
  }

  if (token.type === 'heading') {
    const heading = token as Tokens.Heading;
    const content = renderInlineTokens(heading.tokens, `${key}-heading`);
    const level = Math.min(4, heading.depth);
    if (level === 1) return [<h1 key={key} className={styles.markdownHeading}>{content}</h1>];
    if (level === 2) return [<h2 key={key} className={styles.markdownHeading}>{content}</h2>];
    if (level === 3) return [<h3 key={key} className={styles.markdownHeading}>{content}</h3>];
    return [<h4 key={key} className={styles.markdownHeading}>{content}</h4>];
  }

  if (token.type === 'paragraph') {
    const paragraph = token as Tokens.Paragraph;
    return [<p key={key} className={styles.markdownParagraph}>{renderInlineTokens(paragraph.tokens, `${key}-paragraph`)}</p>];
  }

  if (token.type === 'text') {
    const textToken = token as Tokens.Text;
    const nestedTokens = getNestedTokens(textToken);
    const content = nestedTokens?.length
      ? renderInlineTokens(nestedTokens, `${key}-text`)
      : renderTextWithFileReferences(textToken.text, `${key}-text`);
    return [<React.Fragment key={key}>{content}</React.Fragment>];
  }

  if (token.type === 'list') {
    const list = token as Tokens.List;
    const ListTag = list.ordered ? 'ol' : 'ul';
    return [
      <ListTag
        key={key}
        className={list.ordered ? styles.markdownOrderedList : styles.markdownList}
        start={list.ordered && typeof list.start === 'number' ? list.start : undefined}
      >
        {list.items.map((item: Tokens.ListItem, itemIndex: number) => (
          <li key={`${key}-li-${itemIndex}`} className={styles.markdownListItem}>
            {item.task ? <input type="checkbox" checked={Boolean(item.checked)} readOnly aria-hidden="true" /> : null}
            {renderListItemContent(item.tokens, `${key}-li-${itemIndex}`)}
          </li>
        ))}
      </ListTag>,
    ];
  }

  if (token.type === 'blockquote') {
    const blockquote = token as Tokens.Blockquote;
    return [
      <blockquote key={key} className={styles.markdownQuote}>
        {blockquote.tokens.flatMap((child, childIndex) => renderBlockToken(child, `${key}-quote-${childIndex}`))}
      </blockquote>,
    ];
  }

  if (token.type === 'table') {
    const table = token as Tokens.Table;
    return [
      <div key={key} className={styles.markdownTableWrap}>
        <table className={styles.markdownTable}>
          <thead>
            <tr>
              {table.header.map((header: Tokens.TableCell, headerIndex: number) => (
                <th
                  key={`${key}-th-${headerIndex}`}
                  style={header.align ? { textAlign: header.align } : undefined}
                >
                  {renderInlineTokens(header.tokens, `${key}-th-${headerIndex}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row: Tokens.TableCell[], rowIndex: number) => (
              <tr key={`${key}-tr-${rowIndex}`}>
                {row.map((cell: Tokens.TableCell, cellIndex: number) => (
                  <td
                    key={`${key}-td-${rowIndex}-${cellIndex}`}
                    style={cell.align ? { textAlign: cell.align } : undefined}
                  >
                    {renderInlineTokens(cell.tokens, `${key}-td-${rowIndex}-${cellIndex}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    ];
  }

  if (token.type === 'code') {
    const codeToken = token as Tokens.Code;
    const language = codeToken.lang?.trim() ?? '';
    return [
      <div key={key} className={styles.markdownCodeBlock}>
        <div className={styles.markdownCodeHeader}>
          {language ? <span className={styles.markdownCodeLang}>{language}</span> : null}
          <button
            type="button"
            className={styles.copyCodeBtn}
            onClick={() => codeToken.text && copyTextToClipboard(codeToken.text)}
            aria-label="코드 복사"
          >
            복사
          </button>
        </div>
        <SyntaxHighlighter
          language={language.toLowerCase() || 'text'}
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
          {codeToken.text}
        </SyntaxHighlighter>
      </div>,
    ];
  }

  if (token.type === 'hr') {
    return [<hr key={key} />];
  }

  if (token.type === 'html') {
    return [<p key={key} className={styles.markdownParagraph}>{renderTextWithFileReferences(token.text, `${key}-html`)}</p>];
  }

  return [];
}

export function MarkdownContent({ body }: { body: string }) {
  const blocks = useMemo(
    () => marked.lexer(body, { gfm: true, breaks: true }) as Token[],
    [body],
  );
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const copyCodeToClipboard = useCallback((code: string, key: string) => {
    void copyTextToClipboard(code).then(() => {
      setCopiedCodeKey(key);
      setTimeout(() => setCopiedCodeKey((prev) => (prev === key ? null : prev)), 2000);
    });
  }, []);

  return (
    <div className={styles.markdownRoot}>
      {blocks.flatMap((block, index) => {
        const key = `md-${index}`;
        if (block.type === 'code') {
          return [
            <div key={key} className={styles.markdownCodeBlock}>
              <div className={styles.markdownCodeHeader}>
                {block.lang?.trim() ? <span className={styles.markdownCodeLang}>{block.lang.trim()}</span> : null}
                <button
                  type="button"
                  className={styles.copyCodeBtn}
                  onClick={() => copyCodeToClipboard(block.text, key)}
                  aria-label="코드 복사"
                >
                  {copiedCodeKey === key ? '✓ 복사됨' : '복사'}
                </button>
              </div>
              <SyntaxHighlighter
                language={block.lang?.toLowerCase() || 'text'}
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
                {block.text}
              </SyntaxHighlighter>
            </div>,
          ];
        }
        return renderBlockToken(block, key);
      })}
    </div>
  );
}
