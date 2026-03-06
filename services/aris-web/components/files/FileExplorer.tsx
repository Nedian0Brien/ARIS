'use client';

import { useState, useEffect } from 'react';
import { Folder, FolderOpen, File, ChevronRight, ArrowUpCircle, Loader2 } from 'lucide-react';
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
  directories: FileItem[]; // API currently returns everything under 'directories' key
}

export function FileExplorer() {
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [data, setData] = useState<DirectoryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const fetchDirectory = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`/api/fs/list?path=${encodeURIComponent(currentPath)}`);
        if (!res.ok) {
          throw new Error('Failed to load directory');
        }
        
        const result = await res.json();
        if (isMounted) {
          setData(result);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchDirectory();
    
    return () => {
      isMounted = false;
    };
  }, [currentPath]);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
  };

  return (
    <div className="animate-in" style={{ padding: '2rem 0', maxWidth: '800px', margin: '0 auto' }}>
      <Card style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '0.5rem' }}>
          <FolderOpen size={24} style={{ color: 'var(--accent-sky)' }} />
          <h2 className="title-md" style={{ margin: 0 }}>파일 탐색기</h2>
        </div>

        <div style={{
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>경로:</span>
          <span>{data?.currentPath || currentPath}</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
            <Loader2 size={32} className="animate-spin" />
          </div>
        ) : error ? (
          <div style={{ color: 'var(--accent-red)', padding: '1rem', textAlign: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
            {error}
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
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <ArrowUpCircle size={20} style={{ color: 'var(--text-secondary)' }} />
                <span style={{ fontWeight: 500 }}>.. (상위 폴더)</span>
              </div>
            )}
            
            {data?.directories.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                빈 폴더입니다.
              </div>
            )}

            {data?.directories.map((item) => (
              <div
                key={item.name}
                onClick={() => item.isDirectory && handleNavigate(item.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  cursor: item.isDirectory ? 'pointer' : 'default',
                  transition: 'background-color 0.2s',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {item.isDirectory ? (
                    <Folder size={20} style={{ color: 'var(--accent-sky)' }} />
                  ) : (
                    <File size={20} style={{ color: 'var(--text-secondary)' }} />
                  )}
                  <span style={{ 
                    fontWeight: item.isDirectory ? 500 : 400,
                    color: item.isDirectory ? 'var(--text-primary)' : 'var(--text-secondary)' 
                  }}>
                    {item.name}
                  </span>
                </div>
                {item.isDirectory && (
                  <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
