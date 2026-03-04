import { AlertTriangle } from 'lucide-react';

type BackendNoticeProps = {
  title?: string;
  message: string;
};

export function BackendNotice({ title, message }: BackendNoticeProps) {
  return (
    <div
      style={{
        marginBottom: '1.5rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--accent-red-bg)',
        backgroundColor: '#fff1f2',
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        color: 'var(--accent-red)',
      }}
    >
      <AlertTriangle size={20} />
      <div>
        <div style={{ fontWeight: 700 }}>{title ?? '백엔드 연결 상태 오류'}</div>
        <div className="text-sm" style={{ color: 'var(--text)' }}>
          {message}
        </div>
      </div>
    </div>
  );
}

