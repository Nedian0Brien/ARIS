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

// Import Prism languages
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';

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
    return marked.parse(editingFile.content, { breaks: true, gfm: true }) as string;
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
      <div className="editor-root">
        <div className="editor-header">
          <div className="editor-title-box">
            <Code size={20} style={{ color: 'var(--accent-sky)', flexShrink: 0 }} />
            <div className="editor-title-text">
              <span className="file-name">{editingFile.name}</span>
              <span className="file-lang">{displayLanguageName(editingFile.name)}</span>
            </div>
          </div>
          <div className="editor-actions">
            {getLanguage(editingFile.name) === 'markdown' && (
              <button onClick={() => setIsPreview(!isPreview)} className="btn-secondary btn-sm">
                {isPreview ? <Edit3 size={16} /> : <Eye size={16} />}
                <span>{isPreview ? '편집' : '미리보기'}</span>
              </button>
            )}
            <button onClick={saveEditedFile} disabled={isEditorSaving} className="btn-primary btn-sm">
              {isEditorSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>저장</span>
            </button>
            <button onClick={() => setEditingFile(null)} className="btn-secondary btn-sm">
              <X size={16} /> <span>닫기</span>
            </button>
          </div>
        </div>
        
        <div className="editor-viewport">
          {!isPreview ? (
            <>
              <div ref={lineNumbersRef} className="line-numbers">
                {getLineNumbers()}
              </div>
              <div className="editor-container">
                <pre
                  ref={preRef}
                  className="editor-pre"
                  dangerouslySetInnerHTML={{ __html: highlightedContent + '\n' }}
                />
                <textarea
                  ref={textareaRef}
                  className="editor-textarea"
                  value={editingFile.content}
                  onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                  onKeyDown={handleEditorKeyDown}
                  onScroll={handleEditorScroll}
                  spellCheck={false}
                />
              </div>
            </>
          ) : (
            <div className="markdown-body" dangerouslySetInnerHTML={{ __html: markdownHtml }} />
          )}
        </div>
        
        <div className="editor-footer">
          <span>라인: {editingFile.content.split('\n').length}</span>
          <span>탭: 2 spaces</span>
        </div>
      </div>
    );
  };

  return (
    <div className="explorer-wrapper animate-in">
      <div className={`explorer-layout ${isLargeScreen ? 'layout-grid' : 'layout-stack'}`}>
        {/* Sidebar */}
        <Card className="sidebar-card">
          <div className="sidebar-header">
            <div className="sidebar-title">
              <FolderOpen size={20} style={{ color: 'var(--accent-sky)' }} />
              <h2 className="title-sm">탐색기</h2>
            </div>
            <div className="sidebar-tools">
              <button onClick={() => setNewPathInput({ type: 'file', active: true })} className="btn-tool" title="새 파일"><FilePlus size={18} /></button>
              <button onClick={() => setNewPathInput({ type: 'folder', active: true })} className="btn-tool" title="새 폴더"><FolderPlus size={18} /></button>
            </div>
          </div>

          {newPathInput.active && (
            <div className="new-item-form">
              <input 
                autoFocus className="input-base sm" 
                placeholder={newPathInput.type === 'file' ? '파일명...' : '폴더명...'}
                value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <div className="form-btns">
                <button onClick={handleCreate} className="btn-primary xs">생성</button>
                <button onClick={() => { setNewPathInput({ ...newPathInput, active: false }); setNewName(''); }} className="btn-secondary xs">취소</button>
              </div>
            </div>
          )}

          <div className="path-bar">
            <span className="path-text">{data?.currentPath || currentPath}</span>
          </div>

          <div className="file-list-container">
            {loading ? (
              <div className="loader-box"><Loader2 size={32} className="animate-spin" /></div>
            ) : error ? (
              <div className="error-box">
                <AlertCircle size={24} />
                <span>{error}</span>
                <button onClick={() => fetchDirectory(currentPath)} className="btn-secondary xs">재시도</button>
              </div>
            ) : (
              <div className="file-list">
                {data?.parentPath && (
                  <div onClick={() => handleNavigate(data.parentPath!)} className="file-item hover-bg">
                    <ArrowUpCircle size={18} className="item-icon muted" />
                    <span className="item-name-text">..</span>
                  </div>
                )}
                
                {data?.directories.map((item) => (
                  <div
                    key={item.path}
                    onClick={() => item.isDirectory ? handleNavigate(item.path) : handleEditFile(item)}
                    className={`file-item hover-bg group ${editingFile?.path === item.path ? 'active' : ''}`}
                  >
                    <div className="item-main">
                      {item.isDirectory ? (
                        <Folder size={18} className="item-icon accent" />
                      ) : (
                        <File size={18} className="item-icon muted" />
                      )}
                      <span className="item-name-text">{item.name}</span>
                    </div>
                    
                    <div className="item-actions">
                      <div className="menu-anchor">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === item.path ? null : item.path); }}
                          className={`btn-action ${activeMenu === item.path ? 'active' : ''}`}
                        >
                          <MoreVertical size={16} />
                        </button>
                        
                        {activeMenu === item.path && (
                          <div ref={menuRef} className="dropdown-menu">
                            <button onClick={(e) => { e.stopPropagation(); setActionModal({ type: 'rename', item, value: item.name }); setActiveMenu(null); }}>
                              <Pencil size={14} /> 이름 변경
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setActionModal({ type: 'move', item, value: item.path }); setActiveMenu(null); }}>
                              <Move size={14} /> 이동
                            </button>
                            <div className="menu-divider" />
                            <button className="danger" onClick={(e) => { e.stopPropagation(); handleDelete(item); }}>
                              <Trash2 size={14} /> 삭제
                            </button>
                          </div>
                        )}
                      </div>
                      {item.isDirectory && <ChevronRight size={14} className="muted" />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Main Content Area */}
        {isLargeScreen && (
          <Card className="main-content-card">
            {editingFile ? (
              renderEditor()
            ) : (
              <div className="empty-state">
                <div className="empty-icon-circle">
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
        <div className="modal-overlay">
          <Card className="action-modal">
            <div className="modal-header">
              <h3 className="title-sm">{actionModal.type === 'rename' ? '이름 변경' : '파일 이동'}</h3>
              <button onClick={() => setActionModal(null)} className="btn-close"><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p className="modal-label">{actionModal.type === 'rename' ? '새 이름을 입력하세요:' : '이동할 전체 경로를 입력하세요:'}</p>
              <input 
                autoFocus className="input-base"
                value={actionModal.value}
                onChange={(e) => setActionModal({ ...actionModal, value: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleFileAction()}
              />
            </div>
            <div className="modal-footer">
              <button onClick={() => setActionModal(null)} className="btn-secondary">취소</button>
              <button onClick={handleFileAction} className="btn-primary">확인</button>
            </div>
          </Card>
        </div>
      )}

      {/* Mobile Editor Modal */}
      {!isLargeScreen && editingFile && (
        <div className="mobile-modal-overlay">
          <div className="mobile-modal-content">
            {renderEditor()}
          </div>
        </div>
      )}

      <style jsx>{`
        .explorer-wrapper {
          padding: 1rem 0;
          width: 100%;
          height: calc(var(--app-vh, 100vh) - 140px);
          max-width: 100% !important;
          margin: 0;
        }
        .explorer-layout {
          display: grid;
          gap: 1rem;
          height: 100%;
          padding: 0 1rem;
        }
        .layout-grid {
          grid-template-columns: 280px 1fr;
        }
        .layout-stack {
          grid-template-columns: 1fr;
        }

        .sidebar-card {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background-color: var(--surface) !important;
        }
        .sidebar-header {
          padding: 1.25rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--line);
        }
        .sidebar-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .sidebar-tools {
          display: flex;
          gap: 0.25rem;
        }
        .btn-tool {
          padding: 0.4rem;
          border-radius: 6px;
          color: var(--text-muted);
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-tool:hover {
          background-color: var(--surface-subtle);
          color: var(--text);
        }

        .path-bar {
          padding: 0.5rem 1rem;
          background-color: var(--bg);
          font-family: var(--font-mono);
          font-size: 0.7rem;
          border-bottom: 1px solid var(--line);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-muted);
        }

        .file-list-container {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem;
        }
        .file-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.1s ease;
          margin-bottom: 2px;
        }
        .file-item:hover { background-color: var(--surface-subtle); }
        .file-item.active {
          background-color: var(--accent-sky-bg);
          color: var(--accent-sky);
        }
        .item-main {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          min-width: 0;
          flex: 1;
        }
        .item-icon.accent { color: var(--accent-sky); }
        .item-icon.muted { color: var(--text-muted); }
        .item-name-text {
          font-size: 0.85rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .active .item-name-text { font-weight: 600; }

        .item-actions {
          display: flex;
          align-items: center;
          gap: 0.2rem;
          opacity: 0;
        }
        .file-item:hover .item-actions, .btn-action.active { opacity: 1; }
        
        .menu-anchor { position: relative; }
        .btn-action {
          padding: 0.25rem;
          border-radius: 4px;
          color: var(--text-muted);
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .btn-action:hover, .btn-action.active {
          background-color: var(--line);
          color: var(--text);
        }

        .dropdown-menu {
          position: absolute;
          top: 100%;
          right: 0;
          width: 140px;
          background-color: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          box-shadow: var(--shadow-lg);
          z-index: 100;
          padding: 0.4rem;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .dropdown-menu button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.6rem;
          font-size: 0.8rem;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 4px;
          color: var(--text);
          text-align: left;
        }
        .dropdown-menu button:hover { background-color: var(--surface-subtle); }
        .dropdown-menu button.danger { color: var(--accent-red); }
        .dropdown-menu button.danger:hover { background-color: var(--accent-red-bg); }
        .menu-divider { height: 1px; background-color: var(--line); margin: 0.2rem 0; }

        .main-content-card {
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: 0;
          background-color: var(--surface) !important;
        }

        /* Editor Styles */
        .editor-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
        }
        .editor-header {
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid var(--line);
          background-color: var(--surface-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .editor-title-box { display: flex; align-items: center; gap: 0.75rem; min-width: 0; flex: 1; }
        .editor-title-text { display: flex; flex-direction: column; min-width: 0; }
        .file-name { font-weight: 600; font-size: 0.95rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .file-lang { font-size: 0.7rem; color: var(--text-muted); }
        .editor-actions { display: flex; gap: 0.5rem; }
        .btn-sm { padding: 0.4rem 0.8rem; font-size: 0.8rem; display: flex; align-items: center; gap: 0.4rem; border-radius: 6px; }
        .xs { padding: 0.25rem 0.5rem; font-size: 0.75rem; border-radius: 4px; }

        .editor-viewport {
          flex: 1;
          display: flex;
          overflow: hidden;
          background-color: var(--bg);
          position: relative;
        }
        .line-numbers {
          width: 3.5rem; padding: 1.5rem 0.5rem;
          background-color: var(--surface-subtle); border-right: 1px solid var(--line);
          color: var(--text-muted); font-family: var(--font-mono); font-size: 0.85rem;
          line-height: 1.5; text-align: right; user-select: none; overflow: hidden; white-space: pre;
        }
        .editor-container { position: relative; flex: 1; overflow: hidden; }
        .editor-pre {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          margin: 0; padding: 1.5rem; font-family: var(--font-mono); font-size: 0.85rem;
          line-height: 1.5; pointer-events: none; white-space: pre; overflow: hidden;
          background: transparent; color: var(--text); tab-size: 2; z-index: 1;
        }
        .editor-textarea {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          border: none; padding: 1.5rem; font-family: var(--font-mono); font-size: 0.85rem;
          line-height: 1.5; background: transparent; color: transparent;
          caret-color: var(--text); resize: none; outline: none; white-space: pre;
          overflow: auto; tab-size: 2; z-index: 2;
        }
        .editor-footer {
          padding: 0.4rem 1rem; border-top: 1px solid var(--line);
          font-size: 0.7rem; color: var(--text-muted); display: flex; justify-content: flex-end; gap: 1rem;
          background-color: var(--surface-subtle);
        }

        .markdown-body { flex: 1; padding: 2rem; overflow: auto; background-color: var(--bg); color: var(--text); line-height: 1.6; }

        .empty-state {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 3rem; text-align: center; color: var(--text-muted); background-color: var(--bg);
        }
        .empty-icon-circle {
          padding: 1.5rem; border-radius: 50%; background-color: var(--surface);
          box-shadow: var(--shadow-md); color: var(--accent-sky); margin-bottom: 1.5rem;
        }

        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 2000;
        }
        .action-modal { width: 100%; max-width: 400px; padding: 0 !important; }
        .modal-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; }
        .modal-body { padding: 1.25rem; }
        .modal-label { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem; }
        .modal-footer { padding: 1rem 1.25rem; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 0.5rem; }
        .btn-close { background: transparent; border: none; color: var(--text-muted); cursor: pointer; }

        .mobile-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
        .mobile-modal-content { width: 100%; height: 100%; max-height: 90vh; }

        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
