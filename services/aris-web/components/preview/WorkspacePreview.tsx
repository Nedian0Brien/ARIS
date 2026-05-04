'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceFileEditor } from '@/components/files/WorkspaceFileEditor';

export type WorkspacePreviewMode = 'file' | 'url';

export type WorkspacePreviewProps = {
  filePath: string | null;
  mode: WorkspacePreviewMode;
  url: string;
  refreshKey: number;
  zoom: number;
  className?: string;
};

type FileKind = 'text' | 'image' | 'pdf' | 'binary';

const TEXT_EXTENSIONS = new Set([
  'md', 'mdx', 'markdown', 'txt', 'log',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'json', 'yaml', 'yml', 'toml', 'ini', 'env',
  'css', 'scss', 'less', 'html', 'htm', 'xml', 'svg',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'sh', 'bash', 'zsh',
  'sql', 'graphql', 'gql',
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico']);

function getExtension(filePath: string): string {
  const slash = filePath.lastIndexOf('/');
  const last = slash >= 0 ? filePath.slice(slash + 1) : filePath;
  const dot = last.lastIndexOf('.');
  if (dot < 0) return '';
  return last.slice(dot + 1).toLowerCase();
}

function classifyFile(filePath: string): FileKind {
  const ext = getExtension(filePath);
  if (!ext) return 'text';
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return 'binary';
}

function fileNameOf(filePath: string): string {
  const slash = filePath.lastIndexOf('/');
  return slash >= 0 ? filePath.slice(slash + 1) : filePath;
}

function FilePreviewBody({ filePath, refreshKey }: { filePath: string; refreshKey: number }) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = useMemo(() => classifyFile(filePath), [filePath]);

  useEffect(() => {
    if (kind !== 'text') return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const url = `/api/fs/read?path=${encodeURIComponent(filePath)}`;
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        const body = (await response.json().catch(() => ({}))) as { content?: string; error?: string; blockedReason?: string };
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(typeof body.error === 'string' && body.error.length > 0
            ? body.error
            : '파일을 불러올 수 없습니다.');
        }
        if (typeof body.blockedReason === 'string' && body.blockedReason.length > 0) {
          setContent('');
          setError(body.blockedReason);
          return;
        }
        setContent(typeof body.content === 'string' ? body.content : '');
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        setError(err instanceof Error ? err.message : '파일을 불러올 수 없습니다.');
        setContent('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [filePath, kind, refreshKey]);

  if (kind === 'image') {
    return (
      <div className="ws-preview__image-frame">
        <img
          key={refreshKey}
          src={`/api/fs/raw?path=${encodeURIComponent(filePath)}`}
          alt={fileNameOf(filePath)}
          className="ws-preview__image"
        />
      </div>
    );
  }

  if (kind === 'pdf') {
    return (
      <iframe
        key={refreshKey}
        src={`/api/fs/raw?path=${encodeURIComponent(filePath)}`}
        title={fileNameOf(filePath)}
        className="ws-preview__pdf"
      />
    );
  }

  if (kind === 'binary') {
    return (
      <div className="ws-preview__empty">
        <p>이 파일 형식은 미리보기를 지원하지 않습니다.</p>
        <p className="ws-preview__empty-meta">{filePath}</p>
      </div>
    );
  }

  if (loading) {
    return <div className="ws-preview__empty">파일을 불러오는 중…</div>;
  }

  if (error) {
    return (
      <div className="ws-preview__empty ws-preview__empty--error">
        <p>{error}</p>
        <p className="ws-preview__empty-meta">{filePath}</p>
      </div>
    );
  }

  return (
    <div className="ws-preview__file">
      <WorkspaceFileEditor
        fileName={fileNameOf(filePath)}
        content={content}
        filePath={filePath}
        rawUrl={`/api/fs/raw?path=${encodeURIComponent(filePath)}`}
        onChange={() => { /* read-only preview */ }}
        onSave={() => { /* read-only preview */ }}
        saveDisabled
      />
    </div>
  );
}

function UrlPreviewBody({ url, refreshKey }: { url: string; refreshKey: number }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.src = url;
  }, [url, refreshKey]);

  if (!url) {
    return (
      <div className="ws-preview__empty">
        <p>URL을 입력해 주세요.</p>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      title="Workspace URL preview"
      className="ws-preview__url"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
    />
  );
}

export function WorkspacePreview({ filePath, mode, url, refreshKey, zoom, className }: WorkspacePreviewProps) {
  const containerClass = `ws-preview${className ? ` ${className}` : ''}`;
  const innerStyle = { transform: `scale(${zoom})`, transformOrigin: 'top left' };

  return (
    <div className={containerClass} data-mode={mode}>
      <div className="ws-preview__inner" style={innerStyle}>
        {mode === 'file' ? (
          filePath ? (
            <FilePreviewBody filePath={filePath} refreshKey={refreshKey} />
          ) : (
            <div className="ws-preview__empty">
              <p>왼쪽 Files 패널에서 파일을 선택하세요.</p>
            </div>
          )
        ) : (
          <UrlPreviewBody url={url} refreshKey={refreshKey} />
        )}
      </div>
    </div>
  );
}
