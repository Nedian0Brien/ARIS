'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowUpCircle,
  Blocks,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  GitBranch,
  type LucideIcon,
  Loader2,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  PlugZap,
  RefreshCw,
  Save,
  Search,
  TerminalSquare,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { WorkspaceFileEditor } from '@/components/files/WorkspaceFileEditor';
import styles from './CustomizationSidebar.module.css';

type SidebarSurface = 'customization' | 'files' | 'git' | 'terminal';
type CustomizationSection = 'instructions' | 'skills' | 'mcp';

type InstructionDocSummary = {
  id: string;
  name: string;
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  updatedAt: string | null;
};

type SkillSummary = {
  id: string;
  name: string;
  description: string;
  source: 'agents' | 'codex';
  relativePath: string;
};

type MpcServerSummary = {
  id: string;
  name: string;
  status: 'connected' | 'needs_auth' | 'failed' | 'connecting' | 'unknown';
  source: string;
  detail: string;
  lastSeenAt: string | null;
};

type CustomizationOverview = {
  workspacePath: string;
  instructionDocs: InstructionDocSummary[];
  skills: SkillSummary[];
  mcpServers: MpcServerSummary[];
};

type InstructionPayload = {
  content: string;
  summary: InstructionDocSummary;
};

type SkillPayload = {
  content: string;
  summary: SkillSummary;
};

type WorkspaceFileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
};

type FilePreviewBlock = {
  reason: 'binary' | 'large';
  sizeBytes: number;
};

type FileActionDialog =
  | { kind: 'create-file'; targetPath: string; value: string }
  | { kind: 'create-folder'; targetPath: string; value: string }
  | { kind: 'rename'; targetPath: string; targetName: string; value: string }
  | { kind: 'delete'; targetPath: string; targetName: string };

type RequestedFilePayload = {
  path: string;
  name?: string;
  nonce: number;
};

type CustomizationModal =
  | { kind: 'instruction'; id: string }
  | { kind: 'skill'; id: string }
  | { kind: 'file'; id: string }
  | null;

type Props = {
  sessionId: string;
  projectName: string;
  workspaceRootPath?: string;
  requestedFile?: RequestedFilePayload | null;
  isPinned?: boolean;
  onTogglePinned?: () => void;
  mode?: 'desktop' | 'mobile';
  onRequestClose?: () => void;
};

const SURFACE_ITEMS: Array<{
  id: SidebarSurface;
  label: string;
  hint: string;
  Icon: LucideIcon;
  disabled?: boolean;
}> = [
  { id: 'customization', label: 'Customization', hint: '활성', Icon: Wrench },
  { id: 'files', label: 'Files', hint: '활성', Icon: FolderKanban },
  { id: 'git', label: 'Git', hint: '다음 단계', Icon: GitBranch, disabled: true },
  { id: 'terminal', label: 'Terminal', hint: '다음 단계', Icon: TerminalSquare, disabled: true },
];

function formatTimestamp(value: string | null): string {
  if (!value) return '시간 정보 없음';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function formatBytes(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '--';
  }
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
}

function getMcpStatusClass(status: MpcServerSummary['status']): string {
  if (status === 'connected') return styles.tagGood;
  if (status === 'needs_auth') return styles.tagWarn;
  if (status === 'failed') return styles.tagDanger;
  return styles.tagMuted;
}

function getMcpStatusLabel(status: MpcServerSummary['status']): string {
  if (status === 'connected') return '연결됨';
  if (status === 'needs_auth') return '인증 필요';
  if (status === 'failed') return '실패';
  if (status === 'connecting') return '연결 중';
  return '확인 불가';
}

function normalizeWorkspaceClientPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized || '/';
}

function getParentWorkspacePath(targetPath: string): string | null {
  const normalized = normalizeWorkspaceClientPath(targetPath);
  if (normalized === '/') {
    return null;
  }
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash <= 0 ? '/' : normalized.slice(0, lastSlash);
}

function joinWorkspacePath(dirPath: string, name: string): string {
  const normalizedDir = normalizeWorkspaceClientPath(dirPath);
  const trimmedName = name.trim().replace(/^\/+/, '');
  return normalizedDir === '/' ? `/${trimmedName}` : `${normalizedDir}/${trimmedName}`;
}

function isWorkspacePathWithinRoot(targetPath: string, rootPath: string): boolean {
  const normalizedTarget = normalizeWorkspaceClientPath(targetPath);
  const normalizedRoot = normalizeWorkspaceClientPath(rootPath);
  return normalizedRoot === '/'
    ? normalizedTarget.startsWith('/')
    : normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}

export function CustomizationSidebar({
  sessionId,
  projectName,
  workspaceRootPath = '/',
  requestedFile = null,
  isPinned = false,
  onTogglePinned,
  mode = 'desktop',
  onRequestClose,
}: Props) {
  const normalizedWorkspaceRootPath = useMemo(
    () => normalizeWorkspaceClientPath(workspaceRootPath),
    [workspaceRootPath],
  );
  const [activeSurface, setActiveSurface] = useState<SidebarSurface>('customization');
  const [activeSection, setActiveSection] = useState<CustomizationSection>('instructions');
  const [overview, setOverview] = useState<CustomizationOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [selectedInstructionId, setSelectedInstructionId] = useState<string | null>(null);
  const [instructionContent, setInstructionContent] = useState('');
  const [instructionLoading, setInstructionLoading] = useState(false);
  const [instructionSaving, setInstructionSaving] = useState(false);
  const [instructionDirty, setInstructionDirty] = useState(false);
  const [instructionStatus, setInstructionStatus] = useState<string | null>(null);

  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState('');
  const [skillLoading, setSkillLoading] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [filesPath, setFilesPath] = useState(normalizedWorkspaceRootPath);
  const [filesParentPath, setFilesParentPath] = useState<string | null>(null);
  const [filesEntries, setFilesEntries] = useState<WorkspaceFileEntry[]>([]);
  const [filesEntriesByPath, setFilesEntriesByPath] = useState<Record<string, WorkspaceFileEntry[]>>({});
  const [filesLoadingByPath, setFilesLoadingByPath] = useState<Record<string, boolean>>({});
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesErrorByPath, setFilesErrorByPath] = useState<Record<string, string | null>>({});
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, boolean>>({});
  const [filesSearchQuery, setFilesSearchQuery] = useState('');
  const [filesSearchResults, setFilesSearchResults] = useState<WorkspaceFileEntry[] | null>(null);
  const [filesSearchLoading, setFilesSearchLoading] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileSaving, setFileSaving] = useState(false);
  const [fileDirty, setFileDirty] = useState(false);
  const [fileStatus, setFileStatus] = useState<string | null>(null);
  const [filePreviewBlock, setFilePreviewBlock] = useState<FilePreviewBlock | null>(null);
  const [fileActionDialog, setFileActionDialog] = useState<FileActionDialog | null>(null);
  const [fileActionMenuPath, setFileActionMenuPath] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<CustomizationModal>(null);
  const [isMounted, setIsMounted] = useState(false);
  const handledRequestedFileNonceRef = useRef<number | null>(null);

  const selectedInstruction = useMemo(
    () => overview?.instructionDocs.find((doc) => doc.id === selectedInstructionId) ?? null,
    [overview, selectedInstructionId],
  );
  const selectedSkill = useMemo(
    () => overview?.skills.find((skill) => skill.id === selectedSkillId) ?? null,
    [overview, selectedSkillId],
  );
  const activeModalKind = activeModal?.kind ?? null;
  const activeInstructionModal = activeModalKind === 'instruction' ? selectedInstruction : null;
  const activeSkillModal = activeModalKind === 'skill' ? selectedSkill : null;
  const activeFileModal = activeModalKind === 'file' && selectedFilePath
    ? { path: selectedFilePath, name: selectedFileName ?? selectedFilePath.split('/').pop() ?? selectedFilePath }
    : null;

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/customization`, {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Customization 정보를 불러오지 못했습니다.');
      }

      const nextOverview = data as CustomizationOverview;
      setOverview(nextOverview);
      setSelectedInstructionId((prev) => {
        if (prev && nextOverview.instructionDocs.some((doc) => doc.id === prev)) {
          return prev;
        }
        return nextOverview.instructionDocs.find((doc) => doc.exists)?.id
          ?? nextOverview.instructionDocs[0]?.id
          ?? null;
      });
      setSelectedSkillId((prev) => {
        if (prev && nextOverview.skills.some((skill) => skill.id === prev)) {
          return prev;
        }
        return nextOverview.skills[0]?.id ?? null;
      });
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : 'Customization 정보를 불러오지 못했습니다.');
    } finally {
      setOverviewLoading(false);
    }
  }, [sessionId]);

  const loadInstruction = useCallback(async (instructionId: string) => {
    setInstructionLoading(true);
    setInstructionStatus(null);
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/customization?kind=instruction&id=${encodeURIComponent(instructionId)}`,
        { cache: 'no-store' },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : '문서를 불러오지 못했습니다.');
      }

      setInstructionContent((data as InstructionPayload).content);
      setInstructionDirty(false);
    } catch (error) {
      setInstructionStatus(error instanceof Error ? error.message : '문서를 불러오지 못했습니다.');
      setInstructionContent('');
    } finally {
      setInstructionLoading(false);
    }
  }, [sessionId]);

  const loadSkill = useCallback(async (skillId: string) => {
    setSkillLoading(true);
    setSkillError(null);
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/customization?kind=skill&id=${encodeURIComponent(skillId)}`,
        { cache: 'no-store' },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : '스킬 내용을 불러오지 못했습니다.');
      }

      setSkillContent((data as SkillPayload).content);
    } catch (error) {
      setSkillError(error instanceof Error ? error.message : '스킬 내용을 불러오지 못했습니다.');
      setSkillContent('');
    } finally {
      setSkillLoading(false);
    }
  }, [sessionId]);

  const loadFilesDirectory = useCallback(async (dirPath: string, options?: { focus?: boolean }) => {
    const normalizedDirPath = normalizeWorkspaceClientPath(dirPath);
    const shouldFocus = options?.focus ?? true;

    setFilesLoadingByPath((prev) => ({ ...prev, [normalizedDirPath]: true }));
    setFilesErrorByPath((prev) => ({ ...prev, [normalizedDirPath]: null }));
    if (shouldFocus) {
      setFilesLoading(true);
      setFilesError(null);
    }
    try {
      const response = await fetch(`/api/fs/list?path=${encodeURIComponent(normalizedDirPath)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null) as {
        currentPath?: string;
        parentPath?: string | null;
        directories?: WorkspaceFileEntry[];
        error?: string;
      } | null;
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : '파일 목록을 불러오지 못했습니다.');
      }

      const currentPath = normalizeWorkspaceClientPath(data.currentPath ?? normalizedDirPath);
      const parentPath = data.parentPath && isWorkspacePathWithinRoot(data.parentPath, normalizedWorkspaceRootPath)
        ? data.parentPath
        : null;
      const entries = data.directories ?? [];

      setFilesEntriesByPath((prev) => ({ ...prev, [currentPath]: entries }));
      if (shouldFocus) {
        setFilesPath(currentPath);
        setFilesParentPath(parentPath);
        setFilesEntries(entries);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '파일 목록을 불러오지 못했습니다.';
      setFilesErrorByPath((prev) => ({ ...prev, [normalizedDirPath]: message }));
      if (shouldFocus) {
        setFilesError(message);
      }
    } finally {
      setFilesLoadingByPath((prev) => ({ ...prev, [normalizedDirPath]: false }));
      if (shouldFocus) {
        setFilesLoading(false);
      }
    }
  }, [normalizedWorkspaceRootPath]);

  const searchFiles = useCallback(async (query: string) => {
    setFilesSearchQuery(query);
    setFilesError(null);
    if (!query.trim()) {
      setFilesSearchResults(null);
      return;
    }

    setFilesSearchLoading(true);
    try {
      const response = await fetch(
        `/api/fs/search?q=${encodeURIComponent(query.trim())}&path=${encodeURIComponent(normalizedWorkspaceRootPath)}`,
        { cache: 'no-store' },
      );
      const data = await response.json().catch(() => null) as {
        results?: Array<{ name: string; path: string; isDirectory: boolean }>;
        error?: string;
      } | null;
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : '파일 검색에 실패했습니다.');
      }

      setFilesSearchResults((data.results ?? []).map((item) => ({
        ...item,
        isFile: !item.isDirectory,
      })));
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : '파일 검색에 실패했습니다.');
      setFilesSearchResults([]);
    } finally {
      setFilesSearchLoading(false);
    }
  }, [normalizedWorkspaceRootPath]);

  const loadFile = useCallback(async (filePath: string, fileName?: string) => {
    setFileLoading(true);
    setFileStatus(null);
    setFilePreviewBlock(null);
    setSelectedFilePath(filePath);
    setSelectedFileName(fileName ?? filePath.split('/').pop() ?? filePath);
    try {
      const response = await fetch(`/api/fs/read?path=${encodeURIComponent(filePath)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null) as {
        content?: string;
        sizeBytes?: number;
        blockedReason?: 'binary' | 'large';
        error?: string;
      } | null;
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : '파일을 불러오지 못했습니다.');
      }

      if (data.blockedReason) {
        setFilePreviewBlock({
          reason: data.blockedReason,
          sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : 0,
        });
        setFileContent('');
        setFileDirty(false);
        return;
      }

      setFileContent(data.content ?? '');
      setFileDirty(false);
    } catch (error) {
      setFileStatus(error instanceof Error ? error.message : '파일을 불러오지 못했습니다.');
      setFileContent('');
    } finally {
      setFileLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setFilesPath(normalizedWorkspaceRootPath);
    setFilesParentPath(null);
    setFilesEntries([]);
    setFilesEntriesByPath({});
    setFilesErrorByPath({});
    setFilesLoadingByPath({});
    setExpandedDirectories({});
    setFilesSearchQuery('');
    setFilesSearchResults(null);
  }, [normalizedWorkspaceRootPath]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedInstructionId) return;
    void loadInstruction(selectedInstructionId);
  }, [loadInstruction, selectedInstructionId]);

  useEffect(() => {
    if (!selectedSkillId) return;
    void loadSkill(selectedSkillId);
  }, [loadSkill, selectedSkillId]);

  useEffect(() => {
    if (activeSurface !== 'files') {
      return;
    }
    if ((filesEntriesByPath[filesPath]?.length ?? 0) > 0 || filesLoading || filesError) {
      return;
    }
    void loadFilesDirectory(filesPath);
  }, [activeSurface, filesEntriesByPath, filesError, filesLoading, filesPath, loadFilesDirectory]);

  useEffect(() => {
    if (!activeModal) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveModal(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeModal]);

  useEffect(() => {
    if (!fileActionMenuPath) {
      return;
    }

    const handlePointerDown = () => {
      setFileActionMenuPath(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [fileActionMenuPath]);

  const handleSaveInstruction = useCallback(async () => {
    if (!selectedInstructionId) return;
    setInstructionSaving(true);
    setInstructionStatus(null);
    try {
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/customization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'instruction',
          id: selectedInstructionId,
          content: instructionContent,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : '문서를 저장하지 못했습니다.');
      }

      setInstructionDirty(false);
      setInstructionStatus('저장됨');
      await loadOverview();
    } catch (error) {
      setInstructionStatus(error instanceof Error ? error.message : '문서를 저장하지 못했습니다.');
    } finally {
      setInstructionSaving(false);
    }
  }, [instructionContent, loadOverview, selectedInstructionId, sessionId]);

  const handleSaveFile = useCallback(async () => {
    if (!selectedFilePath) return;
    setFileSaving(true);
    setFileStatus(null);
    try {
      const response = await fetch('/api/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selectedFilePath,
          content: fileContent,
        }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok || data?.error) {
        throw new Error(typeof data?.error === 'string' ? data.error : '파일을 저장하지 못했습니다.');
      }

      setFileDirty(false);
      setFileStatus('저장됨');
      await loadFilesDirectory(filesPath);
    } catch (error) {
      setFileStatus(error instanceof Error ? error.message : '파일을 저장하지 못했습니다.');
    } finally {
      setFileSaving(false);
    }
  }, [fileContent, filesPath, loadFilesDirectory, selectedFilePath]);

  const refreshFocusedFiles = useCallback(async (extraPaths: string[] = []) => {
    const paths = Array.from(new Set([
      filesPath,
      ...Object.entries(expandedDirectories)
        .filter(([, isExpanded]) => isExpanded)
        .map(([pathKey]) => pathKey),
      ...extraPaths,
    ].filter((value): value is string => Boolean(value))));

    await Promise.all(paths.map((pathKey) => loadFilesDirectory(pathKey, { focus: pathKey === filesPath })));
  }, [expandedDirectories, filesPath, loadFilesDirectory]);

  const handleToggleDirectory = useCallback((dirPath: string) => {
    const normalizedDirPath = normalizeWorkspaceClientPath(dirPath);
    const nextExpanded = !expandedDirectories[normalizedDirPath];
    setExpandedDirectories((prev) => ({ ...prev, [normalizedDirPath]: nextExpanded }));
    if (nextExpanded && !filesEntriesByPath[normalizedDirPath] && !filesLoadingByPath[normalizedDirPath]) {
      void loadFilesDirectory(normalizedDirPath, { focus: false });
    }
  }, [expandedDirectories, filesEntriesByPath, filesLoadingByPath, loadFilesDirectory]);

  const openFileModal = useCallback((filePath: string, fileName?: string) => {
    void loadFile(filePath, fileName);
    setActiveModal({ kind: 'file', id: filePath });
  }, [loadFile]);

  const handleConfirmFileAction = useCallback(async () => {
    if (!fileActionDialog) {
      return;
    }

    const trimValue = 'value' in fileActionDialog ? fileActionDialog.value.trim() : '';
    if ('value' in fileActionDialog && !trimValue) {
      setFilesError('이름을 입력해 주세요.');
      return;
    }

    try {
      if (fileActionDialog.kind === 'create-file') {
        const nextPath = joinWorkspacePath(fileActionDialog.targetPath, trimValue);
        const response = await fetch('/api/fs/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: nextPath, content: '' }),
        });
        const data = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok || data?.error) {
          throw new Error(typeof data?.error === 'string' ? data.error : '파일을 생성하지 못했습니다.');
        }
        await refreshFocusedFiles([fileActionDialog.targetPath]);
        openFileModal(nextPath, trimValue);
      } else if (fileActionDialog.kind === 'create-folder') {
        const nextPath = joinWorkspacePath(fileActionDialog.targetPath, trimValue);
        const response = await fetch('/api/fs/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: nextPath }),
        });
        const data = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok || data?.error) {
          throw new Error(typeof data?.error === 'string' ? data.error : '폴더를 생성하지 못했습니다.');
        }
        setExpandedDirectories((prev) => ({ ...prev, [fileActionDialog.targetPath]: true }));
        await refreshFocusedFiles([fileActionDialog.targetPath]);
      } else if (fileActionDialog.kind === 'rename') {
        const parentPath = getParentWorkspacePath(fileActionDialog.targetPath) ?? normalizedWorkspaceRootPath;
        const nextPath = joinWorkspacePath(parentPath, trimValue);
        const response = await fetch('/api/fs/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPath: fileActionDialog.targetPath, newPath: nextPath }),
        });
        const data = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok || data?.error) {
          throw new Error(typeof data?.error === 'string' ? data.error : '이름을 변경하지 못했습니다.');
        }
        if (filesPath === fileActionDialog.targetPath) {
          setFilesPath(nextPath);
        }
        if (selectedFilePath === fileActionDialog.targetPath) {
          setSelectedFilePath(nextPath);
          setSelectedFileName(trimValue);
        }
        await refreshFocusedFiles([parentPath]);
      } else {
        const response = await fetch(`/api/fs/delete?path=${encodeURIComponent(fileActionDialog.targetPath)}`, {
          method: 'DELETE',
        });
        const data = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok || data?.error) {
          throw new Error(typeof data?.error === 'string' ? data.error : '삭제하지 못했습니다.');
        }
        if (selectedFilePath && (selectedFilePath === fileActionDialog.targetPath || selectedFilePath.startsWith(`${fileActionDialog.targetPath}/`))) {
          setSelectedFilePath(null);
          setSelectedFileName(null);
          setActiveModal(null);
        }
        await refreshFocusedFiles([getParentWorkspacePath(fileActionDialog.targetPath) ?? filesPath]);
      }

      setFileActionDialog(null);
      setFilesError(null);
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : '파일 작업을 완료하지 못했습니다.');
    }
  }, [fileActionDialog, filesPath, normalizedWorkspaceRootPath, openFileModal, refreshFocusedFiles, selectedFilePath]);

  const headerWorkspacePath = overview?.workspacePath ?? projectName;
  const isMobileMode = mode === 'mobile';
  const openInstructionModal = useCallback((instructionId: string) => {
    setSelectedInstructionId(instructionId);
    setActiveModal({ kind: 'instruction', id: instructionId });
  }, []);
  const openSkillModal = useCallback((skillId: string) => {
    setSelectedSkillId(skillId);
    setActiveModal({ kind: 'skill', id: skillId });
  }, []);
  useEffect(() => {
    if (!requestedFile || handledRequestedFileNonceRef.current === requestedFile.nonce) {
      return;
    }

    handledRequestedFileNonceRef.current = requestedFile.nonce;
    const nextParentPath = getParentWorkspacePath(requestedFile.path) ?? normalizedWorkspaceRootPath;
    setActiveSurface('files');
    setFilesSearchQuery('');
    setFilesSearchResults(null);
    setExpandedDirectories({});
    void loadFilesDirectory(nextParentPath);
    openFileModal(requestedFile.path, requestedFile.name);
  }, [loadFilesDirectory, normalizedWorkspaceRootPath, openFileModal, requestedFile]);
  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);
  const visibleFiles = filesSearchResults ?? (filesEntriesByPath[filesPath] ?? filesEntries);
  const filesCountLabel = filesSearchResults ? `검색 ${visibleFiles.length}개` : `${visibleFiles.length}개`;
  const renderFileTree = useCallback((entries: WorkspaceFileEntry[], depth = 0) => (
    entries.map((item) => {
      const isExpanded = Boolean(expandedDirectories[item.path]);
      const childEntries = filesEntriesByPath[item.path] ?? [];
      const childLoading = Boolean(filesLoadingByPath[item.path]);
      const childError = filesErrorByPath[item.path];

      return (
        <div key={item.path} className={styles.fileTreeBranch}>
          <div className={styles.fileTreeRow} style={{ paddingLeft: `${depth * 16}px` }}>
            {item.isDirectory ? (
              <button
                type="button"
                className={styles.fileTreeToggle}
                onClick={() => handleToggleDirectory(item.path)}
                aria-label={isExpanded ? '폴더 접기' : '폴더 펼치기'}
                title={isExpanded ? '폴더 접기' : '폴더 펼치기'}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className={styles.fileTreeSpacer} />
            )}
            <button
              type="button"
              className={styles.fileTreeMain}
              onClick={() => {
                if (item.isDirectory) {
                  handleToggleDirectory(item.path);
                } else {
                  openFileModal(item.path, item.name);
                }
              }}
            >
              {item.isDirectory
                ? (isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />)
                : <FileText size={14} />}
              <span className={styles.fileEntryText}>
                <span className={styles.itemTitle}>{item.name}</span>
                <span className={styles.itemDescription}>{item.path}</span>
              </span>
            </button>
            <div className={styles.fileTreeActions} onMouseDown={(event) => event.stopPropagation()}>
              <button
                type="button"
                className={styles.fileTreeActionButton}
                onClick={(event) => {
                  event.stopPropagation();
                  setFileActionMenuPath((current) => (current === item.path ? null : item.path));
                }}
                title="파일 메뉴"
              >
                <MoreVertical size={13} />
              </button>
              {fileActionMenuPath === item.path ? (
                <div className={styles.fileTreeMenu}>
                  <button
                    type="button"
                    className={styles.fileTreeMenuItem}
                    onClick={() => {
                      setFileActionMenuPath(null);
                      setFileActionDialog({
                        kind: 'rename',
                        targetPath: item.path,
                        targetName: item.name,
                        value: item.name,
                      });
                    }}
                  >
                    <Pencil size={13} />
                    이름 변경
                  </button>
                  <button
                    type="button"
                    className={`${styles.fileTreeMenuItem} ${styles.fileTreeMenuItemDanger}`}
                    onClick={() => {
                      setFileActionMenuPath(null);
                      setFileActionDialog({
                        kind: 'delete',
                        targetPath: item.path,
                        targetName: item.name,
                      });
                    }}
                  >
                    <Trash2 size={13} />
                    삭제
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {item.isDirectory && isExpanded ? (
            <div className={styles.fileTreeChildren}>
              {childLoading ? (
                <div className={styles.fileTreeHint}>
                  <Loader2 size={14} className={styles.rotate} />
                  <span>폴더를 불러오는 중입니다.</span>
                </div>
              ) : childError ? (
                <div className={`${styles.fileTreeHint} ${styles.fileTreeHintError}`}>
                  <AlertTriangle size={14} />
                  <span>{childError}</span>
                </div>
              ) : childEntries.length > 0 ? (
                renderFileTree(childEntries, depth + 1)
              ) : (
                <div className={styles.fileTreeHint}>
                  <FolderKanban size={14} />
                  <span>빈 폴더</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      );
    })
  ), [expandedDirectories, fileActionMenuPath, filesEntriesByPath, filesErrorByPath, filesLoadingByPath, handleToggleDirectory, openFileModal]);

  return (
    <section className={`${styles.sidebarRoot} ${isMobileMode ? styles.sidebarRootMobile : ''}`}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <div className={styles.eyebrow}>
              <Wrench size={13} />
              Workspace Sidebar
            </div>
            <h3 className={styles.title}>Customization</h3>
            <p className={styles.subtle}>지침 문서, Skills, MCP 상태를 한 곳에서 확인하고 조정합니다.</p>
          </div>
          <div className={styles.headerActions}>
            {!isMobileMode && onTogglePinned ? (
              <button
                type="button"
                className={`${styles.refreshButton} ${isPinned ? styles.pinButtonActive : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={(event) => {
                  event.currentTarget.blur();
                  onTogglePinned();
                }}
                aria-label={isPinned ? '우측 사이드바 고정 해제' : '우측 사이드바 고정'}
                title={isPinned ? '우측 사이드바 고정 해제' : '우측 사이드바 고정'}
              >
                {isPinned ? <PinOff size={15} /> : <Pin size={15} />}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => {
                if (activeSurface === 'files') {
                  if (filesSearchQuery.trim()) {
                    void searchFiles(filesSearchQuery);
                  } else {
                    void loadFilesDirectory(filesPath);
                  }
                  return;
                }
                void loadOverview();
              }}
              disabled={activeSurface === 'files' ? filesLoading || filesSearchLoading : overviewLoading}
              aria-label="Customization 새로고침"
              title="Customization 새로고침"
            >
              <RefreshCw
                size={15}
                className={
                  activeSurface === 'files'
                    ? (filesLoading || filesSearchLoading ? styles.rotate : '')
                    : (overviewLoading ? styles.rotate : '')
                }
              />
            </button>
            {onRequestClose ? (
              <button
                type="button"
                className={styles.closeButton}
                onClick={onRequestClose}
                aria-label="Customization 패널 닫기"
                title="Customization 패널 닫기"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
        </div>

        <span className={styles.workspacePath}>{headerWorkspacePath}</span>

        <div className={styles.surfaceTabs}>
          {SURFACE_ITEMS.map(({ id, label, hint, Icon, disabled }) => {
            const isActive = activeSurface === id;
            return (
              <button
                key={id}
                type="button"
                className={`${styles.surfaceTab} ${isActive ? styles.surfaceTabActive : ''} ${disabled ? styles.surfaceTabDisabled : ''}`}
                onClick={() => {
                  if (!disabled) {
                    setActiveSurface(id);
                  }
                }}
                disabled={disabled}
              >
                <Icon size={14} />
                <span className={styles.surfaceTabLabel}>{label}</span>
                <span className={styles.surfaceTabHint}>{hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.body}>
        {activeSurface === 'customization' ? (
          <>
            <div className={styles.sectionTabs}>
              <button
                type="button"
                className={`${styles.sectionTab} ${activeSection === 'instructions' ? styles.sectionTabActive : ''}`}
                onClick={() => setActiveSection('instructions')}
              >
                AGENTS.md
              </button>
              <button
                type="button"
                className={`${styles.sectionTab} ${activeSection === 'skills' ? styles.sectionTabActive : ''}`}
                onClick={() => setActiveSection('skills')}
              >
                Skills
              </button>
              <button
                type="button"
                className={`${styles.sectionTab} ${activeSection === 'mcp' ? styles.sectionTabActive : ''}`}
                onClick={() => setActiveSection('mcp')}
              >
                MCP
              </button>
            </div>

            <div className={styles.content}>
              {overviewLoading && !overview ? (
                <div className={styles.loadingState}>
                  <Loader2 size={18} className={styles.rotate} />
                  <p>Customization 데이터를 불러오는 중입니다.</p>
                </div>
              ) : overviewError ? (
                <div className={styles.errorState}>
                  <FileText size={18} />
                  <p>{overviewError}</p>
                </div>
              ) : overview ? (
                <>
                  <div className={styles.statsRow}>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>{overview.instructionDocs.filter((doc) => doc.exists).length}</span>
                      <span className={styles.statLabel}>지침 문서</span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>{overview.skills.length}</span>
                      <span className={styles.statLabel}>Skills</span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>{overview.mcpServers.length}</span>
                      <span className={styles.statLabel}>MCP Servers</span>
                    </div>
                  </div>

                  {activeSection === 'instructions' && (
                    <div className={styles.listCard}>
                      <div className={styles.cardHeader}>
                        <span className={styles.cardTitle}>AGENTS.md</span>
                        <span className={styles.cardMeta}>{overview.instructionDocs.length}개</span>
                      </div>
                      <div className={`${styles.itemList} ${styles.documentGrid}`}>
                        {overview.instructionDocs.map((doc) => (
                          <button
                            key={doc.id}
                            type="button"
                            className={`${styles.itemButton} ${styles.documentTile} ${selectedInstructionId === doc.id ? styles.itemButtonActive : ''}`}
                            onClick={() => openInstructionModal(doc.id)}
                          >
                            <span className={styles.itemTitleRow}>
                              <FileText size={14} />
                              <span className={styles.itemTitle}>{doc.name}</span>
                            </span>
                            <span className={styles.itemDescription}>
                              {doc.exists ? `${formatBytes(doc.sizeBytes)} · ${formatTimestamp(doc.updatedAt)}` : '아직 생성되지 않음'}
                            </span>
                            <span className={`${styles.tag} ${doc.exists ? styles.tagGood : styles.tagWarn}`}>
                              {doc.exists ? '열기' : '새로 작성'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeSection === 'skills' && (
                    <div className={styles.listCard}>
                      <div className={styles.cardHeader}>
                        <span className={styles.cardTitle}>Skill 목록</span>
                        <span className={styles.cardMeta}>{overview.skills.length}개</span>
                      </div>
                      <div className={styles.itemList}>
                        {overview.skills.map((skill) => (
                          <button
                            key={skill.id}
                            type="button"
                            className={`${styles.itemButton} ${selectedSkillId === skill.id ? styles.itemButtonActive : ''}`}
                            onClick={() => openSkillModal(skill.id)}
                          >
                            <span className={styles.itemTitleRow}>
                              <Blocks size={13} />
                              <span className={styles.itemTitle}>{skill.name}</span>
                            </span>
                            <span className={styles.itemDescription}>{skill.description}</span>
                            <span className={`${styles.tag} ${skill.source === 'codex' ? styles.tagWarn : styles.tagMuted}`}>
                              {skill.source === 'codex' ? 'Codex' : 'Agents'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeSection === 'mcp' && (
                    <>
                      {overview.mcpServers.length === 0 ? (
                        <div className={styles.emptyState}>
                          <PlugZap size={18} />
                          <p>감지된 MCP 서버가 없습니다.</p>
                        </div>
                      ) : (
                        <div className={styles.mcpList}>
                          {overview.mcpServers.map((server) => (
                            <article key={server.id} className={styles.mcpCard}>
                              <div className={styles.mcpHeader}>
                                <div className={styles.mcpTitle}>{server.name}</div>
                                <span className={`${styles.tag} ${getMcpStatusClass(server.status)}`}>
                                  {getMcpStatusLabel(server.status)}
                                </span>
                              </div>
                              <div className={styles.mcpMeta}>
                                <span className={styles.tag}>{server.source}</span>
                                <span className={styles.tag}>{formatTimestamp(server.lastSeenAt)}</span>
                              </div>
                              <div className={styles.mcpDetail}>{server.detail}</div>
                            </article>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className={styles.emptyState}>
                  <CheckCircle2 size={18} />
                  <p>표시할 Customization 데이터가 없습니다.</p>
                </div>
              )}
            </div>
          </>
        ) : activeSurface === 'files' ? (
          <div className={styles.content}>
            <div className={styles.listCard}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Workspace Files</span>
                <span className={styles.cardMeta}>{filesCountLabel}</span>
              </div>
              <div className={styles.filesToolbar}>
                <label className={styles.searchField}>
                  <Search size={14} />
                  <input
                    className={styles.searchInput}
                    value={filesSearchQuery}
                    onChange={(event) => { void searchFiles(event.target.value); }}
                    placeholder="파일 또는 폴더 검색"
                  />
                </label>
                <div className={styles.filesActionRow}>
                  <button
                    type="button"
                    className={styles.pathButton}
                    onClick={() => {
                      setFileActionDialog({ kind: 'create-file', targetPath: filesPath, value: '' });
                    }}
                  >
                    <FilePlus size={14} />
                    새 파일
                  </button>
                  <button
                    type="button"
                    className={styles.pathButton}
                    onClick={() => {
                      setFileActionDialog({ kind: 'create-folder', targetPath: filesPath, value: '' });
                    }}
                  >
                    <FolderPlus size={14} />
                    새 폴더
                  </button>
                </div>
                <div className={styles.pathRow}>
                  {filesParentPath !== null && filesSearchResults === null && isWorkspacePathWithinRoot(filesParentPath, normalizedWorkspaceRootPath) ? (
                    <button
                      type="button"
                      className={styles.pathButton}
                      onClick={() => { void loadFilesDirectory(filesParentPath); }}
                    >
                      <ArrowUpCircle size={14} />
                      상위 폴더
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.pathButton}
                    onClick={() => {
                      setExpandedDirectories({});
                      void loadFilesDirectory(normalizedWorkspaceRootPath);
                    }}
                  >
                    <FolderKanban size={14} />
                    워크스페이스 루트
                  </button>
                  <span className={styles.pathValue}>{filesSearchResults ? '검색 결과' : filesPath}</span>
                </div>
              </div>
              <div className={styles.itemList}>
                {filesLoading || filesSearchLoading ? (
                  <div className={styles.loadingState}>
                    <Loader2 size={16} className={styles.rotate} />
                    <p>{filesSearchLoading ? '파일을 검색하는 중입니다.' : '파일 목록을 불러오는 중입니다.'}</p>
                  </div>
                ) : filesError ? (
                  <div className={styles.errorState}>
                    <FileText size={18} />
                    <p>{filesError}</p>
                  </div>
                ) : visibleFiles.length === 0 ? (
                  <div className={styles.emptyState}>
                    <FolderKanban size={18} />
                    <p>{filesSearchResults ? '검색 결과가 없습니다.' : '표시할 파일이 없습니다.'}</p>
                  </div>
                ) : (
                  renderFileTree(visibleFiles)
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.content}>
            <div className={styles.emptyState}>
              <FolderKanban size={18} />
              <p>이 패널은 다음 구현 단계에서 연결됩니다.</p>
            </div>
          </div>
        )}
      </div>
      {isMounted && activeModal && createPortal(
        <div className={styles.modalOverlay} onClick={closeModal}>
          <section
            className={`${styles.modalCard}${activeModalKind === 'file' ? ` ${styles.fileModalCard}` : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            {activeModalKind === 'file' ? (
              <div className={`${styles.modalBody} ${styles.fileModalBody}`}>
                {activeFileModal ? (
                  fileLoading ? (
                    <div className={styles.loadingState}>
                      <Loader2 size={16} className={styles.rotate} />
                      <p>파일을 불러오는 중입니다.</p>
                    </div>
                  ) : filePreviewBlock ? (
                    <div className={styles.filePreviewBlocked}>
                      <AlertTriangle size={18} />
                      <div className={styles.filePreviewBlockedText}>
                        <strong>
                          {filePreviewBlock.reason === 'binary'
                            ? '바이너리 파일은 에디터에서 미리보기를 지원하지 않습니다.'
                            : '큰 파일은 우측 모달에서 직접 열지 않습니다.'}
                        </strong>
                        <span>파일 크기: {formatBytes(filePreviewBlock.sizeBytes)}</span>
                        <span>
                          {filePreviewBlock.reason === 'binary'
                            ? '텍스트 파일만 미리보기와 편집을 지원합니다.'
                            : '대용량 파일은 별도 편집기나 로컬 도구에서 여는 방식을 권장합니다.'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {fileStatus ? <div className={styles.fileModalStatus}>{fileStatus}</div> : null}
                      <WorkspaceFileEditor
                        fileName={activeFileModal.name}
                        content={fileContent}
                        isSaving={fileSaving}
                        saveDisabled={fileSaving || fileLoading || !fileDirty}
                        className={styles.fileModalEditor}
                        onChange={(nextContent) => {
                          setFileContent(nextContent);
                          setFileDirty(true);
                          setFileStatus(null);
                        }}
                        onSave={() => void handleSaveFile()}
                        onClose={closeModal}
                      />
                    </>
                  )
                ) : (
                  <div className={styles.emptyState}>
                    <FileText size={18} />
                    <p>편집할 파일을 선택해 주세요.</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className={styles.modalHeader}>
                  <div>
                    <div className={styles.eyebrow}>
                      {activeModalKind === 'instruction' ? <FileText size={13} /> : <Blocks size={13} />}
                      {activeModalKind === 'instruction' ? 'Document Editor' : 'Skill Viewer'}
                    </div>
                    <h4 className={styles.modalTitle}>
                      {activeInstructionModal?.name ?? activeSkillModal?.name ?? '선택 없음'}
                    </h4>
                    <p className={styles.modalSubtle}>
                      {activeInstructionModal?.path ?? activeSkillModal?.relativePath ?? '내용을 확인할 수 없습니다.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.modalCloseButton}
                    onClick={closeModal}
                    aria-label="모달 닫기"
                    title="모달 닫기"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className={styles.modalBody}>
                  {activeModalKind === 'instruction' ? (
                    activeInstructionModal ? (
                      instructionLoading ? (
                        <div className={styles.loadingState}>
                          <Loader2 size={16} className={styles.rotate} />
                          <p>문서를 불러오는 중입니다.</p>
                        </div>
                      ) : (
                        <>
                          <textarea
                            className={styles.editor}
                            value={instructionContent}
                            onChange={(event) => {
                              setInstructionContent(event.target.value);
                              setInstructionDirty(true);
                              setInstructionStatus(null);
                            }}
                            spellCheck={false}
                          />
                          <div className={styles.actions}>
                            <span className={styles.statusText}>
                              {instructionStatus
                                ?? (instructionDirty ? '저장되지 않은 변경사항 있음' : '변경사항 없음')}
                            </span>
                            <button
                              type="button"
                              className={styles.saveButton}
                              onClick={() => void handleSaveInstruction()}
                              disabled={instructionSaving || instructionLoading || !instructionDirty}
                            >
                              {instructionSaving ? <Loader2 size={14} className={styles.rotate} /> : <Save size={14} />}
                              저장
                            </button>
                          </div>
                        </>
                      )
                    ) : (
                      <div className={styles.emptyState}>
                        <FileText size={18} />
                        <p>편집할 문서를 선택해 주세요.</p>
                      </div>
                    )
                  ) : activeSkillModal ? (
                    skillLoading ? (
                      <div className={styles.loadingState}>
                        <Loader2 size={16} className={styles.rotate} />
                        <p>스킬 본문을 불러오는 중입니다.</p>
                      </div>
                    ) : skillError ? (
                      <div className={styles.errorState}>
                        <Blocks size={18} />
                        <p>{skillError}</p>
                      </div>
                    ) : (
                      <div className={styles.preview}>
                        <pre>{skillContent}</pre>
                      </div>
                    )
                  ) : (
                    <div className={styles.emptyState}>
                      <Blocks size={18} />
                      <p>확인할 Skill을 선택해 주세요.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>,
        document.body,
      )}
      {isMounted && fileActionDialog && createPortal(
        <div className={styles.modalOverlay} onClick={() => setFileActionDialog(null)}>
          <section className={styles.actionDialogCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.eyebrow}>
                  {fileActionDialog.kind === 'delete' ? <Trash2 size={13} /> : <FolderKanban size={13} />}
                  {fileActionDialog.kind === 'create-file'
                    ? 'New File'
                    : fileActionDialog.kind === 'create-folder'
                      ? 'New Folder'
                      : fileActionDialog.kind === 'rename'
                        ? 'Rename'
                        : 'Delete'}
                </div>
                <h4 className={styles.modalTitle}>
                  {fileActionDialog.kind === 'create-file'
                    ? '새 파일 만들기'
                    : fileActionDialog.kind === 'create-folder'
                      ? '새 폴더 만들기'
                      : fileActionDialog.kind === 'rename'
                        ? `${fileActionDialog.targetName} 이름 변경`
                        : `${fileActionDialog.targetName} 삭제`}
                </h4>
                <p className={styles.modalSubtle}>
                  {'value' in fileActionDialog ? fileActionDialog.targetPath : `삭제 대상: ${fileActionDialog.targetPath}`}
                </p>
              </div>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={() => setFileActionDialog(null)}
                aria-label="모달 닫기"
                title="모달 닫기"
              >
                <X size={16} />
              </button>
            </div>
            <div className={styles.actionDialogBody}>
              {'value' in fileActionDialog ? (
                <input
                  autoFocus
                  className={styles.actionDialogInput}
                  value={fileActionDialog.value}
                  onChange={(event) => {
                    setFileActionDialog((current) => (
                      current && 'value' in current
                        ? { ...current, value: event.target.value }
                        : current
                    ));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleConfirmFileAction();
                    }
                  }}
                  placeholder={fileActionDialog.kind === 'rename' ? '새 이름' : '이름 입력'}
                />
              ) : (
                <p className={styles.actionDialogCopy}>
                  이 작업은 되돌릴 수 없습니다. 정말 삭제하시겠습니까?
                </p>
              )}
              <div className={styles.actionDialogActions}>
                <button
                  type="button"
                  className={styles.pathButton}
                  onClick={() => setFileActionDialog(null)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={`${styles.pathButton} ${styles.actionDialogConfirm}`}
                  onClick={() => { void handleConfirmFileAction(); }}
                >
                  {fileActionDialog.kind === 'delete' ? '삭제' : '확인'}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}
