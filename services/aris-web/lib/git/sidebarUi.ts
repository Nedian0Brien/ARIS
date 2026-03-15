import Prism from 'prismjs';

import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';

export type GitTreeNode<T extends { path: string }> =
  | {
    kind: 'folder';
    name: string;
    path: string;
    fileCount: number;
    children: Array<GitTreeNode<T>>;
  }
  | {
    kind: 'file';
    name: string;
    path: string;
    file: T;
  };

export type GitDiffSection =
  | {
    type: 'meta';
    lines: string[];
  }
  | {
    type: 'hunk';
    header: string;
    oldRange: string;
    newRange: string;
    lines: GitDiffLine[];
  };

export type GitDiffLine = {
  type: 'context' | 'add' | 'del' | 'note';
  prefix: string;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  highlightedHtml: string;
};

type MutableTreeFolder<T extends { path: string }> = {
  kind: 'folder-builder';
  name: string;
  path: string;
  fileCount: number;
  children: Map<string, MutableTreeFolder<T> | GitTreeNode<T>>;
};

const DIFF_META_PREFIXES = [
  'diff --git ',
  'index ',
  '--- ',
  '+++ ',
  'new file mode ',
  'deleted file mode ',
  'rename from ',
  'rename to ',
  'similarity index ',
  'dissimilarity index ',
  'Binary files ',
];

function createFolderNode<T extends { path: string }>(name: string, path: string): MutableTreeFolder<T> {
  return {
    kind: 'folder-builder',
    name,
    path,
    fileCount: 0,
    children: new Map(),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sortTreeNodes<T extends { path: string }>(nodes: Array<GitTreeNode<T>>): Array<GitTreeNode<T>> {
  return [...nodes].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'folder' ? -1 : 1;
    }
    return left.path.localeCompare(right.path);
  });
}

function freezeFolderNode<T extends { path: string }>(folder: MutableTreeFolder<T>): GitTreeNode<T> {
  const children = sortTreeNodes(
    Array.from(folder.children.values()).map((child) => (
      child.kind === 'folder-builder' ? freezeFolderNode(child) : child
    )),
  );

  return {
    kind: 'folder',
    name: folder.name,
    path: folder.path,
    fileCount: folder.fileCount,
    children,
  };
}

function isDiffMetaLine(line: string): boolean {
  return DIFF_META_PREFIXES.some((prefix) => line.startsWith(prefix));
}

function parseHunkHeader(line: string): { oldStart: number; newStart: number; oldRange: string; newRange: string } | null {
  const match = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
  if (!match) {
    return null;
  }

  const oldStart = Number.parseInt(match[1] ?? '0', 10);
  const newStart = Number.parseInt(match[2] ?? '0', 10);
  return {
    oldStart: Number.isFinite(oldStart) ? oldStart : 0,
    newStart: Number.isFinite(newStart) ? newStart : 0,
    oldRange: match[1] ?? '0',
    newRange: match[2] ?? '0',
  };
}

export function detectGitDiffLanguage(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
      return 'javascript';
    case 'jsx':
      return 'jsx';
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
    case 'yaml':
    case 'yml':
      return 'yaml';
    default:
      return 'text';
  }
}

export function highlightGitDiffCode(content: string, language: string): string {
  if (!content) {
    return '&nbsp;';
  }
  if (language === 'text' || !Prism.languages[language]) {
    return escapeHtml(content);
  }
  return Prism.highlight(content, Prism.languages[language], language);
}

export function buildGitFileTree<T extends { path: string }>(files: T[]): Array<GitTreeNode<T>> {
  const root = createFolderNode<T>('', '');

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    let currentFolder = root;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const folderName = segments[index] ?? '';
      const folderPath = segments.slice(0, index + 1).join('/');
      const existingFolder = currentFolder.children.get(folderName);
      if (!existingFolder || existingFolder.kind !== 'folder-builder') {
        currentFolder.children.set(folderName, createFolderNode<T>(folderName, folderPath));
      }
      currentFolder.fileCount += 1;
      currentFolder = currentFolder.children.get(folderName) as MutableTreeFolder<T>;
    }

    const fileName = segments[segments.length - 1] ?? file.path;
    currentFolder.fileCount += 1;
    currentFolder.children.set(fileName, {
      kind: 'file',
      name: fileName,
      path: file.path,
      file,
    });
  }

  return sortTreeNodes(
    Array.from(root.children.values()).map((child) => (
      child.kind === 'folder-builder' ? freezeFolderNode(child) : child
    )),
  );
}

export function parseGitUnifiedDiff(diffText: string, filePath: string): {
  language: string;
  sections: GitDiffSection[];
} {
  const lines = diffText.replace(/\r\n/g, '\n').split('\n');
  const language = detectGitDiffLanguage(filePath);
  const sections: GitDiffSection[] = [];
  let metaBuffer: string[] = [];
  let currentHunk: Extract<GitDiffSection, { type: 'hunk' }> | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;

  const flushMetaBuffer = () => {
    if (metaBuffer.length === 0) {
      return;
    }
    sections.push({
      type: 'meta',
      lines: metaBuffer,
    });
    metaBuffer = [];
  };

  const closeHunk = () => {
    if (currentHunk) {
      sections.push(currentHunk);
      currentHunk = null;
    }
  };

  for (const line of lines) {
    if (!line && sections.length === 0 && metaBuffer.length === 0) {
      continue;
    }

    if (line.startsWith('@@ ')) {
      flushMetaBuffer();
      closeHunk();

      const header = parseHunkHeader(line);
      oldLineNumber = header?.oldStart ?? 0;
      newLineNumber = header?.newStart ?? 0;
      currentHunk = {
        type: 'hunk',
        header: line,
        oldRange: header?.oldRange ?? '0',
        newRange: header?.newRange ?? '0',
        lines: [],
      };
      continue;
    }

    if (isDiffMetaLine(line)) {
      closeHunk();
      metaBuffer.push(line);
      continue;
    }

    if (!currentHunk) {
      metaBuffer.push(line);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.lines.push({
        type: 'add',
        prefix: '+',
        content: line.slice(1),
        oldLineNumber: null,
        newLineNumber,
        highlightedHtml: highlightGitDiffCode(line.slice(1), language),
      });
      newLineNumber += 1;
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.lines.push({
        type: 'del',
        prefix: '-',
        content: line.slice(1),
        oldLineNumber,
        newLineNumber: null,
        highlightedHtml: highlightGitDiffCode(line.slice(1), language),
      });
      oldLineNumber += 1;
      continue;
    }

    if (line.startsWith(' ')) {
      currentHunk.lines.push({
        type: 'context',
        prefix: ' ',
        content: line.slice(1),
        oldLineNumber,
        newLineNumber,
        highlightedHtml: highlightGitDiffCode(line.slice(1), language),
      });
      oldLineNumber += 1;
      newLineNumber += 1;
      continue;
    }

    currentHunk.lines.push({
      type: 'note',
      prefix: '',
      content: line,
      oldLineNumber: null,
      newLineNumber: null,
      highlightedHtml: escapeHtml(line),
    });
  }

  closeHunk();
  flushMetaBuffer();

  return {
    language,
    sections,
  };
}
