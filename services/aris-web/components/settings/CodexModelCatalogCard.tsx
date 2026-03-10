'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Bot, CheckCircle2, LoaderCircle, RefreshCw, Search, Sparkles, Stars } from 'lucide-react';
import { DEFAULT_CODEX_MODEL_SELECTIONS, type OpenAiCatalogItem } from '@/lib/settings/providerModels';
import styles from './CodexModelCatalogCard.module.css';

type Feedback = { ok: boolean; msg: string } | null;

export function CodexModelCatalogCard({
  hasApiKey,
  items,
  selectedModelIds,
  loading,
  saving,
  error,
  feedback,
  onToggle,
  onRefresh,
  onSave,
  onApplyRecommended,
}: {
  hasApiKey: boolean;
  items: OpenAiCatalogItem[];
  selectedModelIds: string[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  feedback: Feedback;
  onToggle: (modelId: string) => void;
  onRefresh: () => Promise<void>;
  onSave: () => Promise<void>;
  onApplyRecommended: () => void;
}) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const filteredItems = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }
    return items.filter((item) => (
      item.id.toLowerCase().includes(normalizedQuery)
      || item.label.toLowerCase().includes(normalizedQuery)
      || item.family.toLowerCase().includes(normalizedQuery)
      || item.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
    ));
  }, [deferredQuery, items]);

  const selectedCount = selectedModelIds.length;

  return (
    <section className={styles.card}>
      <div className={styles.hero}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <div className={styles.eyebrow}>
              <Bot size={14} />
              Provider Catalog
            </div>
            <h3 className={styles.title}>CODEX 모델 등록 목록</h3>
            <p className={styles.description}>
              OpenAI 계정에서 실제 조회한 텍스트 생성 모델만 표시합니다. 선택한 모델만 채팅 화면의 Codex 모델 선택기에
              노출되며, 선택 해제하면 즉시 제외됩니다.
            </p>
          </div>

          <div className={styles.providerRail} aria-label="제공자 범위">
            <span className={styles.providerChip}>
              <CheckCircle2 size={14} />
              Codex 활성
            </span>
            <span className={styles.providerChipMuted}>Claude 확장 예정</span>
            <span className={styles.providerChipMuted}>Gemini 확장 예정</span>
          </div>
        </div>

        <div className={styles.toolbar}>
          <input
            className={styles.search}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="모델 이름, 패밀리, 태그로 검색"
            aria-label="OpenAI 모델 검색"
          />
          <div className={styles.toolbarActions}>
            <button
              type="button"
              className={styles.subtleButton}
              onClick={() => { void onRefresh(); }}
              disabled={!hasApiKey || loading}
            >
              {loading ? <LoaderCircle size={16} /> : <RefreshCw size={16} />}
              새로고침
            </button>
            <button
              type="button"
              className={styles.subtleButton}
              onClick={onApplyRecommended}
              disabled={!hasApiKey}
            >
              <Stars size={16} />
              권장 세트
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => { void onSave(); }}
              disabled={!hasApiKey || saving || selectedCount === 0}
            >
              <Sparkles size={16} />
              {saving ? '저장 중...' : `선택 저장 (${selectedCount})`}
            </button>
          </div>
        </div>

        <div className={styles.metaRow}>
          <span className={styles.statPill}>
            <Search size={14} />
            전체 {items.length}개
          </span>
          <span className={styles.statPill}>
            <CheckCircle2 size={14} />
            등록 {selectedCount}개
          </span>
          <span className={styles.statPill}>
            <Stars size={14} />
            기본 권장 {DEFAULT_CODEX_MODEL_SELECTIONS.length}개
          </span>
          {feedback ? (
            <span className={`${styles.feedback} ${feedback.ok ? styles.feedbackOk : styles.feedbackErr}`}>
              {feedback.msg}
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.listWrap}>
        {!hasApiKey ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateTitle}>먼저 OpenAI API 키를 등록하세요</div>
            <p className={styles.emptyStateText}>
              키가 등록되면 `/v1/models` 기준으로 Codex용 텍스트 모델 카탈로그를 불러와 선택형 목록으로 표시합니다.
            </p>
          </div>
        ) : loading ? (
          <div className={styles.skeletonGrid}>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`skeleton-${index}`} className={styles.skeletonCard} />
            ))}
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateTitle}>카탈로그를 불러오지 못했습니다</div>
            <p className={styles.emptyStateText}>{error}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateTitle}>검색 결과가 없습니다</div>
            <p className={styles.emptyStateText}>다른 검색어를 입력하거나 필터를 비우고 다시 확인해 주세요.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {filteredItems.map((item) => {
              const selected = selectedModelIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.modelCard} ${selected ? styles.modelCardSelected : ''}`}
                  onClick={() => onToggle(item.id)}
                  aria-pressed={selected}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.modelLabelWrap}>
                      <span className={styles.family}>{item.family}</span>
                      <span className={styles.modelLabel}>{item.label}</span>
                    </div>
                    <span className={selected ? styles.selectionBadge : styles.selectionBadgeMuted}>
                      {selected ? '등록됨' : '제외됨'}
                    </span>
                  </div>

                  <div className={styles.modelId}>{item.id}</div>

                  <div className={styles.tagRow}>
                    {item.tags.map((tag) => (
                      <span key={`${item.id}-${tag}`} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className={styles.timestamp}>
                    {item.createdAt
                      ? `등록 시각 기준 ${new Date(item.createdAt).toLocaleDateString()}`
                      : '등록 시각 정보 없음'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
