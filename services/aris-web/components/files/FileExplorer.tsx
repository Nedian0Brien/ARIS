'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Folder, FolderOpen, File, ChevronRight, ArrowUpCircle, 
  Loader2, FolderPlus, FilePlus, Trash2, X, Save, AlertCircle,
  Code, Eye, Edit3
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

  // Editor/Modal States
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
      setEditingFile(null);
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

    // 1. Tab key support (Insert 2 spaces)
    if (e.key === 'Tab') {
      e.preventDefault();
      const newValue = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd);
      setEditingFile(prev => prev ? { ...prev, content: newValue } : null);
      
      // Reset cursor position (need to wait for React state update)
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + 2;
      }, 0);
    }

    // 2. Auto-indentation on Enter
    if (e.key === 'Enter') {
      const lines = value.substring(0, selectionStart).split('\n');
      const currentLine = lines[lines.length - 1];
      const match = currentLine.match(/^\s*/);
      const indentation = match ? match[0] : '';
      
      // If we are between { and }, or [ and ], or ( and ), add extra level
      const charBefore = value[selectionStart - 1];
      const charAfter = value[selectionStart];
      let extraIndentation = '';
      if ((charBefore === '{' && charAfter === '}') || (charBefore === '[' && charAfter === ']') || (charBefore === '(' && charAfter === ')')) {
        extraIndentation = '  ';
        e.preventDefault();
        const newValue = value.substring(0, selectionStart) + '\n' + indentation + extraIndentation + '\n' + indentation + value.substring(selectionEnd);
        setEditingFile(prev => prev ? { ...prev, content: newValue } : null);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = selectionStart + 1 + indentation.length + extraIndentation.length;
        }, 0);
        return;
      }

      if (indentation) {
        e.preventDefault();
        const newValue = value.substring(0, selectionStart) + '\n' + indentation + value.substring(selectionEnd);
        setEditingFile(prev => prev ? { ...prev, content: newValue } : null);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = selectionStart + 1 + indentation.length;
        }, 0);
      }
    }

    // 3. Auto-close brackets and quotes
    const pairs: Record<string, string> = {
      '{': '}',
      '[': ']',
      '(': ')',
      '"': '"',
      "'": "'",
      '`': '`'
    };

    if (pairs[e.key]) {
      // If it's a quote, only auto-close if not already inside one or if it's the start
      const newValue = value.substring(0, selectionStart) + e.key + pairs[e.key] + value.substring(selectionEnd);
      e.preventDefault();
      setEditingFile(prev => prev ? { ...prev, content: newValue } : null);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + 1;
      }, 0);
    }
  };

  const handleEditorScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
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
      return editingFile.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
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
      'typescript': 'TypeScript',
      'javascript': 'JavaScript',
      'css': 'CSS',
      'markup': 'HTML',
      'json': 'JSON',
      'markdown': 'Markdown',
      'python': 'Python',
      'bash': 'Shell',
      'text': 'Text'
    };
    return map[lang] || 'Text';
  };

  return (
    <div className="animate-in" style={{ padding: '2rem 0', maxWidth: '1000px', margin: '0 auto', width: '100%', overflowX: 'hidden' }}>
      <Card style={{ padding: '2rem', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderOpen size={24} style={{ color: 'var(--accent-sky)' }} />
            <h2 className="title-md" style={{ margin: 0 }}>파일 탐색기</h2>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={() => setNewPathInput({ type: 'file', active: true })}
              className="btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            >
              <FilePlus size={16} /> 새 파일
            </button>
            <button 
              onClick={() => setNewPathInput({ type: 'folder', active: true })}
              className="btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            >
              <FolderPlus size={16} /> 새 폴더
            </button>
          </div>
        </div>

        {/* Create Input Area */}
        {newPathInput.active && (
          <div style={{ 
            display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', 
            padding: '1rem', backgroundColor: 'var(--surface-subtle)', borderRadius: '8px',
            border: '1px solid var(--line)'
          }}>
            <input 
              autoFocus
              className="input-base"
              placeholder={`${newPathInput.type === 'file' ? '파일명' : '폴더명'}을 입력하세요...`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              style={{ flex: 1 }}
            />
            <button onClick={handleCreate} className="btn-primary" style={{ padding: '0 1rem' }}>생성</button>
            <button onClick={() => { setNewPathInput({ ...newPathInput, active: false }); setNewName(''); }} className="btn-secondary" style={{ padding: '0 1rem' }}>취소</button>
          </div>
        )}

        <div style={{
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--bg)',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          border: '1px solid var(--line)',
          overflow: 'hidden'
        }}>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>위치:</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data?.currentPath || currentPath}
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0', color: 'var(--text-muted)' }}>
            <Loader2 size={40} className="animate-spin" />
          </div>
        ) : error ? (
          <div style={{ 
            color: 'var(--accent-red)', padding: '2rem', textAlign: 'center', 
            backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: '12px',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem'
          }}>
            <AlertCircle size={32} />
            <div>{error}</div>
            <button onClick={() => fetchDirectory(currentPath)} className="btn-secondary" style={{ fontSize: '0.8rem' }}>다시 시도</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {data?.parentPath && (
              <div 
                onClick={() => handleNavigate(data.parentPath!)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  backgroundColor: 'transparent'
                }}
                className="hover-bg"
              >
                <ArrowUpCircle size={20} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontWeight: 500 }}>.. (상위 폴더)</span>
              </div>
            )}
            
            {data?.directories.length === 0 && !data?.parentPath && (
              <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                워크스페이스가 비어 있습니다. 새로운 파일을 만들어보세요.
              </div>
            )}

            {data?.directories.map((item) => (
              <div
                key={item.path}
                onClick={() => item.isDirectory ? handleNavigate(item.path) : handleEditFile(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  backgroundColor: 'transparent',
                  minWidth: 0
                }}
                className="hover-bg group"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                  {item.isDirectory ? (
                    <Folder size={20} style={{ color: 'var(--accent-sky)', flexShrink: 0 }} />
                  ) : (
                    <File size={20} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  )}
                  <span style={{ 
                    fontWeight: item.isDirectory ? 500 : 400,
                    color: item.isDirectory ? 'var(--text)' : 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {item.name}
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  <button 
                    onClick={(e) => handleDelete(e, item)}
                    style={{ 
                      padding: '0.4rem', borderRadius: '4px', color: 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'transparent', border: 'none', cursor: 'pointer'
                    }}
                    className="hover-danger"
                  >
                    <Trash2 size={16} />
                  </button>
                  {item.isDirectory && (
                    <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Editor Modal */}
      {editingFile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'var(--surface)', borderRadius: '12px',
            width: '100%', maxWidth: '1100px', height: '100%', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            overflow: 'hidden', border: '1px solid var(--line)'
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
                  {/* Line Numbers */}
                  <div 
                    ref={lineNumbersRef}
                    style={{
                      width: '3.5rem',
                      padding: '1.5rem 0.5rem',
                      backgroundColor: 'var(--surface-subtle)',
                      borderRight: '1px solid var(--line)',
                      color: 'var(--text-muted)',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      lineHeight: '1.5',
                      textAlign: 'right',
                      userSelect: 'none',
                      overflow: 'hidden',
                      whiteSpace: 'pre'
                    }}
                  >
                    {getLineNumbers()}
                  </div>

                  {/* Layered Editor Container */}
                  <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                    {/* Syntax Highlighted Layer */}
                    <pre
                      ref={preRef}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        margin: 0,
                        padding: '1.5rem',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        lineHeight: '1.5',
                        pointerEvents: 'none',
                        whiteSpace: 'pre',
                        overflow: 'hidden',
                        backgroundColor: 'transparent',
                        color: 'var(--text)',
                        tabSize: 2,
                        zIndex: 1
                      }}
                      dangerouslySetInnerHTML={{ __html: highlightedContent + '\n' }}
                    />

                    {/* Transparent Textarea Layer */}
                    <textarea
                      ref={textareaRef}
                      value={editingFile.content}
                      onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                      onKeyDown={handleEditorKeyDown}
                      onScroll={handleEditorScroll}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        padding: '1.5rem',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        lineHeight: '1.5',
                        backgroundColor: 'transparent',
                        color: 'transparent',
                        caretColor: 'var(--text)',
                        resize: 'none',
                        outline: 'none',
                        whiteSpace: 'pre',
                        overflow: 'auto',
                        tabSize: 2,
                        zIndex: 2
                      }}
                      spellCheck={false}
                    />
                  </div>
                </>
              ) : (
                <div 
                  className="markdown-body"
                  style={{
                    flex: 1,
                    padding: '2rem',
                    overflow: 'auto',
                    backgroundColor: 'var(--bg)',
                    color: 'var(--text)',
                    lineHeight: '1.6'
                  }}
                  dangerouslySetInnerHTML={{ __html: markdownHtml }}
                />
              )}
            </div>
            
            <div style={{ 
              padding: '0.4rem 1rem', 
              backgroundColor: 'var(--surface-subtle)', 
              borderTop: '1px solid var(--line)',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '1rem'
            }}>
              <span>라인: {editingFile.content.split('\n').length}</span>
              <span>탭: 2 spaces</span>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .hover-bg:hover {
          background-color: var(--surface-subtle) !important;
        }
        .hover-danger:hover {
          color: var(--accent-red) !important;
          background-color: rgba(239, 68, 68, 0.1) !important;
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        textarea::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        textarea::-webkit-scrollbar-track {
          background: var(--bg);
        }
        textarea::-webkit-scrollbar-thumb {
          background: var(--line);
          border-radius: 4px;
        }
        textarea::-webkit-scrollbar-thumb:hover {
          background: var(--text-muted);
        }

        /* Markdown Styling */
        .markdown-body :global(h1), .markdown-body :global(h2) { border-bottom: 1px solid var(--line); padding-bottom: 0.3em; margin-top: 1.5em; margin-bottom: 1rem; }
        .markdown-body :global(code) { background-color: var(--surface-subtle); padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; }
        .markdown-body :global(pre) { background-color: var(--surface-subtle); padding: 1rem; border-radius: 6px; overflow: auto; }
        .markdown-body :global(blockquote) { border-left: 4px solid var(--line); padding-left: 1rem; color: var(--text-muted); margin: 1rem 0; }
        .markdown-body :global(table) { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        .markdown-body :global(th), .markdown-body :global(td) { border: 1px solid var(--line); padding: 0.5rem; }

        /* Prism Theme Customization */
        :global(.token.comment),
        :global(.token.prolog),
        :global(.token.doctype),
        :global(.token.cdata) { color: #6a737d; font-style: italic; }
        :global(.token.punctuation) { color: var(--text-muted); }
        :global(.token.namespace) { opacity: .7; }
        :global(.token.property),
        :global(.token.tag),
        :global(.token.boolean),
        :global(.token.number),
        :global(.token.constant),
        :global(.token.symbol),
        :global(.token.deleted) { color: var(--accent-amber); }
        :global(.token.selector),
        :global(.token.attr-name),
        :global(.token.string),
        :global(.token.char),
        :global(.token.builtin),
        :global(.token.inserted) { color: #9ece6a; }
        :global(.token.operator),
        :global(.token.entity),
        :global(.token.url),
        :global(.language-css .token.string),
        :global(.style .token.string) { color: var(--accent-sky); }
        :global(.token.atrule),
        :global(.token.attr-value),
        :global(.token.keyword) { color: var(--accent-violet); }
        :global(.token.function),
        :global(.token.class-name) { color: #7aa2f7; }
        :global(.token.regex),
        :global(.token.important),
        :global(.token.variable) { color: var(--accent-amber); }
      `}</style>
    </div>
  );
}
