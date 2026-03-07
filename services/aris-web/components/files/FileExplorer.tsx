'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Folder, FolderOpen, File, ChevronRight, ArrowUpCircle,
  Loader2, FolderPlus, FilePlus, Trash2, X, Save, AlertCircle,
  Code, Eye, Edit3, MoreVertical, Pencil, Move
} from 'lucide-react';
import { Card } from '@/components/ui';
import Prism from 'prismjs';
import { marked } from 'marked';
import styles from './FileExplorer.module.css';

// Import Prism languages
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';

// Prism theme
import 'prismjs/themes/prism.css';

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
  const [editingFile, setEditingFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [isEditorSaving, setIsEditorSaving] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [newPathInput, setNewPathInput] = useState<{ type: 'file' | 'folder'; active: boolean }>({ type: 'file', active: false });
  const [newName, setNewName] = useState('');

  // Context Menu State
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ type: 'rename' | 'move'; item: FileItem; value: string } | null>(null);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
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

    try {
      const res = await fetch(`/api/fs/read?path=${encodeURIComponent(item.path)}`);
      if (!res.ok) throw new Error('파일을 읽는 데 실패했습니다.');
      const { content } = await res.json();
      setEditingFile({ path: item.path, name: item.name, content });
      setIsPreview(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    }
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

  // IDE Editor Handlers
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const { selectionStart, selectionEnd, value } = textarea;

    if (e.key === 'Tab') {
      e.preventDefault();
      const newValue = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd);
      setEditingFile(prev => prev ? { ...prev, content: newValue } : null);
      setTimeout(() => { if (textarea) { textarea.selectionStart = textarea.selectionEnd = selectionStart + 2; } }, 0);
    }

    if (e.key === 'Enter') {
      const lines = value.substring(0, selectionStart).split('\n');
      const currentLine = lines[lines.length - 1];
      const match = currentLine.match(/^\s*/);
      const indentation = match ? match[0] : '';

      const charBefore = value[selectionStart - 1];
      const charAfter = value[selectionStart];
      if ((charBefore === '{' && charAfter === '}') || (charBefore === '[' && charAfter === ']') || (charBefore === '(' && charAfter === ')')) {
        e.preventDefault();
        const newValue = value.substring(0, selectionStart) + '\n' + indentation + '  \n' + indentation + value.substring(selectionEnd);
        setEditingFile(prev => prev ? { ...prev, content: newValue } : null);
        setTimeout(() => { if (textarea) { textarea.selectionStart = textarea.selectionEnd = selectionStart + 1 + indentation.length + 2; } }, 0);
        return;
      }

      if (indentation) {
        e.preventDefault();
        const newValue = value.substring(0, selectionStart) + '\n' + indentation + value.substring(selectionEnd);
        setEditingFile(prev => prev ? { ...prev, content: newValue } : null);
        setTimeout(() => { if (textarea) { textarea.selectionStart = textarea.selectionEnd = selectionStart + 1 + indentation.length; } }, 0);
      }
    }

    const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')', '"': '"', "'": "'", '`': '`' };
    if (pairs[e.key]) {
      const newValue = value.substring(0, selectionStart) + e.key + pairs[e.key] + value.substring(selectionEnd);
      e.preventDefault();
      setEditingFile(prev => prev ? { ...prev, content: newValue } : null);
      setTimeout(() => { if (textarea) { textarea.selectionStart = textarea.selectionEnd = selectionStart + 1; } }, 0);
    }
  };

  const handleEditorScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const getLineNumbers = () => {
    if (!editingFile) return null;
    const lines = editingFile.content.split('\n').length;
    return Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  };

  const getLanguage = useCallback((fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts': case 'tsx': return 'typescript';
      case 'js': case 'jsx': return 'javascript';
      case 'css': return 'css';
      case 'html': return 'markup';
      case 'json': return 'json';
      case 'md': return 'markdown';
      case 'py': return 'python';
      case 'sh': return 'bash';
      default: return 'text';
    }
  }, []);

  const highlightedContent = useMemo(() => {
    if (!editingFile) return '';
    const lang = getLanguage(editingFile.name);
    if (lang === 'text' || !Prism.languages[lang]) {
      return editingFile.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    return Prism.highlight(editingFile.content, Prism.languages[lang], lang);
  }, [editingFile, getLanguage]);

  const markdownHtml = useMemo(() => {
    if (!editingFile || !isPreview) return '';
    const renderer = new marked.Renderer();
    renderer.code = ({ text, lang }) => {
      const validLang = lang && Prism.languages[lang] ? lang : null;
      const highlighted = validLang
        ? Prism.highlight(text, Prism.languages[validLang], validLang)
        : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const langBadge = validLang
        ? `<span class="md-code-lang">${validLang}</span>`
        : '';
      return `<div class="md-code-block"><div class="md-code-header">${langBadge}</div><pre class="md-code-pre"><code>${highlighted}</code></pre></div>`;
    };
    return marked.parse(editingFile.content, { breaks: true, gfm: true, renderer }) as string;
  }, [editingFile, isPreview]);

  const displayLanguageName = (fileName: string) => {
    const lang = getLanguage(fileName);
    const map: Record<string, string> = {
      'typescript': 'TypeScript', 'javascript': 'JavaScript', 'css': 'CSS', 'markup': 'HTML',
      'json': 'JSON', 'markdown': 'Markdown', 'python': 'Python', 'bash': 'Shell', 'text': 'Text'
    };
    return map[lang] || 'Text';
  };

  const renderEditor = () => {
    if (!editingFile) return null;

    return (
      <div className={styles.editorRoot}>
        <div className={styles.editorHeader}>
          <div className={styles.editorTitleBox}>
            <Code size={20} style={{ color: 'var(--accent-sky)', flexShrink: 0 }} />
            <div className={styles.editorTitleText}>
              <span className={styles.fileName}>{editingFile.name}</span>
              <span className={styles.fileLang}>{displayLanguageName(editingFile.name)}</span>
            </div>
          </div>
          <div className={styles.editorActions}>
            {getLanguage(editingFile.name) === 'markdown' && (
              <button onClick={() => setIsPreview(!isPreview)} className={`btn-secondary ${styles.btnSm}`}>
                {isPreview ? <Edit3 size={16} /> : <Eye size={16} />}
                <span>{isPreview ? '편집' : '미리보기'}</span>
              </button>
            )}
            <button onClick={saveEditedFile} disabled={isEditorSaving} className={`btn-primary ${styles.btnSm}`}>
              {isEditorSaving ? <Loader2 size={16} className={styles.animateSpin} /> : <Save size={16} />}
              <span>저장</span>
            </button>
            <button onClick={() => setEditingFile(null)} className={`btn-secondary ${styles.btnSm}`}>
              <X size={16} /> <span>닫기</span>
            </button>
          </div>
        </div>

        <div className={styles.editorViewport}>
          {!isPreview ? (
            <>
              <div ref={lineNumbersRef} className={styles.lineNumbers}>
                {getLineNumbers()}
              </div>
              <div className={styles.editorContainer}>
                <pre
                  ref={preRef}
                  className={styles.editorPre}
                  dangerouslySetInnerHTML={{ __html: highlightedContent + '\n' }}
                />
                <textarea
                  ref={textareaRef}
                  className={styles.editorTextarea}
                  value={editingFile.content}
                  onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
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
          <span>라인: {editingFile.content.split('\n').length}</span>
          <span>탭: 2 spaces</span>
        </div>
      </div>
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
