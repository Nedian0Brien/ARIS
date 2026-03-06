'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Folder, FolderOpen, File, ChevronRight, ArrowUpCircle, 
  Loader2, FolderPlus, FilePlus, Trash2, X, Save, AlertCircle
} from 'lucide-react';
import { Card } from '@/components/ui';

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
  const [newPathInput, setNewPathInput] = useState<{ type: 'file' | 'folder'; active: boolean }>({ type: 'file', active: false });
  const [newName, setNewName] = useState('');

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

  return (
    <div className="animate-in" style={{ padding: '2rem 0', maxWidth: '900px', margin: '0 auto' }}>
      <Card style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
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
            padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px',
            border: '1px solid var(--border-subtle)'
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
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          border: '1px solid var(--border-subtle)'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>위치:</span>
          <span>{data?.currentPath || currentPath}</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0', color: 'var(--text-secondary)' }}>
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
                <ArrowUpCircle size={20} style={{ color: 'var(--text-secondary)' }} />
                <span style={{ fontWeight: 500 }}>.. (상위 폴더)</span>
              </div>
            )}
            
            {data?.directories.length === 0 && !data?.parentPath && (
              <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
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
                  backgroundColor: 'transparent'
                }}
                className="hover-bg group"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                  {item.isDirectory ? (
                    <Folder size={20} style={{ color: 'var(--accent-sky)' }} />
                  ) : (
                    <File size={20} style={{ color: 'var(--text-secondary)' }} />
                  )}
                  <span style={{ 
                    fontWeight: item.isDirectory ? 500 : 400,
                    color: item.isDirectory ? 'var(--text-primary)' : 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {item.name}
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button 
                    onClick={(e) => handleDelete(e, item)}
                    style={{ 
                      padding: '0.4rem', borderRadius: '4px', color: 'var(--text-tertiary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    className="hover-danger"
                  >
                    <Trash2 size={16} />
                  </button>
                  {item.isDirectory && (
                    <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
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
          backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '2rem'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-primary)', borderRadius: '12px',
            width: '100%', maxWidth: '1000px', height: '100%', maxHeight: '800px',
            display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ 
              padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <File size={20} style={{ color: 'var(--text-secondary)' }} />
                <span style={{ fontWeight: 600 }}>{editingFile.name}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button 
                  onClick={saveEditedFile} 
                  disabled={isEditorSaving}
                  className="btn-primary" 
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                >
                  {isEditorSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  저장
                </button>
                <button 
                  onClick={() => setEditingFile(null)} 
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                >
                  <X size={16} /> 닫기
                </button>
              </div>
            </div>
            <div style={{ flex: 1, padding: '0', overflow: 'hidden' }}>
              <textarea
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                style={{
                  width: '100%', height: '100%', border: 'none', padding: '1.5rem',
                  fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: '1.5',
                  backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                  resize: 'none', outline: 'none'
                }}
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .hover-bg:hover {
          background-color: var(--bg-secondary) !important;
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
      `}</style>
    </div>
  );
}
