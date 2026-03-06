'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Folder, FolderOpen, File, ChevronRight, ArrowUpCircle, 
  Loader2, FolderPlus, FilePlus, Trash2, X, Save, AlertCircle,
  Code, Eye, Edit3, Monitor, Tablet, Smartphone
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

  // Editor States
  const [editingFile, setEditingFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [isEditorSaving, setIsEditorSaving] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [newPathInput, setNewPathInput] = useState<{ type: 'file' | 'folder'; active: boolean }>({ type: 'file', active: false });
  const [newName, setNewName] = useState('');

  // Refs for IDE features
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

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

  const handleDelete = async (e: React.MouseEvent, item: FileItem) => {
    e.stopPropagation();
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

  const handleEditFile = async (item: FileItem) => {
    if (item.isDirectory) return;
    
    try {
      const res = await fetch(`/api/fs/read?path=${encodeURIComponent(item.path)}`);
      if (!res.ok) throw new Error('파일을 읽는 데 실패했습니다.');
      const { content } = await res.json();
      setEditingFile({ path: item.path, name: item.name, content });
      setIsPreview(false); // Reset preview mode when opening new file
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
      // Keep editor open after saving
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
      setTimeout(() => { textarea.selectionStart = textarea.selectionEnd = selectionStart + 2; }, 0);
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
        setTimeout(() => { textarea.selectionStart = textarea.selectionEnd = selectionStart + 1 + indentation.length + 2; }, 0);
        return;
      }

      if (indentation) {
        e.preventDefault();
        const newValue = value.substring(0, selectionStart) + '\n' + indentation + value.substring(selectionEnd);
        setEditingFile(prev => prev ? { ...prev, content: newValue } : null);
        setTimeout(() => { textarea.selectionStart = textarea.selectionEnd = selectionStart + 1 + indentation.length; }, 0);
      }
    }

    const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')', '"': '"', "'": "'", '`': '`' };
    if (pairs[e.key]) {
      const newValue = value.substring(0, selectionStart) + e.key + pairs[e.key] + value.substring(selectionEnd);
      e.preventDefault();
      setEditingFile(prev => prev ? { ...prev, content: newValue } : null);
      setTimeout(() => { textarea.selectionStart = textarea.selectionEnd = selectionStart + 1; }, 0);
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

  // Render Editor Fragment (Reused in Modal and Inline)
  const renderEditor = () => {
    if (!editingFile) return null;
    
    return (
      <div style={{
        backgroundColor: 'var(--surface)', borderRadius: isLargeScreen ? '0' : '12px',
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', border: isLargeScreen ? 'none' : '1px solid var(--line)',
        boxShadow: isLargeScreen ? 'none' : '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ 
          padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: 'var(--surface-subtle)',
          flexWrap: 'wrap', gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
            <Code size={20} style={{ color: 'var(--accent-sky)', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {editingFile.name}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{displayLanguageName(editingFile.name)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            {getLanguage(editingFile.name) === 'markdown' && (
              <button 
                onClick={() => setIsPreview(!isPreview)}
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
              >
                {isPreview ? <Edit3 size={16} /> : <Eye size={16} />}
                {isPreview ? '편집' : '미리보기'}
              </button>
            )}
            <button 
              onClick={saveEditedFile} 
              disabled={isEditorSaving}
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem', fontSize: '0.85rem' }}
            >
              {isEditorSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              저장
            </button>
            <button 
              onClick={() => setEditingFile(null)} 
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem', fontSize: '0.85rem' }}
            >
              <X size={16} /> 닫기
            </button>
          </div>
        </div>
        
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          overflow: 'hidden',
          backgroundColor: 'var(--bg)',
          position: 'relative'
        }}>
          {!isPreview ? (
            <>
              <div 
                ref={lineNumbersRef}
                style={{
                  width: '3.5rem', padding: '1.5rem 0.5rem',
                  backgroundColor: 'var(--surface-subtle)', borderRight: '1px solid var(--line)',
                  color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.85rem',
                  lineHeight: '1.5', textAlign: 'right', userSelect: 'none', overflow: 'hidden', whiteSpace: 'pre'
                }}
              >
                {getLineNumbers()}
              </div>

              <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                <pre
                  ref={preRef}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    margin: 0, padding: '1.5rem', fontFamily: 'monospace', fontSize: '0.85rem',
                    lineHeight: '1.5', pointerEvents: 'none', whiteSpace: 'pre', overflow: 'hidden',
                    backgroundColor: 'transparent', color: 'var(--text)', tabSize: 2, zIndex: 1
                  }}
                  dangerouslySetInnerHTML={{ __html: highlightedContent + '\n' }}
                />
                <textarea
                  ref={textareaRef}
                  value={editingFile.content}
                  onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                  onKeyDown={handleEditorKeyDown}
                  onScroll={handleEditorScroll}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    border: 'none', padding: '1.5rem', fontFamily: 'monospace', fontSize: '0.85rem',
                    lineHeight: '1.5', backgroundColor: 'transparent', color: 'transparent',
                    caretColor: 'var(--text)', resize: 'none', outline: 'none', whiteSpace: 'pre',
                    overflow: 'auto', tabSize: 2, zIndex: 2
                  }}
                  spellCheck={false}
                />
              </div>
            </>
          ) : (
            <div 
              className="markdown-body"
              style={{
                flex: 1, padding: '2rem', overflow: 'auto',
                backgroundColor: 'var(--bg)', color: 'var(--text)', lineHeight: '1.6'
              }}
              dangerouslySetInnerHTML={{ __html: markdownHtml }}
            />
          )}
        </div>
        
        <div style={{ 
          padding: '0.4rem 1rem', backgroundColor: 'var(--surface-subtle)', borderTop: '1px solid var(--line)',
          fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'flex-end', gap: '1rem'
        }}>
          <span>라인: {editingFile.content.split('\n').length}</span>
          <span>탭: 2 spaces</span>
        </div>
      </div>
    );
  };

  return (
    <div className="explorer-container animate-in">
      <div className={`explorer-layout ${isLargeScreen ? 'layout-grid' : 'layout-stack'}`}>
        {/* Sidebar / List View */}
        <Card className="explorer-sidebar" style={{ 
          padding: '1.5rem', 
          height: isLargeScreen ? 'calc(100vh - 180px)' : 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FolderOpen size={20} style={{ color: 'var(--accent-sky)' }} />
              <h2 className="title-sm" style={{ margin: 0 }}>탐색기</h2>
            </div>
            
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button 
                onClick={() => setNewPathInput({ type: 'file', active: true })}
                className="btn-icon-subtle" title="새 파일"
              >
                <FilePlus size={18} />
              </button>
              <button 
                onClick={() => setNewPathInput({ type: 'folder', active: true })}
                className="btn-icon-subtle" title="새 폴더"
              >
                <FolderPlus size={18} />
              </button>
            </div>
          </div>

          {newPathInput.active && (
            <div style={{ 
              display: 'flex', gap: '0.5rem', marginBottom: '1rem', 
              padding: '0.75rem', backgroundColor: 'var(--surface-subtle)', borderRadius: '8px',
              border: '1px solid var(--line)'
            }}>
              <input 
                autoFocus className="input-base" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                placeholder={newPathInput.type === 'file' ? '파일명...' : '폴더명...'}
                value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <button onClick={handleCreate} className="btn-primary" style={{ padding: '0 0.5rem', fontSize: '0.75rem' }}>생성</button>
              <button onClick={() => { setNewPathInput({ ...newPathInput, active: false }); setNewName(''); }} className="btn-secondary" style={{ padding: '0 0.5rem', fontSize: '0.75rem' }}>취소</button>
            </div>
          )}

          <div className="breadcrumb-bar">
            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>위치:</span>
            <span className="breadcrumb-path">{data?.currentPath || currentPath}</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                <Loader2 size={32} className="animate-spin" />
              </div>
            ) : error ? (
              <div className="error-box">
                <AlertCircle size={24} />
                <div style={{ fontSize: '0.85rem' }}>{error}</div>
                <button onClick={() => fetchDirectory(currentPath)} className="btn-secondary" style={{ fontSize: '0.75rem' }}>재시도</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                {data?.parentPath && (
                  <div onClick={() => handleNavigate(data.parentPath!)} className="file-item hover-bg">
                    <ArrowUpCircle size={18} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>..</span>
                  </div>
                )}
                
                {data?.directories.length === 0 && !data?.parentPath && (
                  <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    비어 있습니다.
                  </div>
                )}

                {data?.directories.map((item) => (
                  <div
                    key={item.path}
                    onClick={() => item.isDirectory ? handleNavigate(item.path) : handleEditFile(item)}
                    className={`file-item hover-bg group ${editingFile?.path === item.path ? 'active-item' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                      {item.isDirectory ? (
                        <Folder size={18} style={{ color: 'var(--accent-sky)', flexShrink: 0 }} />
                      ) : (
                        <File size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      )}
                      <span className="file-name-text">{item.name}</span>
                    </div>
                    
                    <div className="item-actions">
                      <button onClick={(e) => handleDelete(e, item)} className="btn-delete-item">
                        <Trash2 size={14} />
                      </button>
                      {item.isDirectory && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Main Content Area (Desktop/Tablet) */}
        {isLargeScreen && (
          <Card className="explorer-main" style={{ 
            height: 'calc(100vh - 180px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: editingFile ? 'stretch' : 'center',
            alignItems: editingFile ? 'stretch' : 'center',
            padding: editingFile ? '0' : '2rem',
            overflow: 'hidden',
            backgroundColor: editingFile ? 'transparent' : 'var(--surface-subtle)'
          }}>
            {editingFile ? (
              renderEditor()
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                  <div style={{ 
                    padding: '1.5rem', borderRadius: '50%', backgroundColor: 'var(--surface)',
                    boxShadow: 'var(--shadow-md)', color: 'var(--accent-sky)'
                  }}>
                    <File size={48} strokeWidth={1.5} />
                  </div>
                </div>
                <h3 className="title-sm" style={{ marginBottom: '0.5rem' }}>파일을 선택하세요</h3>
                <p style={{ fontSize: '0.85rem', maxWidth: '240px', margin: '0 auto' }}>
                  사이드바에서 파일을 선택하여 내용을 확인하고 편집할 수 있습니다.
                </p>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Mobile Editor Modal */}
      {!isLargeScreen && editingFile && (
        <div className="mobile-modal-overlay">
          <div className="mobile-modal-content">
            {renderEditor()}
          </div>
        </div>
      )}

      <style jsx>{`
        .explorer-container {
          padding: 1.5rem 0;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
        }
        .explorer-layout {
          display: grid;
          gap: 1.25rem;
        }
        .layout-grid {
          grid-template-columns: 280px 1fr;
        }
        @media (min-width: 1024px) {
          .layout-grid {
            grid-template-columns: 320px 1fr;
          }
        }
        .layout-stack {
          grid-template-columns: 1fr;
        }

        .breadcrumb-bar {
          padding: 0.6rem 0.8rem;
          background-color: var(--bg);
          border-radius: 6px;
          margin-bottom: 1rem;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border: 1px solid var(--line);
          overflow: hidden;
        }
        .breadcrumb-path {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text);
        }

        .file-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.6rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          min-width: 0;
        }
        .file-item:hover {
          background-color: var(--surface-subtle);
        }
        .active-item {
          background-color: var(--accent-sky-bg) !important;
          border-left: 3px solid var(--accent-sky);
          border-radius: 0 6px 6px 0;
        }
        .file-name-text {
          font-size: 0.85rem;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .active-item .file-name-text {
          color: var(--accent-sky);
          font-weight: 600;
        }

        .item-actions {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-shrink: 0;
          opacity: 0.4;
          transition: opacity 0.2s;
        }
        .file-item:hover .item-actions {
          opacity: 1;
        }
        .btn-delete-item {
          padding: 0.3rem;
          border-radius: 4px;
          color: var(--text-muted);
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-delete-item:hover {
          color: var(--accent-red);
          background-color: var(--accent-red-bg);
        }

        .btn-icon-subtle {
          padding: 0.4rem;
          border-radius: 6px;
          color: var(--text-muted);
          background: transparent;
          border: 1px solid transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .btn-icon-subtle:hover {
          background-color: var(--surface-subtle);
          border-color: var(--line);
          color: var(--text);
        }

        .error-box {
          color: var(--accent-red);
          padding: 1.5rem;
          text-align: center;
          background-color: var(--accent-red-bg);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          margin: 1rem 0;
        }

        .mobile-modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }
        .mobile-modal-content {
          width: 100%;
          height: 100%;
          max-height: 90vh;
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* Markdown Styling */
        .markdown-body :global(h1), .markdown-body :global(h2) { border-bottom: 1px solid var(--line); padding-bottom: 0.3em; margin-top: 1.5em; margin-bottom: 1rem; }
        .markdown-body :global(code) { background-color: var(--surface-subtle); padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; }
        .markdown-body :global(pre) { background-color: var(--surface-subtle); padding: 1rem; border-radius: 6px; overflow: auto; }
        .markdown-body :global(blockquote) { border-left: 4px solid var(--line); padding-left: 1rem; color: var(--text-muted); margin: 1rem 0; }
        .markdown-body :global(table) { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        .markdown-body :global(th), .markdown-body :global(td) { border: 1px solid var(--line); padding: 0.5rem; }

        /* Prism Theme Customization */
        :global(.token.comment) { color: #6a737d; font-style: italic; }
        :global(.token.punctuation) { color: var(--text-muted); }
        :global(.token.keyword) { color: var(--accent-violet); }
        :global(.token.string) { color: #9ece6a; }
        :global(.token.function) { color: #7aa2f7; }
        :global(.token.operator) { color: var(--accent-sky); }
      `}</style>
    </div>
  );
}
