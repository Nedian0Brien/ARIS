'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

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
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="title-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderOpen size={18} color="var(--primary)" /> Select Project Directory
          </h3>
          <Button variant="ghost" onClick={onClose} style={{ padding: '0.25rem', minHeight: 'auto', borderRadius: 'var(--radius-full)' }}>
            <X size={20} />
          </Button>
        </div>

        <div style={{ background: 'var(--surface-soft)', padding: '0.75rem 1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', overflowX: 'auto', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--text-muted)' }}>/workspace</span>{currentPath !== '/' ? currentPath : ''}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: '300px', maxHeight: '50vh', padding: '0.75rem' }} className="no-scrollbar">
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
          ) : error ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--accent-red)' }}>{error}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
              {parentPath !== null && (
                <button 
                  onClick={() => fetchDirectory(parentPath)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left' }}
                  className="btn-ghost"
                >
                  <ArrowUp size={18} color="var(--text-muted)" />
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>..</span>
                </button>
              )}
              {directories.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Empty directory</div>
              ) : (
                directories.map((dir) => (
                  <button 
                    key={dir.path}
                    onClick={() => fetchDirectory(dir.path)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left' }}
                    className="btn-ghost"
                  >
                    <Folder size={18} color="var(--accent-sky)" fill="var(--accent-sky-bg)" />
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{dir.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '1.25rem', borderTop: '1px solid var(--line)', display: 'flex', gap: '0.75rem', background: 'var(--surface-subtle)' }}>
          <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
          <Button 
            variant="primary" 
            onClick={() => {
              onSelect(`/workspace${currentPath === '/' ? '' : currentPath}`);
              onClose();
            }} 
            style={{ flex: 1.5 }}
          >
            <Check size={18} /> Select Current
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
