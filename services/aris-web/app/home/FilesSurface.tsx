'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, FileText, Folder, FolderOpen, Search } from 'lucide-react';
import { withAppBasePath } from '@/lib/routing/appPath';

type FileItem = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  sizeBytes?: number;
  modifiedAt?: string;
};

type DirectoryData = {
  currentPath: string;
  parentPath: string | null;
  directories: FileItem[];
};

const FALLBACK_FILES: FileItem[] = [
  { name: 'docs', path: '/docs', isDirectory: true, isFile: false },
  { name: 'chat-prototype.html', path: '/docs/design/chat-prototype.html', isDirectory: false, isFile: true, sizeBytes: 112400 },
  { name: 'chat-screen-v1.html', path: '/docs/design/chat-screen-v1.html', isDirectory: false, isFile: true, sizeBytes: 204800 },
  { name: 'chat-redesign-spec.md', path: '/docs/chat-redesign-spec.md', isDirectory: false, isFile: true, sizeBytes: 18300 },
  { name: 'design-system-v1.html', path: '/docs/design/design-system-v1.html', isDirectory: false, isFile: true, sizeBytes: 98100 },
  { name: 'chat-composer-v2.html', path: '/docs/design/chat-composer-v2.html', isDirectory: false, isFile: true, sizeBytes: 108500 },
];

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return 'unknown';

  const diffMs = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

function formatBytes(value?: number): string {
  if (!value || value < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let next = value;
  let unitIndex = 0;
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }
  return `${next >= 10 ? next.toFixed(0) : next.toFixed(1)} ${units[unitIndex]}`;
}
export function FilesSurface({ browserRootPath }: { browserRootPath: string }) {
  const [currentPath, setCurrentPath] = useState(browserRootPath || '/');
  const [data, setData] = useState<DirectoryData | null>(null);
  const [selected, setSelected] = useState<FileItem | null>(FALLBACK_FILES[1] ?? null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function fetchFiles() {
      try {
        const response = await fetch(withAppBasePath(`/api/fs/list?path=${encodeURIComponent(currentPath)}`), { cache: 'no-store' });
        if (!response.ok) throw new Error('failed');
        const body = await response.json() as DirectoryData;
        if (!cancelled) {
          setData(body);
          const nextSelected = body.directories.find((item) => item.isFile) ?? body.directories[0] ?? null;
          setSelected((previous) => previous && body.directories.some((item) => item.path === previous.path) ? previous : nextSelected);
        }
      } catch {
        if (!cancelled) {
          setData({ currentPath, parentPath: null, directories: FALLBACK_FILES });
          setSelected((previous) => previous ?? FALLBACK_FILES[1] ?? null);
        }
      }
    }
    void fetchFiles();
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  const rows = (data?.directories ?? FALLBACK_FILES)
    .filter((item) => !query.trim() || item.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));

  return (
    <div className="m-main-scroll m-main-scroll--files">
      <div className="files-head">
        <form className="files-search" onSubmit={(event) => event.preventDefault()}>
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" />
        </form>
        <div className="files-chips">
          {['All', 'Code', 'Docs', 'Logs', 'Recent'].map((chip, index) => (
            <button key={chip} type="button" className={`files-chip${index === 0 ? ' files-chip--active' : ''}`}>{chip}</button>
          ))}
        </div>
      </div>

      <div className="files-body">
        <aside className="files-tree">
          <div className="files-tree__group">Projects</div>
          <button type="button" className="files-node files-node--dir" onClick={() => setCurrentPath(browserRootPath || '/')}>
            <ChevronRight size={13} />
            <span className="files-node__name">ARIS</span>
          </button>
          <button type="button" className="files-node files-node--dir" onClick={() => setCurrentPath('/home/ubuntu/project/ARIS/services')}>
            <ChevronRight size={13} />
            <span className="files-node__name">services</span>
          </button>
          <button type="button" className="files-node files-node--active" onClick={() => setCurrentPath('/home/ubuntu/project/ARIS/.worktrees')}>
            <Folder size={13} />
            <span className="files-node__name">design-system-v1</span>
          </button>
          <button type="button" className="files-node files-node--dir">
            <ChevronRight size={13} />
            <span className="files-node__name">Lawdigest</span>
          </button>
          <div className="files-tree__group files-tree__group--system">System</div>
          {['logs', 'scripts', 'obsidian', 'backups'].map((item, index) => (
            <button key={item} type="button" className="files-node">
              <FolderOpen size={13} />
              <span className="files-node__name">{item}</span>
              {index !== 2 && <span className="files-node__count">{index === 0 ? 482 : index === 1 ? 14 : 28}</span>}
            </button>
          ))}
        </aside>

        <section className="files-list" aria-label="Files">
          <div className="files-list__head"><span>Name</span><span>Owner</span><span>Size</span><span>Modified</span></div>
          {rows.map((item) => (
            <button
              key={item.path}
              type="button"
              className={`files-row${selected?.path === item.path ? ' files-row--active' : ''}`}
              onClick={() => {
                if (item.isDirectory) {
                  setCurrentPath(item.path);
                } else {
                  setSelected(item);
                }
              }}
            >
              <span className="files-row__name">
                {item.isDirectory ? <Folder size={14} /> : <FileText size={14} />}
                <span>{item.isDirectory ? `${item.name}/` : item.name}</span>
              </span>
              <span className="files-row__small files-row__small--left">ARIS</span>
              <span className="files-row__small">{item.isDirectory ? '-' : formatBytes(item.sizeBytes)}</span>
              <span className="files-row__small">{item.modifiedAt ? formatRelativeTime(item.modifiedAt) : 'recent'}</span>
            </button>
          ))}
        </section>

        <aside className="files-preview">
          <div className="files-prev-thumb" />
          <div>
            <div className="files-prev-name">{selected?.name ?? 'No file selected'}</div>
            <div className="files-prev-path">{selected?.path ?? currentPath}</div>
          </div>
          <div className="files-prev-facts">
            <div><div className="files-prev-fact-label">Size</div><div className="files-prev-fact-val">{formatBytes(selected?.sizeBytes)}</div></div>
            <div><div className="files-prev-fact-label">Lines</div><div className="files-prev-fact-val">{selected?.isFile ? '3,242' : '-'}</div></div>
            <div><div className="files-prev-fact-label">Type</div><div className="files-prev-fact-val">{selected?.isDirectory ? 'DIR' : selected?.name.split('.').pop()?.toUpperCase() ?? '-'}</div></div>
            <div><div className="files-prev-fact-label">Owner</div><div className="files-prev-fact-val">ARIS</div></div>
          </div>
          <div className="files-prev-actions">
            <button type="button" className="btn btn--secondary" disabled={!selected?.isFile}>Open preview</button>
            <button type="button" className="btn btn--ghost">Copy path</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
