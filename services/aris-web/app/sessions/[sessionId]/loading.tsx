'use client';

import styles from './SessionLoading.module.css';

export default function Loading() {
  return (
    <div className="app-shell app-shell-immersive">
      {/* Mock Header Skeleton */}
      <header style={{ 
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
        zIndex: 100
      }}>
        <div className={`${styles.shimmer} ${styles.skeletonCircle}`} style={{ width: '32px', height: '32px' }}></div>
        <div className={`${styles.shimmer}`} style={{ marginLeft: '1rem', width: '120px', height: '1.25rem' }}></div>
        <div style={{ flex: 1 }}></div>
        <div className={`${styles.shimmer} ${styles.skeletonCircle}`} style={{ width: '32px', height: '32px' }}></div>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: '64px' }}>
        <div className={styles.skeletonWrapper}>
          {/* Sidebar Skeleton */}
          <aside className={styles.skeletonSidebar}>
            <div className={`${styles.shimmer} ${styles.skeletonItem}`} style={{ width: '60%', marginBottom: '1rem' }}></div>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className={`${styles.shimmer} ${styles.skeletonItem}`} style={{ height: '2.5rem', borderRadius: '0.75rem' }}></div>
            ))}
          </aside>

          {/* Main Content Skeleton */}
          <section className={styles.skeletonMain}>
            <div className={`${styles.shimmer} ${styles.skeletonItem}`} style={{ width: '40%', height: '1.5rem' }}></div>
            
            <div className={styles.skeletonChat}>
              <div className={`${styles.shimmer} ${styles.skeletonMessage} ${styles.skeletonMessageAgent}`}></div>
              <div className={`${styles.shimmer} ${styles.skeletonMessage} ${styles.skeletonMessageUser}`}></div>
              <div className={`${styles.shimmer} ${styles.skeletonMessage} ${styles.skeletonMessageAgent}`}></div>
            </div>

            <div className={`${styles.shimmer} ${styles.skeletonComposer}`}></div>
          </section>

          {/* Right Sidebar Skeleton */}
          <aside className={styles.skeletonRight}>
            <div className={`${styles.shimmer} ${styles.skeletonItem}`} style={{ height: '3rem', marginBottom: '1rem' }}></div>
            <div className={`${styles.shimmer}`} style={{ flex: 1, borderRadius: '0.75rem' }}></div>
          </aside>
        </div>
      </main>
    </div>
  );
}
