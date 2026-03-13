'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, LoaderCircle, RefreshCw, Search, Sparkles, Stars } from 'lucide-react';
import {
  DEFAULT_CLAUDE_MODEL_SELECTIONS,
  DEFAULT_CODEX_MODEL_SELECTIONS,
  DEFAULT_GEMINI_MODEL_SELECTIONS,
  type ClaudeCatalogItem,
  type GeminiCatalogItem,
  type OpenAiCatalogItem,
  type ProviderId,
} from '@/lib/settings/providerModels';
import styles from './CodexModelCatalogCard.module.css';

type Feedback = { ok: boolean; msg: string } | null;
type CatalogItem = OpenAiCatalogItem | ClaudeCatalogItem | GeminiCatalogItem;

type ModelVersionGroup = {
  key: string;
  label: string;
  items: CatalogItem[];
  latestCreated: number;
};

function deriveVersionGroup(item: CatalogItem): { key: string; label: string } {
  const normalized = item.id.toLowerCase();

  // OpenAI GPT models
  const dottedVersionMatch = normalized.match(/^gpt-(\d+\.\d+)/);
  if (dottedVersionMatch) {
    return {
      key: `gpt-${dottedVersionMatch[1]}`,
      label: dottedVersionMatch[1],
    };
  }

  if (normalized.startsWith('gpt-4o-mini')) {
    return { key: 'gpt-4o-mini', label: '4o mini' };
  }

  if (normalized.startsWith('gpt-4o')) {
    return { key: 'gpt-4o', label: '4o' };
  }

  const majorVersionMatch = normalized.match(/^gpt-(\d+)/);
  if (majorVersionMatch) {
    return {
      key: `gpt-${majorVersionMatch[1]}`,
      label: majorVersionMatch[1],
    };
  }

  if (normalized.startsWith('chatgpt')) {
    return { key: 'chatgpt', label: 'ChatGPT' };
  }

  // Claude models
  if (normalized.includes('claude') && normalized.includes('opus')) {
    return { key: 'claude-opus', label: 'Opus' };
  }
  if (normalized.includes('claude') && normalized.includes('sonnet')) {
    return { key: 'claude-sonnet', label: 'Sonnet' };
  }
  if (normalized.includes('claude') && normalized.includes('haiku')) {
    return { key: 'claude-haiku', label: 'Haiku' };
  }
  if (normalized.startsWith('claude')) {
    return { key: 'claude', label: 'Claude' };
  }

  // Gemini models
  if (normalized.startsWith('gemini-2.5')) {
    return { key: 'gemini-2.5', label: '2.5' };
  }
  if (normalized.startsWith('gemini-2.0')) {
    return { key: 'gemini-2.0', label: '2.0' };
  }
  if (normalized.startsWith('gemini-1.5')) {
    return { key: 'gemini-1.5', label: '1.5' };
  }
  if (normalized.startsWith('gemini-1.0') || normalized.match(/^gemini-1\b/)) {
    return { key: 'gemini-1.0', label: '1.0' };
  }
  if (normalized.startsWith('gemini')) {
    return { key: 'gemini', label: 'Gemini' };
  }

  return {
    key: item.family.toLowerCase().replace(/\s+/g, '-'),
    label: item.family,
  };
}

function buildVersionGroups(items: CatalogItem[]): ModelVersionGroup[] {
  const groups = new Map<string, ModelVersionGroup>();

  for (const item of items) {
    const group = deriveVersionGroup(item);
    const existing = groups.get(group.key);
    if (existing) {
      existing.items.push(item);
      existing.latestCreated = Math.max(existing.latestCreated, item.created);
      continue;
    }
    groups.set(group.key, {
      key: group.key,
      label: group.label,
      items: [item],
      latestCreated: item.created,
    });
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (right.latestCreated !== left.latestCreated) {
      return right.latestCreated - left.latestCreated;
    }
    return left.label.localeCompare(right.label);
  });
}

export function CodexModelCatalogCard({
  providerOptions,
  activeProvider,
  onProviderChange,
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
  providerOptions: Array<{ id: ProviderId; label: string }>;
  activeProvider: ProviderId;
  onProviderChange: (provider: ProviderId) => void;
  hasApiKey: boolean;
  items: CatalogItem[];
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
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('');
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setQuery('');
    setSelectedGroupKey('');
  }, [activeProvider]);

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

  const versionGroups = useMemo(() => buildVersionGroups(filteredItems), [filteredItems]);

  useEffect(() => {
    if (versionGroups.length === 0) {
      setSelectedGroupKey('');
      return;
    }
    if (!versionGroups.some((group) => group.key === selectedGroupKey)) {
      setSelectedGroupKey(versionGroups[0].key);
    }
  }, [selectedGroupKey, versionGroups]);

  const selectedGroup = useMemo(
    () => versionGroups.find((group) => group.key === selectedGroupKey) ?? versionGroups[0] ?? null,
    [selectedGroupKey, versionGroups],
  );

  const selectedCount = selectedModelIds.length;
  const isCodex = activeProvider === 'codex';
  const isClaude = activeProvider === 'claude';
  const isGemini = activeProvider === 'gemini';
  const isActiveProvider = isCodex || isClaude || isGemini;
  const providerTitle = activeProvider === 'claude' ? 'Claude' : activeProvider === 'gemini' ? 'Gemini' : 'Codex';
  const themeClass = activeProvider === 'claude'
    ? styles.themeClaude
    : activeProvider === 'gemini'
      ? styles.themeGemini
      : styles.themeCodex;

  const defaultSelectionsCount = isCodex
    ? DEFAULT_CODEX_MODEL_SELECTIONS.length
    : isClaude
      ? DEFAULT_CLAUDE_MODEL_SELECTIONS.length
      : DEFAULT_GEMINI_MODEL_SELECTIONS.length;

  const noApiKeyMessage = isCodex
    ? '키가 등록되면 `/v1/models` 기준으로 Codex용 텍스트 모델 카탈로그를 불러와 버전 그룹 기반 선택 UI로 표시합니다.'
    : isClaude
      ? '키가 등록되면 Anthropic `/v1/models` 기준으로 Claude 모델 카탈로그를 불러와 표시합니다.'
      : '키가 등록되면 Google AI `/v1beta/models` 기준으로 Gemini 모델 카탈로그를 불러와 표시합니다.';

  return (
    <section className={`${styles.card} ${themeClass}`}>
      <div className={styles.hero}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <div className={styles.eyebrow}>
              <Bot size={14} />
              Provider Catalog
            </div>
            <h3 className={styles.title}>사용할 모델 목록</h3>
            <p className={styles.description}>
              {isActiveProvider
                ? `${providerTitle} 계정에서 실제 조회한 모델만 표시합니다. 버전 그룹을 먼저 고른 뒤 실제 모델을 선택하는 2단계 브라우저로 구성했습니다.`
                : `${providerTitle}용 모델 카탈로그 UI는 이 위치에 연결됩니다. 현재는 provider 전환 구조와 플레이스홀더만 준비된 상태입니다.`}
            </p>
          </div>

          <div className={styles.providerRail} aria-label="제공자 범위">
            {providerOptions.map((provider) => {
              const active = provider.id === activeProvider;
              return (
                <button
                  key={provider.id}
                  type="button"
                  className={`${styles.providerButton} ${active ? styles.providerButtonActive : ''} ${styles[`provider${provider.label}Tone` as keyof typeof styles]}`}
                  onClick={() => onProviderChange(provider.id)}
                >
                  {active ? <CheckCircle2 size={14} /> : null}
                  {provider.label}
                </button>
              );
            })}
          </div>
        </div>

        {isActiveProvider ? (
          <>
            <div className={styles.toolbar}>
              <input
                className={styles.search}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="모델 이름, 버전, 태그로 검색"
                aria-label={`${providerTitle} 모델 검색`}
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
                사용 {selectedCount}개
              </span>
              <span className={styles.statPill}>
                <Stars size={14} />
                기본 권장 {defaultSelectionsCount}개
              </span>
              {feedback ? (
                <span className={`${styles.feedback} ${feedback.ok ? styles.feedbackOk : styles.feedbackErr}`}>
                  {feedback.msg}
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className={styles.listWrap}>
        {!isActiveProvider ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateTitle}>{providerTitle} 모델 선택 UI 준비됨</div>
            <p className={styles.emptyStateText}>
              현재는 provider 전환 흐름만 열어 두었습니다. 이후 이 영역에 {providerTitle} 모델 카탈로그 조회, 선택,
              저장 액션이 같은 방식으로 연결됩니다.
            </p>
          </div>
        ) : !hasApiKey ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateTitle}>먼저 {providerTitle} API 키를 등록하세요</div>
            <p className={styles.emptyStateText}>{noApiKeyMessage}</p>
          </div>
        ) : loading ? (
          <div className={styles.skeletonGrid}>
            <div className={styles.skeletonCard} />
            <div className={styles.skeletonCard} />
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateTitle}>카탈로그를 불러오지 못했습니다</div>
            <p className={styles.emptyStateText}>{error}</p>
          </div>
        ) : versionGroups.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateTitle}>검색 결과가 없습니다</div>
            <p className={styles.emptyStateText}>다른 검색어를 입력하거나 필터를 비우고 다시 확인해 주세요.</p>
          </div>
        ) : (
          <div className={styles.browserGrid}>
            <div className={styles.browserPane}>
              <div className={styles.paneHeader}>
                <span className={styles.paneTitle}>버전 그룹</span>
                <span className={styles.paneMeta}>{versionGroups.length}개</span>
              </div>
              <div className={styles.versionList}>
                {versionGroups.map((group) => {
                  const active = group.key === selectedGroup?.key;
                  const groupSelectedCount = group.items.filter((item) => selectedModelIds.includes(item.id)).length;
                  return (
                    <button
                      key={group.key}
                      type="button"
                      className={`${styles.versionButton} ${active ? styles.versionButtonActive : ''}`}
                      onClick={() => setSelectedGroupKey(group.key)}
                    >
                      <span className={styles.versionLabel}>{group.label}</span>
                      <span className={styles.versionMeta}>{groupSelectedCount}/{group.items.length}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.browserPane}>
              <div className={styles.paneHeader}>
                <span className={styles.paneTitle}>{selectedGroup?.label ?? '선택한 그룹'} 모델</span>
                <span className={styles.paneMeta}>{selectedGroup?.items.length ?? 0}개</span>
              </div>
              <div className={styles.modelList}>
                {selectedGroup?.items.map((item) => {
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
                          {selected ? '사용' : '제외'}
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
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
