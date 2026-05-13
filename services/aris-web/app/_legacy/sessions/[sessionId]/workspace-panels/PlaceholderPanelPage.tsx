import React from 'react';

type PlaceholderPanelPageProps = {
  title: string;
  description: string;
  onReturnToChat?: () => void;
};

export function PlaceholderPanelPage({ title, description, onReturnToChat }: PlaceholderPanelPageProps) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        minHeight: '100%',
        padding: '1rem',
      }}
    >
      {onReturnToChat ? (
        <button
          type="button"
          onClick={onReturnToChat}
          style={{
            alignSelf: 'flex-start',
            minHeight: '2.4rem',
            padding: '0.45rem 0.85rem',
            borderRadius: '999px',
            border: '1px solid color-mix(in srgb, var(--line) 76%, transparent)',
            background: 'color-mix(in srgb, var(--surface) 94%, white 6%)',
            color: 'var(--text)',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          채팅으로 돌아가기
        </button>
      ) : null}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          alignSelf: 'flex-start',
          minHeight: '1.75rem',
          padding: '0.2rem 0.6rem',
          borderRadius: '999px',
          background: 'color-mix(in srgb, var(--accent-amber-bg) 78%, transparent)',
          color: 'color-mix(in srgb, var(--accent-amber) 84%, var(--text) 16%)',
          fontSize: '0.8rem',
          fontWeight: 700,
        }}
      >
        준비 중
      </span>
      <h3 style={{ margin: 0, fontSize: '1.2rem', lineHeight: 1.2 }}>{title}</h3>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>{description}</p>
    </section>
  );
}
