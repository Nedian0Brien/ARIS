'use client';

import type { ReactNode } from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import type {
  ClaudeCatalogItem,
  GeminiCatalogItem,
  OpenAiCatalogItem,
} from '@/lib/settings/providerModels';
import styles from './ModelsSection.module.css';

type CatalogItem = OpenAiCatalogItem | ClaudeCatalogItem | GeminiCatalogItem;

export function SectionGroup({
  eyebrow,
  title,
  subtitle,
  trailing,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const titleKey = typeof title === 'string' ? title : eyebrow;
  const headingId = `settings-section-${eyebrow.toLowerCase()}-${titleKey.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section className={styles.group} aria-labelledby={headingId}>
      <header className={styles.groupHead}>
        <div className={styles.groupHeadText}>
          <span className={styles.groupEyebrow}>{eyebrow}</span>
          <h2 id={headingId} className={styles.groupTitle}>{title}</h2>
          {subtitle ? <p className={styles.groupSubtitle}>{subtitle}</p> : null}
        </div>
        {trailing ? <div className={styles.groupTrailing}>{trailing}</div> : null}
      </header>
      <div className={styles.rowList}>{children}</div>
    </section>
  );
}

export function Row({
  leadingIcon,
  label,
  description,
  trailing,
  inset = false,
}: {
  leadingIcon?: ReactNode;
  label?: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  inset?: boolean;
}) {
  return (
    <div className={`${styles.row} ${inset ? styles.rowInset : ''}`}>
      {leadingIcon ? <span className={styles.rowLeading} aria-hidden>{leadingIcon}</span> : null}
      <div className={styles.rowBody}>
        {label ? <div className={styles.rowLabel}>{label}</div> : null}
        {description ? <div className={styles.rowDescription}>{description}</div> : null}
      </div>
      {trailing ? <div className={styles.rowTrailing}>{trailing}</div> : null}
    </div>
  );
}

export function ModelRow({
  item,
  selected,
  isDefault,
  onToggle,
  onSetDefault,
}: {
  item: CatalogItem;
  selected: boolean;
  isDefault: boolean;
  onToggle: () => void;
  /** When provided, renders an inline "기본으로 설정" affordance in the trailing slot. */
  onSetDefault?: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`${styles.row} ${styles.rowInteractive} ${selected ? styles.rowSelected : ''}`}
      aria-pressed={selected}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      <span className={styles.checkbox} aria-hidden>
        {selected ? <Check size={12} strokeWidth={3} /> : null}
      </span>
      <div className={styles.rowBody}>
        <div className={styles.rowLabel}>
          <span className={styles.monoId}>{item.id}</span>
          {isDefault ? <span className={styles.defaultBadge}>기본</span> : null}
        </div>
        <div className={styles.rowDescription}>
          <span className={styles.family}>{item.family}</span>
          {item.tags.slice(0, 3).map((tag) => (
            <span key={`${item.id}-${tag}`} className={styles.tag}>{tag}</span>
          ))}
        </div>
      </div>
      <div className={styles.rowTrailing}>
        {onSetDefault ? (
          <button
            type="button"
            className={styles.linkButton}
            onClick={(event) => {
              event.stopPropagation();
              onSetDefault();
            }}
            aria-label={`${item.id}을(를) 기본 모델로 설정`}
          >
            기본으로 설정
          </button>
        ) : null}
        <span className={styles.timestamp}>
          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
        </span>
      </div>
    </div>
  );
}

export function EmptyRow({ title, description }: { title: string; description: string }) {
  return (
    <div className={`${styles.row} ${styles.rowEmpty}`}>
      <div className={styles.rowBody}>
        <div className={styles.rowLabel}>{title}</div>
        <div className={styles.rowDescription}>{description}</div>
      </div>
    </div>
  );
}

export function FeedbackRow({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div className={`${styles.row} ${styles.rowFeedback}`}>
      <span className={`${styles.statusDot} ${ok ? styles.statusDotOk : styles.statusDotErr}`} aria-hidden />
      <div className={styles.rowBody}>
        <div className={`${styles.feedbackText} ${ok ? styles.feedbackOk : styles.feedbackErr}`}>{message}</div>
      </div>
    </div>
  );
}

export function StatusPill({
  ok,
  okLabel,
  pendLabel,
}: {
  ok: boolean;
  okLabel: string;
  pendLabel: string;
}) {
  return (
    <span
      className={`${styles.pill} ${ok ? styles.pillOk : styles.pillPending}`}
      role="status"
      aria-live="polite"
    >
      <span className={styles.pillDot} aria-hidden />
      {ok ? okLabel : pendLabel}
    </span>
  );
}

export function KeyMaskIcon({ hasKey }: { hasKey: boolean }) {
  return (
    <span className={`${styles.leadingBadge} ${hasKey ? styles.leadingBadgeOk : ''}`}>
      {hasKey ? <CheckCircle2 size={14} aria-hidden /> : <span className={styles.leadingBadgeChar}>•••</span>}
    </span>
  );
}

export function DotIcon() {
  return <span className={styles.leadingDot} />;
}
