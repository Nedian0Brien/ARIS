'use client';

import { useState, useEffect } from 'react';
import { Folder, FolderOpen, ArrowUp, X, Check } from 'lucide-react';
import { Button, Card } from '@/components/ui';

interface DirectoryInfo {
  name: string;
  path: string;
}

interface DirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function DirectoryModal({ isOpen, onClose, onSelect }: DirectoryModalProps) {
  const [currentPath, setCurrentPath] = useState('/');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDirectory = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch directory');
      
      setCurrentPath(data.currentPath || '/');
      setParentPath(data.parentPath);
      setDirectories(data.directories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDirectory('/');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Card 
        className="modal-content animate-in" 
        style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '400px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="title-md">Select Project Directory</h3>
          <Button variant="ghost" onClick={onClose} style={{ padding: '0.25rem', minHeight: 'auto' }}>
            <X size={20} />
          </Button>
        </div>

        <div style={{ background: 'var(--surface-soft)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--text-muted)' }}>/workspace</span>{currentPath !== '/' ? currentPath : ''}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: '200px', maxHeight: '40vh', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
          {loading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
          ) : error ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--accent-red)' }}>{error}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {parentPath !== null && (
                <button 
                  onClick={() => fetchDirectory(parentPath)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-subtle)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <ArrowUp size={18} color="var(--text-muted)" />
                  <span>..</span>
                </button>
              )}
              {directories.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Empty directory</div>
              ) : (
                directories.map((dir) => (
                  <button 
                    key={dir.path}
                    onClick={() => fetchDirectory(dir.path)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-subtle)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <Folder size={18} color="var(--accent-sky)" />
                    <span>{dir.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
          <Button 
            variant="primary" 
            onClick={() => {
              onSelect(`/workspace${currentPath === '/' ? '' : currentPath}`);
              onClose();
            }} 
            style={{ flex: 1 }}
          >
            <Check size={16} style={{ marginRight: '0.25rem' }} /> Select Current
          </Button>
        </div>
      </Card>
    </div>
  );
}
