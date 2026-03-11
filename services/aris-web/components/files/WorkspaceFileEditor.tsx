'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code, Edit3, Eye, Loader2, Save, X } from 'lucide-react';
import Prism from 'prismjs';
import { marked } from 'marked';
import styles from './WorkspaceFileEditor.module.css';

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
  isSaving?: boolean;
  saveDisabled?: boolean;
  onChange: (nextContent: string) => void;
  onSave: () => void | Promise<void>;
  onClose?: () => void;
  className?: string;
};

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
    python: 'Python',
    text: 'Text',
    typescript: 'TypeScript',
  };
  return map[lang] ?? 'Text';
}

export function WorkspaceFileEditor({
  fileName,
  content,
  isSaving = false,
  saveDisabled = false,
  onChange,
  onSave,
  onClose,
  className,
}: WorkspaceFileEditorProps) {
  const [isPreview, setIsPreview] = useState(false);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setIsPreview(false);
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

    return marked.parse(content, { breaks: true, gfm: true, renderer }) as string;
  }, [content, isPreview, language]);

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
        {!isPreview ? (
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
          <div className={styles.markdownBody} dangerouslySetInnerHTML={{ __html: markdownHtml }} />
        )}
      </div>

      <div className={styles.editorFooter}>
        <span>라인: {content.split('\n').length}</span>
        <span>탭: 2 spaces</span>
      </div>
    </div>
  );
}
