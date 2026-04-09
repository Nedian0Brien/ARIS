'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code, Edit3, Eye, FileText, Loader2, Save, X } from 'lucide-react';
import Prism from 'prismjs';
import { marked } from 'marked';
import styles from './WorkspaceFileEditor.module.css';

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

import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/themes/prism.css';

type WorkspaceFileEditorProps = {
  fileName: string;
  content: string;
  rawUrl?: string;
  isSaving?: boolean;
  saveDisabled?: boolean;
  onChange: (nextContent: string) => void;
  onSave: () => void | Promise<void>;
  onClose?: () => void;
  className?: string;
};

interface Frontmatter {
  title?: string;
  type?: string;
  tags?: string[];
  created?: string;
  updated?: string;
  sources?: string[];
  [key: string]: string | string[] | undefined;
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter | null; body: string } {
  if (!content.startsWith('---')) {
    return { frontmatter: null, body: content };
  }

  const rest = content.slice(3);
  const endMatch = rest.match(/\n---(\r?\n|$)/);
  if (!endMatch || endMatch.index === undefined) {
    return { frontmatter: null, body: content };
  }

  const yamlStr = rest.slice(0, endMatch.index);
  const body = rest.slice(endMatch.index + endMatch[0].length);
  const frontmatter: Frontmatter = {};

  for (const line of yamlStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    if (!key || !rawValue) continue;

    if (rawValue.startsWith('[[')) {
      const matches = [...rawValue.matchAll(/\[\[([^\]]+)\]\]/g)];
      frontmatter[key] = matches.map((m) => m[1]);
    } else if (rawValue.startsWith('[')) {
      const inner = rawValue.slice(1, rawValue.lastIndexOf(']'));
      frontmatter[key] = inner
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      frontmatter[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  }

  return { frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : null, body };
}

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  summary: { color: 'var(--accent-emerald)', bg: 'var(--accent-emerald-bg)' },
  note: { color: 'var(--accent-sky)', bg: 'var(--accent-sky-bg)' },
  paper: { color: 'var(--accent-violet)', bg: 'var(--accent-violet-bg)' },
  task: { color: 'var(--accent-amber)', bg: 'var(--accent-amber-bg)' },
  default: { color: 'var(--accent-slate)', bg: 'var(--accent-slate-bg)' },
};

function FrontmatterBlock({ fm }: { fm: Frontmatter }) {
  const typeStyle = fm.type ? (TYPE_COLORS[fm.type.toLowerCase()] ?? TYPE_COLORS.default) : TYPE_COLORS.default;
  const knownKeys = new Set(['title', 'type', 'tags', 'created', 'updated', 'sources']);
  const extraKeys = Object.keys(fm).filter((k) => !knownKeys.has(k));

  return (
    <div className={styles.fmBlock}>
      {fm.title && <h1 className={styles.fmTitle}>{fm.title}</h1>}
      <div className={styles.fmProps}>
        {fm.type && (
          <div className={styles.fmProp}>
            <span className={styles.fmPropKey}>타입</span>
            <span
              className={styles.fmTypeBadge}
              style={{ color: typeStyle.color, background: typeStyle.bg }}
            >
              {fm.type}
            </span>
          </div>
        )}
        {fm.tags && fm.tags.length > 0 && (
          <div className={styles.fmProp}>
            <span className={styles.fmPropKey}>태그</span>
            <div className={styles.fmTagList}>
              {fm.tags.map((tag) => (
                <span key={tag} className={styles.fmTag}>#{tag}</span>
              ))}
            </div>
          </div>
        )}
        {fm.created && (
          <div className={styles.fmProp}>
            <span className={styles.fmPropKey}>생성일</span>
            <span className={styles.fmDate}>{fm.created}</span>
          </div>
        )}
        {fm.updated && (
          <div className={styles.fmProp}>
            <span className={styles.fmPropKey}>수정일</span>
            <span className={styles.fmDate}>{fm.updated}</span>
          </div>
        )}
        {fm.sources && fm.sources.length > 0 && (
          <div className={styles.fmProp}>
            <span className={styles.fmPropKey}>출처</span>
            <div className={styles.fmTagList}>
              {fm.sources.map((src) => (
                <span key={src} className={styles.fmSource}>
                  <FileText size={11} />
                  {src}
                </span>
              ))}
            </div>
          </div>
        )}
        {extraKeys.map((key) => {
          const val = fm[key];
          return (
            <div key={key} className={styles.fmProp}>
              <span className={styles.fmPropKey}>{key}</span>
              <span className={styles.fmDate}>
                {Array.isArray(val) ? val.join(', ') : (val ?? '')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'css':
      return 'css';
    case 'html':
      return 'markup';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'py':
      return 'python';
    case 'sh':
      return 'bash';
    case 'pdf':
      return 'pdf';
    default:
      return 'text';
  }
}

function displayLanguageName(fileName: string): string {
  const lang = getLanguage(fileName);
  const map: Record<string, string> = {
    bash: 'Shell',
    css: 'CSS',
    javascript: 'JavaScript',
    json: 'JSON',
    markdown: 'Markdown',
    markup: 'HTML',
    pdf: 'PDF',
    python: 'Python',
    text: 'Text',
    typescript: 'TypeScript',
  };
  return map[lang] ?? 'Text';
}

export function WorkspaceFileEditor({
  fileName,
  content,
  rawUrl,
  isSaving = false,
  saveDisabled = false,
  onChange,
  onSave,
  onClose,
  className,
}: WorkspaceFileEditorProps) {
  const [isPreview, setIsPreview] = useState(() => getLanguage(fileName) === 'markdown');
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setIsPreview(getLanguage(fileName) === 'markdown');
  }, [fileName]);

  const lineNumbers = useMemo(() => {
    const lines = content.split('\n').length;
    return Array.from({ length: lines }, (_, index) => index + 1).join('\n');
  }, [content]);

  const language = useMemo(() => getLanguage(fileName), [fileName]);

  const highlightedContent = useMemo(() => {
    if (language === 'text' || !Prism.languages[language]) {
      return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    return Prism.highlight(content, Prism.languages[language], language);
  }, [content, language]);

  const parsed = useMemo(() => {
    if (language !== 'markdown') return { frontmatter: null, body: content };
    return parseFrontmatter(content);
  }, [content, language]);

  const markdownHtml = useMemo(() => {
    if (!isPreview || language !== 'markdown') {
      return '';
    }

    const renderer = new marked.Renderer();
    renderer.code = ({ text, lang }) => {
      const validLang = lang && Prism.languages[lang] ? lang : null;
      const highlighted = validLang
        ? Prism.highlight(text, Prism.languages[validLang], validLang)
        : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const langBadge = validLang ? `<span class="md-code-lang">${validLang}</span>` : '';
      return `<div class="md-code-block"><div class="md-code-header">${langBadge}</div><pre class="md-code-pre"><code>${highlighted}</code></pre></div>`;
    };

    return marked.parse(parsed.body, { breaks: true, gfm: true, renderer }) as string;
  }, [parsed, isPreview, language]);

  const handleEditorKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const { selectionEnd, selectionStart, value } = textarea;

    if (event.key === 'Tab') {
      event.preventDefault();
      const nextValue = `${value.substring(0, selectionStart)}  ${value.substring(selectionEnd)}`;
      onChange(nextValue);
      setTimeout(() => {
        textarea.selectionStart = selectionStart + 2;
        textarea.selectionEnd = selectionStart + 2;
      }, 0);
      return;
    }

    if (event.key === 'Enter') {
      const lines = value.substring(0, selectionStart).split('\n');
      const currentLine = lines[lines.length - 1] ?? '';
      const indentation = currentLine.match(/^\s*/)?.[0] ?? '';
      const charBefore = value[selectionStart - 1];
      const charAfter = value[selectionStart];

      if (
        (charBefore === '{' && charAfter === '}')
        || (charBefore === '[' && charAfter === ']')
        || (charBefore === '(' && charAfter === ')')
      ) {
        event.preventDefault();
        const nextValue = `${value.substring(0, selectionStart)}\n${indentation}  \n${indentation}${value.substring(selectionEnd)}`;
        onChange(nextValue);
        setTimeout(() => {
          textarea.selectionStart = selectionStart + indentation.length + 3;
          textarea.selectionEnd = selectionStart + indentation.length + 3;
        }, 0);
        return;
      }

      if (indentation) {
        event.preventDefault();
        const nextValue = `${value.substring(0, selectionStart)}\n${indentation}${value.substring(selectionEnd)}`;
        onChange(nextValue);
        setTimeout(() => {
          textarea.selectionStart = selectionStart + indentation.length + 1;
          textarea.selectionEnd = selectionStart + indentation.length + 1;
        }, 0);
      }

      return;
    }

    const pairs: Record<string, string> = {
      '"': '"',
      "'": "'",
      '(': ')',
      '[': ']',
      '`': '`',
      '{': '}',
    };

    if (pairs[event.key]) {
      event.preventDefault();
      const nextValue = `${value.substring(0, selectionStart)}${event.key}${pairs[event.key]}${value.substring(selectionEnd)}`;
      onChange(nextValue);
      setTimeout(() => {
        textarea.selectionStart = selectionStart + 1;
        textarea.selectionEnd = selectionStart + 1;
      }, 0);
    }
  }, [onChange]);

  const handleWikilinkClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('.md-wikilink');
    if (!target) return;
    let wikilinkPath = target.getAttribute('data-path') ?? '';
    if (!wikilinkPath) return;
    if (!wikilinkPath.includes('.')) {
      wikilinkPath = `${wikilinkPath}.md`;
    }
    window.dispatchEvent(new CustomEvent('aris-open-workspace-file', {
      detail: { path: wikilinkPath, name: wikilinkPath.split('/').pop() ?? wikilinkPath },
    }));
  }, []);

  const handleEditorScroll = useCallback((event: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
    }

    if (preRef.current) {
      preRef.current.scrollTop = event.currentTarget.scrollTop;
      preRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  }, []);

  return (
    <div className={`${styles.editorRoot}${className ? ` ${className}` : ''}`}>
      <div className={styles.editorHeader}>
        <div className={styles.editorTitleBox}>
          <Code size={20} className={styles.titleIcon} />
          <div className={styles.editorTitleText}>
            <span className={styles.fileName}>{fileName}</span>
            <span className={styles.fileLang}>{displayLanguageName(fileName)}</span>
          </div>
        </div>
        <div className={styles.editorActions}>
          {language === 'markdown' ? (
            <button
              type="button"
              onClick={() => setIsPreview((current) => !current)}
              className={`btn-secondary ${styles.buttonSmall}`}
            >
              {isPreview ? <Edit3 size={16} /> : <Eye size={16} />}
              <span>{isPreview ? '편집' : '미리보기'}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saveDisabled || isSaving}
            className={`btn-primary ${styles.buttonSmall}`}
          >
            {isSaving ? <Loader2 size={16} className={styles.animateSpin} /> : <Save size={16} />}
            <span>저장</span>
          </button>
          {onClose ? (
            <button type="button" onClick={onClose} className={`btn-secondary ${styles.buttonSmall}`}>
              <X size={16} />
              <span>닫기</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.editorViewport}>
        {language === 'pdf' && rawUrl ? (
          <iframe
            src={rawUrl}
            className={styles.pdfViewer}
            title={fileName}
          />
        ) : !isPreview ? (
          <>
            <div ref={lineNumbersRef} className={styles.lineNumbers}>
              {lineNumbers}
            </div>
            <div className={styles.editorContainer}>
              <pre
                ref={preRef}
                className={styles.editorPre}
                dangerouslySetInnerHTML={{ __html: `${highlightedContent}\n` }}
              />
              <textarea
                ref={textareaRef}
                className={styles.editorTextarea}
                value={content}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={handleEditorKeyDown}
                onScroll={handleEditorScroll}
                spellCheck={false}
              />
            </div>
          </>
        ) : (
          <div className={styles.markdownBody} onClick={handleWikilinkClick}>
            {parsed.frontmatter && <FrontmatterBlock fm={parsed.frontmatter} />}
            <div className={styles.markdownContent} dangerouslySetInnerHTML={{ __html: markdownHtml }} />
          </div>
        )}
      </div>

      <div className={styles.editorFooter}>
        <span>라인: {content.split('\n').length}</span>
        <span>탭: 2 spaces</span>
      </div>
    </div>
  );
}
