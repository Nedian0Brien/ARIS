'use client';

import styles from './SessionLoading.module.css';

type SessionLoadingProps = {
  variant?: 'full' | 'panel';
};

function FullSessionLoading() {
  return (
    <div className="app-shell app-shell-immersive">
      <header
        style={{
          height: '64px',
          width: '100%',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1.5rem',
          background: 'var(--bg-blur)',
          backdropFilter: 'blur(12px)',
          position: 'fixed',
          top: 0,
          zIndex: 100,
        }}
      >
        <div className={`${styles.shimmer} ${styles.skeletonCircle}`} style={{ width: '32px', height: '32px' }} />
        <div className={styles.shimmer} style={{ marginLeft: '1rem', width: '120px', height: '1.25rem' }} />
        <div style={{ flex: 1 }} />
        <div className={`${styles.shimmer} ${styles.skeletonCircle}`} style={{ width: '32px', height: '32px' }} />
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: '64px' }}>
        <div className={styles.skeletonWrapper}>
          <aside className={styles.skeletonSidebar}>
            <div className={`${styles.shimmer} ${styles.skeletonItem}`} style={{ width: '60%', marginBottom: '1rem' }} />
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`${styles.shimmer} ${styles.skeletonItem}`}
                style={{ height: '2.5rem', borderRadius: '0.75rem' }}
              />
            ))}
          </aside>

          <section className={styles.skeletonMain}>
            <div className={`${styles.shimmer} ${styles.skeletonItem}`} style={{ width: '40%', height: '1.5rem' }} />

            <div className={styles.skeletonChat}>
              <div className={`${styles.shimmer} ${styles.skeletonMessage} ${styles.skeletonMessageAgent}`} />
              <div className={`${styles.shimmer} ${styles.skeletonMessage} ${styles.skeletonMessageUser}`} />
              <div className={`${styles.shimmer} ${styles.skeletonMessage} ${styles.skeletonMessageAgent}`} />
            </div>

            <div className={`${styles.shimmer} ${styles.skeletonComposer}`} />
          </section>

          <aside className={styles.skeletonRight}>
            <div className={`${styles.shimmer} ${styles.skeletonItem}`} style={{ height: '3rem', marginBottom: '1rem' }} />
            <div className={styles.shimmer} style={{ flex: 1, borderRadius: '0.75rem' }} />
          </aside>
        </div>
      </main>
    </div>
  );
}

function PanelSessionLoading() {
  return (
    <div className={styles.panelShell} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.panelHeader}>
        <div>
          <div className={`${styles.shimmer} ${styles.panelEyebrow}`} />
          <div className={styles.panelCopy}>채팅 내용을 불러오는 중입니다.</div>
        </div>
        <div className={`${styles.shimmer} ${styles.panelBadge}`} />
      </div>

      <div className={styles.panelBody}>
        <div className={`${styles.shimmer} ${styles.panelMessage} ${styles.panelMessageAgent}`} />
        <div className={`${styles.shimmer} ${styles.panelMessage} ${styles.panelMessageUser}`} />
        <div className={`${styles.shimmer} ${styles.panelMessage} ${styles.panelMessageAgent}`} />
        <div className={`${styles.shimmer} ${styles.panelMessage} ${styles.panelMessageUser}`} />
      </div>

      <div className={`${styles.shimmer} ${styles.panelComposer}`} />
    </div>
  );
}

export function SessionLoading({ variant = 'full' }: SessionLoadingProps) {
  return variant === 'panel' ? <PanelSessionLoading /> : <FullSessionLoading />;
}

export default SessionLoading;
