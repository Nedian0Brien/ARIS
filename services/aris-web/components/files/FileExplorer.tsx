'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Folder, FolderOpen, File, ChevronRight, ArrowUpCircle,
  Loader2, FolderPlus, FilePlus, Trash2, X, AlertCircle,
  MoreVertical, Pencil, Move
} from 'lucide-react';
import { Card } from '@/components/ui';
import styles from './FileExplorer.module.css';
import { WorkspaceFileEditor } from './WorkspaceFileEditor';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
}

interface DirectoryData {
  currentPath: string;
  parentPath: string | null;
  directories: FileItem[];
}

export function FileExplorer() {
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [data, setData] = useState<DirectoryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Responsive State
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const checkScreen = () => setIsLargeScreen(window.innerWidth >= 768);
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  // UI States
  const [editingFile, setEditingFile] = useState<{ path: string; name: string; content: string; rawUrl?: string } | null>(null);
  const [isEditorSaving, setIsEditorSaving] = useState(false);
  const fileNavHistoryRef = useRef<string[]>([]);
  const fileNavIndexRef = useRef(-1);
  const [fileNavState, setFileNavState] = useState({ canGoBack: false, canGoForward: false });
  const [newPathInput, setNewPathInput] = useState<{ type: 'file' | 'folder'; active: boolean }>({ type: 'file', active: false });
  const [newName, setNewName] = useState('');

  // Context Menu State
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ type: 'rename' | 'move'; item: FileItem; value: string } | null>(null);

  // Refs
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error('폴더를 불러오는 데 실패했습니다.');
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDirectory(currentPath);
  }, [currentPath, fetchDirectory]);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    setActiveMenu(null);
  };

  const handleCreate = async () => {
    if (!newName) return;
    const fullPath = currentPath === '/' ? `/${newName}` : `${currentPath}/${newName}`;
    const endpoint = newPathInput.type === 'folder' ? '/api/fs/mkdir' : '/api/fs/write';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath, content: '' })
      });
      if (!res.ok) throw new Error('생성에 실패했습니다.');
      setNewName('');
      setNewPathInput({ ...newPathInput, active: false });
      fetchDirectory(currentPath);
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    }
  };

  const handleDelete = async (item: FileItem) => {
    setActiveMenu(null);
    if (!window.confirm(`정말로 '${item.name}'을(를) 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(`/api/fs/delete?path=${encodeURIComponent(item.path)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제에 실패했습니다.');
      if (editingFile?.path === item.path) setEditingFile(null);
      fetchDirectory(currentPath);
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    }
  };

  const handleFileAction = async () => {
    if (!actionModal) return;
    const { type, item, value } = actionModal;
    if (!value || value === item.name) {
      setActionModal(null);
      return;
    }

    let newPath = '';
    if (type === 'rename') {
      const lastSlashIndex = item.path.lastIndexOf('/');
      const parent = item.path.substring(0, lastSlashIndex);
      newPath = parent ? `${parent}/${value}` : `/${value}`;
    } else {
      newPath = value.startsWith('/') ? value : `/${value}`;
    }

    try {
      const res = await fetch('/api/fs/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath: item.path, newPath })
      });
      if (!res.ok) throw new Error('작업에 실패했습니다.');
      if (editingFile?.path === item.path) {
        setEditingFile(prev => prev ? { ...prev, path: newPath, name: value } : null);
      }
      setActionModal(null);
      fetchDirectory(currentPath);
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    }
  };

  const handleEditFile = async (item: FileItem) => {
    if (item.isDirectory) return;
    setActiveMenu(null);

    const ext = item.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      setEditingFile({
        path: item.path,
        name: item.name,
        content: '',
        rawUrl: `/api/fs/raw?path=${encodeURIComponent(item.path)}`,
      });
      return;
    }

    try {
      const res = await fetch(`/api/fs/read?path=${encodeURIComponent(item.path)}`);
      if (!res.ok) throw new Error('파일을 읽는 데 실패했습니다.');
      const data = await res.json() as {
        content?: string;
        blockedReason?: 'binary' | 'large';
        sizeBytes?: number;
      };
      if (data.blockedReason === 'binary') {
        throw new Error(`바이너리 파일은 미리보기를 지원하지 않습니다. (${Math.round((data.sizeBytes ?? 0) / 1024)}KB)`);
      }
      if (data.blockedReason === 'large') {
        throw new Error(`큰 파일은 우측 모달에서 직접 열지 않습니다. (${Math.round((data.sizeBytes ?? 0) / 1024)}KB)`);
      }
      const { content } = data;
      setEditingFile({ path: item.path, name: item.name, content: content ?? '' });
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
      return;
    }
    // 파일 목록 직접 클릭: 히스토리 초기화
    fileNavHistoryRef.current = [item.path];
    fileNavIndexRef.current = 0;
    setFileNavState({ canGoBack: false, canGoForward: false });
  };

  const saveEditedFile = async () => {
    if (!editingFile) return;
    setIsEditorSaving(true);
    try {
      const res = await fetch('/api/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editingFile.path, content: editingFile.content })
      });
      if (!res.ok) throw new Error('저장에 실패했습니다.');
      fetchDirectory(currentPath);
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setIsEditorSaving(false);
    }
  };

  const renderEditor = () => {
    if (!editingFile) return null;

    return (
      <WorkspaceFileEditor
        fileName={editingFile.name}
        filePath={editingFile.path}
        content={editingFile.content}
        rawUrl={editingFile.rawUrl}
        isSaving={isEditorSaving}
        canGoBack={fileNavState.canGoBack}
        canGoForward={fileNavState.canGoForward}
        onChange={(nextContent) => {
          setEditingFile((current) => (current ? { ...current, content: nextContent } : null));
        }}
        onSave={() => void saveEditedFile()}
        onClose={() => setEditingFile(null)}
        onWikilinkClick={(wikilinkPath) => {
          void (async () => {
            const currentPath = editingFile.path;
            let resolvedPath: string | null = null;
            try {
              const resp = await fetch(
                `/api/fs/resolve-wikilink?path=${encodeURIComponent(wikilinkPath)}&from=${encodeURIComponent(currentPath)}`
              );
              const data = await resp.json() as { resolvedPath: string | null };
              resolvedPath = data.resolvedPath;
            } catch { /* fallback */ }
            const finalPath = resolvedPath ?? (wikilinkPath.includes('.') ? wikilinkPath : `${wikilinkPath}.md`);
            const name = finalPath.split('/').pop() ?? finalPath;
            try {
              const res = await fetch(`/api/fs/read?path=${encodeURIComponent(finalPath)}`);
              if (!res.ok) throw new Error('파일을 읽는 데 실패했습니다.');
              const data = await res.json() as { content?: string; blockedReason?: string };
              if (data.blockedReason === 'binary') {
                alert('바이너리 파일은 미리보기를 지원하지 않습니다.');
                return;
              }
              setEditingFile({ path: finalPath, name, content: data.content ?? '' });
              const history = fileNavHistoryRef.current.slice(0, fileNavIndexRef.current + 1);
              history.push(finalPath);
              fileNavHistoryRef.current = history;
              fileNavIndexRef.current = history.length - 1;
              setFileNavState({ canGoBack: fileNavIndexRef.current > 0, canGoForward: false });
            } catch (err) {
              alert(err instanceof Error ? err.message : '파일을 열 수 없습니다.');
            }
          })();
        }}
        onBack={() => {
          const idx = fileNavIndexRef.current - 1;
          if (idx < 0) return;
          const path = fileNavHistoryRef.current[idx];
          if (!path) return;
          fileNavIndexRef.current = idx;
          setFileNavState({
            canGoBack: idx > 0,
            canGoForward: idx < fileNavHistoryRef.current.length - 1,
          });
          void fetch(`/api/fs/read?path=${encodeURIComponent(path)}`).then(async (res) => {
            const data = await res.json() as { content?: string };
            const name = path.split('/').pop() ?? path;
            setEditingFile({ path, name, content: data.content ?? '' });
          });
        }}
        onForward={() => {
          const idx = fileNavIndexRef.current + 1;
          if (idx >= fileNavHistoryRef.current.length) return;
          const path = fileNavHistoryRef.current[idx];
          if (!path) return;
          fileNavIndexRef.current = idx;
          setFileNavState({
            canGoBack: idx > 0,
            canGoForward: idx < fileNavHistoryRef.current.length - 1,
          });
          void fetch(`/api/fs/read?path=${encodeURIComponent(path)}`).then(async (res) => {
            const data = await res.json() as { content?: string };
            const name = path.split('/').pop() ?? path;
            setEditingFile({ path, name, content: data.content ?? '' });
          });
        }}
      />
    );
  };

  return (
    <div className={styles.explorerWrapper}>
      <div className={`${styles.explorerLayout} ${isLargeScreen ? styles.layoutGrid : styles.layoutStack}`}>
        {/* Sidebar */}
        <Card className={styles.sidebarCard}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarTitle}>
              <FolderOpen size={20} style={{ color: 'var(--accent-sky)' }} />
              <h2 className="title-sm">탐색기</h2>
            </div>
            <div className={styles.sidebarTools}>
              <button onClick={() => setNewPathInput({ type: 'file', active: true })} className={styles.btnTool} title="새 파일"><FilePlus size={18} /></button>
              <button onClick={() => setNewPathInput({ type: 'folder', active: true })} className={styles.btnTool} title="새 폴더"><FolderPlus size={18} /></button>
            </div>
          </div>

          {newPathInput.active && (
            <div className={styles.newItemForm}>
              <input
                autoFocus
                className={styles.inputBase}
                placeholder={newPathInput.type === 'file' ? '파일명...' : '폴더명...'}
                value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <div className={styles.formBtns}>
                <button onClick={handleCreate} className={`btn-primary ${styles.xs}`}>생성</button>
                <button onClick={() => { setNewPathInput({ ...newPathInput, active: false }); setNewName(''); }} className={`btn-secondary ${styles.xs}`}>취소</button>
              </div>
            </div>
          )}

          <div className={styles.pathBar}>
            <span>{data?.currentPath || currentPath}</span>
          </div>

          <div className={styles.fileListContainer}>
            {loading ? (
              <div className={styles.loaderBox}><Loader2 size={32} className={styles.animateSpin} /></div>
            ) : error ? (
              <div className={styles.errorBox}>
                <AlertCircle size={24} />
                <span>{error}</span>
                <button onClick={() => fetchDirectory(currentPath)} className={`btn-secondary ${styles.xs}`}>재시도</button>
              </div>
            ) : (
              <div>
                {data?.parentPath && (
                  <div onClick={() => handleNavigate(data.parentPath!)} className={styles.fileItem}>
                    <div className={styles.itemMain}>
                      <ArrowUpCircle size={18} className={styles.muted} />
                      <span className={styles.itemNameText}>..</span>
                    </div>
                  </div>
                )}

                {data?.directories.map((item) => (
                  <div
                    key={item.path}
                    onClick={() => item.isDirectory ? handleNavigate(item.path) : handleEditFile(item)}
                    className={`${styles.fileItem} ${editingFile?.path === item.path ? styles.active : ''}`}
                  >
                    <div className={styles.itemMain}>
                      {item.isDirectory ? (
                        <Folder size={18} className={styles.accent} />
                      ) : (
                        <File size={18} className={styles.muted} />
                      )}
                      <span className={styles.itemNameText}>{item.name}</span>
                    </div>

                    <div className={styles.itemActions}>
                      <div className={styles.menuAnchor}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === item.path ? null : item.path); }}
                          className={`${styles.btnAction} ${activeMenu === item.path ? styles.active : ''}`}
                        >
                          <MoreVertical size={16} />
                        </button>

                        {activeMenu === item.path && (
                          <div ref={menuRef} className={styles.dropdownMenu}>
                            <button className={styles.menuBtn} onClick={(e) => { e.stopPropagation(); setActionModal({ type: 'rename', item, value: item.name }); setActiveMenu(null); }}>
                              <Pencil size={14} /> 이름 변경
                            </button>
                            <button className={styles.menuBtn} onClick={(e) => { e.stopPropagation(); setActionModal({ type: 'move', item, value: item.path }); setActiveMenu(null); }}>
                              <Move size={14} /> 이동
                            </button>
                            <div className={styles.menuDivider} />
                            <button className={`${styles.menuBtn} ${styles.menuBtnDanger}`} onClick={(e) => { e.stopPropagation(); handleDelete(item); }}>
                              <Trash2 size={14} /> 삭제
                            </button>
                          </div>
                        )}
                      </div>
                      {item.isDirectory && <ChevronRight size={14} className={styles.muted} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Main Content Area */}
        {isLargeScreen && (
          <Card className={styles.mainContentCard}>
            {editingFile ? (
              renderEditor()
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIconCircle}>
                  <File size={48} strokeWidth={1.5} />
                </div>
                <h3 className="title-sm">파일을 선택하세요</h3>
                <p className="text-muted">사이드바에서 파일을 선택하여 내용을 확인하고 편집할 수 있습니다.</p>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Action Modal (Rename/Move) */}
      {actionModal && (
        <div className={styles.modalOverlay}>
          <Card className={styles.actionModal}>
            <div className={styles.modalHeader}>
              <h3 className="title-sm">{actionModal.type === 'rename' ? '이름 변경' : '파일 이동'}</h3>
              <button onClick={() => setActionModal(null)} className={styles.btnClose}><X size={20} /></button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.modalLabel}>{actionModal.type === 'rename' ? '새 이름을 입력하세요:' : '이동할 전체 경로를 입력하세요:'}</p>
              <input
                autoFocus
                className={styles.inputBase}
                value={actionModal.value}
                onChange={(e) => setActionModal({ ...actionModal, value: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleFileAction()}
              />
            </div>
            <div className={styles.modalFooter}>
              <button onClick={() => setActionModal(null)} className="btn-secondary">취소</button>
              <button onClick={handleFileAction} className="btn-primary">확인</button>
            </div>
          </Card>
        </div>
      )}

      {/* Mobile Editor Modal */}
      {!isLargeScreen && editingFile && (
        <div className={styles.mobileModalOverlay}>
          <div className={styles.mobileModalContent}>
            {renderEditor()}
          </div>
        </div>
      )}
    </div>
  );
}
