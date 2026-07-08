'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_GEMINI_MODE_ID,
  DEFAULT_CLAUDE_MODEL_SELECTIONS,
  DEFAULT_GEMINI_MODEL_SELECTIONS,
  GEMINI_MODE_SELECTION_OPTIONS,
  sanitizeManualModelId,
  type ClaudeCatalogItem,
  type GeminiCatalogItem,
  type ModelSettingsResponse,
  type OpenAiCatalogItem,
  type ProviderId,
} from '@/lib/settings/providerModels';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import {
  DotIcon,
  EmptyRow,
  FeedbackRow,
  KeyMaskIcon,
  ModelRow,
  Row,
  SectionGroup,
  StatusPill,
} from './ModelsSectionParts';
import styles from './ModelsSection.module.css';

type Feedback = { ok: boolean; msg: string } | null;
type CatalogItem = OpenAiCatalogItem | ClaudeCatalogItem | GeminiCatalogItem;
type ProviderRecord<T> = Record<ProviderId, T>;

type ProviderConfig = {
  id: ProviderId;
  label: string;
  keyLabel: string;
  keyPlaceholder: string;
  catalogHint: string;
  catalogEndpoint: string;
  keyEndpoint: string;
  selectionDefaults: readonly string[];
  /** When true, the provider exposes a manual "add model id" affordance (Codex-style escape hatch). */
  supportsManualModelId?: boolean;
  /** When true, the provider exposes the Gemini-specific default mode selector. */
  supportsGeminiModes?: boolean;
  /** Label shown on the "apply preset" toolbar button. */
  applyPresetLabel: string;
  /** Human-readable secret name for error messages. */
  keyDisplayName: string;
  /** Defaults section copy. */
  defaultsTitle: string;
  defaultsSubtitle: string;
};

/**
 * Single source of truth for which providers Settings → Models knows about.
 * Adding a new provider (e.g. OpenCode) is intended to require only:
 *   1. extend the `ProviderId` union in `lib/settings/providerModels.ts`
 *   2. add an SVG to `PROVIDER_ICON_SVGS` in `components/ui/ProviderLogo.tsx`
 *   3. add an entry below
 *   4. add the matching server API routes
 * No JSX or state branching inside this component should hard-code provider ids.
 */
const PROVIDERS: readonly ProviderConfig[] = [
  {
    id: 'codex',
    label: 'Codex',
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
    catalogHint: 'OpenAI /v1/models 카탈로그',
    catalogEndpoint: '/api/settings/models/catalog/openai',
    keyEndpoint: '/api/settings/openai-key',
    selectionDefaults: [],
    supportsManualModelId: true,
    applyPresetLabel: '카탈로그 전체 적용',
    keyDisplayName: 'OpenAI API',
    defaultsTitle: 'Codex 기본 실행값',
    defaultsSubtitle: '새 Codex 채팅의 초기 모델을 정의합니다. 브라우저의 마지막 선택이 있으면 그쪽이 우선합니다.',
  },
  {
    id: 'claude',
    label: 'Claude',
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-...',
    catalogHint: 'Anthropic /v1/models 카탈로그',
    catalogEndpoint: '/api/settings/models/catalog/claude',
    keyEndpoint: '/api/settings/claude-key',
    selectionDefaults: DEFAULT_CLAUDE_MODEL_SELECTIONS,
    applyPresetLabel: '권장 세트 적용',
    keyDisplayName: 'Anthropic API',
    defaultsTitle: 'Claude 기본 실행값',
    defaultsSubtitle: '새 Claude 채팅의 초기 모델을 정의합니다.',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    keyLabel: 'Google AI Studio API Key',
    keyPlaceholder: 'AIza...',
    catalogHint: 'Google AI /v1beta/models 카탈로그',
    catalogEndpoint: '/api/settings/models/catalog/gemini',
    keyEndpoint: '/api/settings/gemini-key',
    selectionDefaults: DEFAULT_GEMINI_MODEL_SELECTIONS,
    supportsGeminiModes: true,
    applyPresetLabel: '권장 세트 적용',
    keyDisplayName: 'Google AI Studio API',
    defaultsTitle: 'Gemini 기본 실행값',
    defaultsSubtitle: '새 Gemini 채팅의 초기 모델과 모드를 정의합니다. ACP capability는 다시 조회하지 않습니다.',
  },
];

const PROVIDER_IDS = PROVIDERS.map((p) => p.id) as ProviderId[];

function emptyByProvider<T>(factory: (id: ProviderId) => T): ProviderRecord<T> {
  return PROVIDER_IDS.reduce((acc, id) => {
    acc[id] = factory(id);
    return acc;
  }, {} as ProviderRecord<T>);
}

function initialSelections(): ProviderRecord<string[]> {
  return emptyByProvider((id) => {
    const config = PROVIDERS.find((p) => p.id === id);
    return config ? [...config.selectionDefaults] : [];
  });
}

function initialDefaults(): ProviderRecord<string> {
  return emptyByProvider((id) => {
    const config = PROVIDERS.find((p) => p.id === id);
    if (!config) return '';
    return config.selectionDefaults[0] ?? '';
  });
}

function isApiKeyConfigured(secrets: ModelSettingsResponse['secrets'], id: ProviderId): boolean {
  if (id === 'codex') return secrets.openAiApiKeyConfigured;
  if (id === 'claude') return secrets.claudeApiKeyConfigured;
  if (id === 'gemini') return secrets.geminiApiKeyConfigured;
  return false;
}

const DEFAULT_MODEL_SETTINGS: ModelSettingsResponse = {
  providers: {
    codex: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
    claude: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
    gemini: { selectedModelIds: [], defaultModelId: null, defaultModeId: DEFAULT_GEMINI_MODE_ID },
  },
  legacyCustomModels: { codex: '', claude: '', gemini: '' },
  secrets: {
    openAiApiKeyConfigured: false,
    claudeApiKeyConfigured: false,
    geminiApiKeyConfigured: false,
  },
};

export function ModelsSection() {
  const [modelSettings, setModelSettings] = useState<ModelSettingsResponse>(DEFAULT_MODEL_SETTINGS);
  const [activeProvider, setActiveProvider] = useState<ProviderId>(PROVIDER_IDS[0]);

  // ── Per-provider state, all keyed by ProviderId ─────────────────────────
  const [catalogItems, setCatalogItems] = useState<ProviderRecord<CatalogItem[]>>(() => emptyByProvider(() => []));
  const [selectedModelIds, setSelectedModelIds] = useState<ProviderRecord<string[]>>(initialSelections);
  const [defaultModelIds, setDefaultModelIds] = useState<ProviderRecord<string>>(initialDefaults);
  const [catalogLoading, setCatalogLoading] = useState<ProviderRecord<boolean>>(() => emptyByProvider(() => false));
  const [catalogError, setCatalogError] = useState<ProviderRecord<string | null>>(() => emptyByProvider(() => null));
  const [modelSaving, setModelSaving] = useState<ProviderRecord<boolean>>(() => emptyByProvider(() => false));
  const [modelFeedback, setModelFeedback] = useState<ProviderRecord<Feedback>>(() => emptyByProvider(() => null));
  const [keySaving, setKeySaving] = useState<ProviderRecord<boolean>>(() => emptyByProvider(() => false));
  const [keyDeleting, setKeyDeleting] = useState<ProviderRecord<boolean>>(() => emptyByProvider(() => false));
  const [keyFeedback, setKeyFeedback] = useState<ProviderRecord<Feedback>>(() => emptyByProvider(() => null));

  // ── Gemini-specific default mode (capability-gated below) ───────────────
  const [geminiDefaultModeId, setGeminiDefaultModeId] = useState<string>(DEFAULT_GEMINI_MODE_ID);

  // ── UI-local ─────────────────────────────────────────────────────────────
  const [keyEditing, setKeyEditing] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [query, setQuery] = useState('');
  const [manualModelId, setManualModelId] = useState('');
  const deferredQuery = useDeferredValue(query);

  // ── Per-provider state setter helpers.
  //   Each takes (id, value) and merges into the record; the type-narrow
  //   `value` argument keeps consumers terse without resorting to a generic
  //   helper, whose inference TypeScript narrows to literal types.
  const setCatalogFor = useCallback((id: ProviderId, items: CatalogItem[]) => {
    setCatalogItems((prev) => ({ ...prev, [id]: items }));
  }, []);
  const setSelectedFor = useCallback((id: ProviderId, ids: string[]) => {
    setSelectedModelIds((prev) => ({ ...prev, [id]: ids }));
  }, []);
  const setDefaultFor = useCallback((id: ProviderId, modelId: string) => {
    setDefaultModelIds((prev) => ({ ...prev, [id]: modelId }));
  }, []);
  const setCatalogLoadingFor = useCallback((id: ProviderId, value: boolean) => {
    setCatalogLoading((prev) => ({ ...prev, [id]: value }));
  }, []);
  const setCatalogErrorFor = useCallback((id: ProviderId, value: string | null) => {
    setCatalogError((prev) => ({ ...prev, [id]: value }));
  }, []);
  const setModelSavingFor = useCallback((id: ProviderId, value: boolean) => {
    setModelSaving((prev) => ({ ...prev, [id]: value }));
  }, []);
  const setModelFeedbackFor = useCallback((id: ProviderId, value: Feedback) => {
    setModelFeedback((prev) => ({ ...prev, [id]: value }));
  }, []);
  const setKeySavingFor = useCallback((id: ProviderId, value: boolean) => {
    setKeySaving((prev) => ({ ...prev, [id]: value }));
  }, []);
  const setKeyDeletingFor = useCallback((id: ProviderId, value: boolean) => {
    setKeyDeleting((prev) => ({ ...prev, [id]: value }));
  }, []);
  const setKeyFeedbackFor = useCallback((id: ProviderId, value: Feedback) => {
    setKeyFeedback((prev) => ({ ...prev, [id]: value }));
  }, []);

  // ── Sync from server response ────────────────────────────────────────────
  const syncFromResponse = useCallback((settings: ModelSettingsResponse) => {
    const nextSelections = initialSelections();
    const nextDefaults = initialDefaults();
    for (const config of PROVIDERS) {
      const persisted = settings.providers[config.id].selectedModelIds;
      const nextSelected = persisted.length > 0 ? persisted : [...config.selectionDefaults];
      nextSelections[config.id] = nextSelected;
      const persistedDefault = settings.providers[config.id].defaultModelId;
      nextDefaults[config.id] = persistedDefault ?? nextSelected[0] ?? '';
    }
    setSelectedModelIds(nextSelections);
    setDefaultModelIds(nextDefaults);
    setGeminiDefaultModeId(settings.providers.gemini.defaultModeId ?? DEFAULT_GEMINI_MODE_ID);
  }, []);

  // ── Fetchers ─────────────────────────────────────────────────────────────
  const loadModelSettings = useCallback(async (): Promise<ModelSettingsResponse | null> => {
    try {
      const response = await fetch('/api/settings/models');
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error('모델 설정을 불러오지 못했습니다.');
      setModelSettings(data);
      syncFromResponse(data);
      return data;
    } catch (error) {
      setModelFeedbackFor('codex', {
        ok: false,
        msg: error instanceof Error ? error.message : '모델 설정을 불러오지 못했습니다.',
      });
      return null;
    }
  }, [syncFromResponse, setModelFeedbackFor]);

  const loadCatalog = useCallback(async (id: ProviderId) => {
    const config = PROVIDERS.find((p) => p.id === id);
    if (!config) return;
    setCatalogLoadingFor(id, true);
    setCatalogErrorFor(id, null);
    try {
      const response = await fetch(config.catalogEndpoint);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(`${config.label} 모델 카탈로그를 불러오지 못했습니다.`);
      setCatalogFor(id, Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      setCatalogFor(id, []);
      setCatalogErrorFor(
        id,
        error instanceof Error ? error.message : `${config.label} 모델 카탈로그를 불러오지 못했습니다.`,
      );
    } finally {
      setCatalogLoadingFor(id, false);
    }
  }, [setCatalogFor, setCatalogErrorFor, setCatalogLoadingFor]);

  useEffect(() => {
    void loadModelSettings().then((settings) => {
      if (!settings) return;
      for (const config of PROVIDERS) {
        if (isApiKeyConfigured(settings.secrets, config.id)) {
          void loadCatalog(config.id);
        }
      }
    });
  }, [loadCatalog, loadModelSettings]);

  // Reset transient UI when provider changes
  useEffect(() => {
    setKeyEditing(false);
    setKeyDraft('');
    setQuery('');
    setManualModelId('');
  }, [activeProvider]);

  // ── API key save/delete (generic over provider) ──────────────────────────
  const handleSaveKey = useCallback(async (id: ProviderId, apiKey: string) => {
    const config = PROVIDERS.find((p) => p.id === id);
    if (!config) return;
    if (apiKey.trim().length < 20) {
      setKeyFeedbackFor(id, { ok: false, msg: `유효한 ${config.keyDisplayName} 키를 입력해 주세요.` });
      return;
    }
    setKeySavingFor(id, true);
    setKeyFeedbackFor(id, null);
    try {
      const response = await fetch(config.keyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof (data as Record<string, unknown>).error === 'string'
          ? String((data as Record<string, unknown>).error)
          : `${config.keyDisplayName} 키 저장에 실패했습니다.`);
      }
      setKeyFeedbackFor(id, { ok: true, msg: `${config.keyDisplayName} 키가 저장되었습니다.` });
      const settings = await loadModelSettings();
      if (settings && isApiKeyConfigured(settings.secrets, id)) {
        await loadCatalog(id);
      }
    } catch (error) {
      setKeyFeedbackFor(id, {
        ok: false,
        msg: error instanceof Error ? error.message : `${config.keyDisplayName} 키 저장에 실패했습니다.`,
      });
    } finally {
      setKeySavingFor(id, false);
    }
  }, [loadModelSettings, loadCatalog, setKeyFeedbackFor, setKeySavingFor]);

  const handleDeleteKey = useCallback(async (id: ProviderId) => {
    const config = PROVIDERS.find((p) => p.id === id);
    if (!config) return;
    setKeyDeletingFor(id, true);
    setKeyFeedbackFor(id, null);
    try {
      const response = await fetch(config.keyEndpoint, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof (data as Record<string, unknown>).error === 'string'
          ? String((data as Record<string, unknown>).error)
          : `${config.keyDisplayName} 키 제거에 실패했습니다.`);
      }
      setCatalogFor(id, []);
      setCatalogErrorFor(id, null);
      setKeyFeedbackFor(id, { ok: true, msg: `등록된 ${config.keyDisplayName} 키를 제거했습니다.` });
      await loadModelSettings();
    } catch (error) {
      setKeyFeedbackFor(id, {
        ok: false,
        msg: error instanceof Error ? error.message : `${config.keyDisplayName} 키 제거에 실패했습니다.`,
      });
    } finally {
      setKeyDeletingFor(id, false);
    }
  }, [loadModelSettings, setCatalogFor, setCatalogErrorFor, setKeyDeletingFor, setKeyFeedbackFor]);

  // ── Model selection toggles (generic) ────────────────────────────────────
  const handleToggleModel = useCallback((id: ProviderId, modelId: string) => {
    setSelectedModelIds((prev) => {
      const current = prev[id];
      if (current.includes(modelId)) {
        const next = current.filter((m) => m !== modelId);
        setDefaultModelIds((prevDefaults) => {
          if (prevDefaults[id] !== modelId) return prevDefaults;
          return { ...prevDefaults, [id]: next[0] ?? '' };
        });
        return { ...prev, [id]: next };
      }
      const next = [...current, modelId];
      const order = new Map(catalogItems[id].map((item, index) => [item.id, index]));
      next.sort(
        (left, right) =>
          (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER),
      );
      setDefaultModelIds((prevDefaults) => {
        if (prevDefaults[id]) return prevDefaults;
        return { ...prevDefaults, [id]: modelId };
      });
      return { ...prev, [id]: next };
    });
  }, [catalogItems]);

  const handleApplyRecommended = useCallback((id: ProviderId) => {
    const config = PROVIDERS.find((p) => p.id === id);
    if (!config) return;
    const items = catalogItems[id];
    if (id === 'codex') {
      if (items.length === 0) {
        setModelFeedbackFor(id, { ok: false, msg: '먼저 OpenAI 모델 카탈로그를 불러와 주세요.' });
        return;
      }
      const catalogModelIds = items.map((item) => item.id);
      const catalogModelIdSet = new Set(catalogModelIds);
      const manualModelIds = selectedModelIds[id].filter((modelId) => !catalogModelIdSet.has(modelId));
      const nextSelected = [...catalogModelIds, ...manualModelIds];
      setSelectedFor(id, nextSelected);
      setDefaultModelIds((prev) => ({
        ...prev,
        [id]: prev[id] && nextSelected.includes(prev[id]) ? prev[id] : (nextSelected[0] ?? ''),
      }));
      return;
    }
    const available = new Set(items.map((item) => item.id));
    const recommended = config.selectionDefaults.filter((modelId) => available.has(modelId));
    const nextSelected =
      items.length === 0
        ? [...config.selectionDefaults]
        : recommended.length > 0
          ? [...recommended]
          : [...config.selectionDefaults];
    setSelectedFor(id, nextSelected);
    setDefaultModelIds((prev) => ({ ...prev, [id]: nextSelected[0] ?? config.selectionDefaults[0] ?? '' }));
  }, [catalogItems, selectedModelIds, setSelectedFor, setModelFeedbackFor]);

  // ── Manual model id (Codex / supportsManualModelId only) ─────────────────
  const handleAddManualModel = useCallback((id: ProviderId, rawModelId: string) => {
    const config = PROVIDERS.find((p) => p.id === id);
    if (!config?.supportsManualModelId) return false;
    const normalizedModelId = sanitizeManualModelId(rawModelId);
    if (!normalizedModelId) {
      setModelFeedbackFor(id, {
        ok: false,
        msg: '모델명은 영문자/숫자로 시작하고 점(.), 밑줄(_), 하이픈(-), 콜론(:)만 포함할 수 있습니다.',
      });
      return false;
    }
    let duplicate = false;
    setSelectedModelIds((prev) => {
      const current = prev[id];
      if (current.includes(normalizedModelId)) {
        duplicate = true;
        return prev;
      }
      setDefaultModelIds((prevDefaults) => ({ ...prevDefaults, [id]: prevDefaults[id] || normalizedModelId }));
      return { ...prev, [id]: [...current, normalizedModelId] };
    });
    if (duplicate) {
      setModelFeedbackFor(id, { ok: false, msg: '이미 선택 목록에 있는 모델입니다.' });
      return false;
    }
    setModelFeedbackFor(id, {
      ok: true,
      msg: `${normalizedModelId} 모델을 추가했습니다. 저장을 누르면 반영됩니다.`,
    });
    return true;
  }, [setModelFeedbackFor]);

  const handleRemoveManualModel = useCallback((id: ProviderId, modelId: string) => {
    setSelectedModelIds((prev) => {
      const current = prev[id];
      if (!current.includes(modelId)) return prev;
      const next = current.filter((m) => m !== modelId);
      setDefaultModelIds((prevDefaults) => ({
        ...prevDefaults,
        [id]: prevDefaults[id] === modelId ? (next[0] ?? '') : prevDefaults[id],
      }));
      return { ...prev, [id]: next };
    });
    setModelFeedbackFor(id, {
      ok: true,
      msg: `${modelId} 모델을 목록에서 제거했습니다. 저장을 누르면 반영됩니다.`,
    });
  }, [setModelFeedbackFor]);

  // ── Save selection ───────────────────────────────────────────────────────
  const handleSetDefaultModel = useCallback((id: ProviderId, modelId: string) => {
    setDefaultFor(id, modelId);
  }, [setDefaultFor]);

  const handleModelSave = useCallback(async (id: ProviderId) => {
    const config = PROVIDERS.find((p) => p.id === id);
    if (!config) return;
    const currentSelected = selectedModelIds[id];
    if (currentSelected.length === 0) {
      setModelFeedbackFor(id, { ok: false, msg: `최소 1개 이상의 ${config.label} 모델을 선택해 주세요.` });
      return;
    }
    setModelSavingFor(id, true);
    setModelFeedbackFor(id, null);
    try {
      const providerPayload: Record<string, unknown> = {
        selectedModelIds: currentSelected,
        defaultModelId: defaultModelIds[id] || currentSelected[0] || null,
      };
      if (config.supportsGeminiModes) {
        providerPayload.defaultModeId = geminiDefaultModeId;
      }
      const response = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: { [id]: providerPayload } }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(`사용할 ${config.label} 모델 목록을 저장하지 못했습니다.`);
      setModelSettings(data);
      syncFromResponse(data);
      setModelFeedbackFor(id, { ok: true, msg: `${config.label} 사용할 모델 목록이 저장되었습니다.` });
    } catch (error) {
      setModelFeedbackFor(id, {
        ok: false,
        msg: error instanceof Error ? error.message : `${config.label} 모델 목록 저장에 실패했습니다.`,
      });
    } finally {
      setModelSavingFor(id, false);
    }
  }, [defaultModelIds, geminiDefaultModeId, selectedModelIds, setModelFeedbackFor, setModelSavingFor, syncFromResponse]);

  // ── Derived for the active provider ──────────────────────────────────────
  const activeConfig = PROVIDERS.find((p) => p.id === activeProvider) ?? PROVIDERS[0];
  const activeHasApiKey = isApiKeyConfigured(modelSettings.secrets, activeProvider);
  const activeKeySaving = keySaving[activeProvider];
  const activeKeyDeleting = keyDeleting[activeProvider];
  const activeKeyFeedback = keyFeedback[activeProvider];
  const activeCatalogItems = catalogItems[activeProvider];
  const activeSelectedModelIds = selectedModelIds[activeProvider];
  const activeDefaultModelId = defaultModelIds[activeProvider];
  const activeCatalogLoading = catalogLoading[activeProvider];
  const activeCatalogError = catalogError[activeProvider];
  const activeModelSaving = modelSaving[activeProvider];
  const activeModelFeedback = modelFeedback[activeProvider];

  const activeCatalogModelIdSet = new Set(activeCatalogItems.map((item) => item.id));
  const manualSelectedModelIds = activeConfig.supportsManualModelId
    ? activeSelectedModelIds.filter((modelId) => !activeCatalogModelIdSet.has(modelId))
    : [];

  // Filtered catalog rows
  const filteredCatalog = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return activeCatalogItems;
    return activeCatalogItems.filter((item) => (
      item.id.toLowerCase().includes(q)
      || item.label.toLowerCase().includes(q)
      || item.family.toLowerCase().includes(q)
      || item.tags.some((tag) => tag.toLowerCase().includes(q))
    ));
  }, [activeCatalogItems, deferredQuery]);

  // Auto-focus the key input when entering edit mode
  const keyInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (keyEditing) keyInputRef.current?.focus();
  }, [keyEditing]);

  // Wipe draft + close inline editor after successful save
  useEffect(() => {
    if (activeKeyFeedback?.ok) {
      setKeyDraft('');
      setKeyEditing(false);
    }
  }, [activeKeyFeedback]);

  const selectedCount = activeSelectedModelIds.length;
  const hasDefaultsToShow = activeSelectedModelIds.length > 0;

  // Default-model dropdown options for the active provider
  const defaultModelOptions = useMemo(() => {
    // Preserve the order in which models were selected.
    return [...activeSelectedModelIds];
  }, [activeSelectedModelIds]);

  return (
    <div className={styles.section}>
      {/* ─── Provider segmented control ─── */}
      <div className={styles.providerStrip} role="tablist" aria-label="Model provider">
        {PROVIDERS.map((provider) => {
          const active = provider.id === activeProvider;
          return (
            <button
              key={provider.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-pressed={active}
              aria-label={provider.label}
              data-provider={provider.id}
              className={`${styles.providerPill} ${active ? styles.providerPillActive : ''}`}
              onClick={() => setActiveProvider(provider.id)}
            >
              <span className={styles.providerLogoWrap} aria-hidden>
                <ProviderLogo provider={provider.id} className={styles.providerLogo} />
              </span>
              <span className={styles.providerName}>{provider.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── Credentials section ─── */}
      <SectionGroup
        eyebrow="Credentials"
        title={
          <span className={styles.titleWithLogo}>
            <ProviderLogo provider={activeProvider} className={styles.titleLogo} />
            <span>{activeConfig.label} API Key</span>
          </span>
        }
        subtitle="AES-256-GCM 암호화 · 워크스페이스 스코프 · 카탈로그 조회 전용"
      >
        <Row
          leadingIcon={<KeyMaskIcon hasKey={activeHasApiKey} />}
          label={activeConfig.keyLabel}
          description={
            activeHasApiKey
              ? '키가 등록되어 있습니다. 갱신하려면 새 키를 입력하세요.'
              : '아직 등록된 키가 없습니다. 카탈로그를 불러오려면 키를 등록해 주세요.'
          }
          trailing={
            <div className={styles.trailingGroup}>
              <StatusPill ok={activeHasApiKey} okLabel="Connected" pendLabel="Not configured" />
              {!keyEditing ? (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setKeyEditing(true)}
                  disabled={activeKeySaving || activeKeyDeleting}
                >
                  {activeHasApiKey ? '교체' : '등록'}
                </button>
              ) : null}
              {activeHasApiKey ? (
                <button
                  type="button"
                  className={`${styles.linkButton} ${styles.linkButtonDanger}`}
                  onClick={() => { void handleDeleteKey(activeProvider); }}
                  disabled={activeKeySaving || activeKeyDeleting}
                >
                  <Trash2 size={12} aria-hidden /> 제거
                </button>
              ) : null}
            </div>
          }
        />

        {keyEditing ? (
          <Row
            inset
            label={
              <label htmlFor="settings-key-input" className={styles.inlineLabel}>
                새 키 입력
              </label>
            }
            description={
              <div className={styles.inlineEditor}>
                <input
                  id="settings-key-input"
                  ref={keyInputRef}
                  className={styles.input}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={keyDraft}
                  onChange={(event) => setKeyDraft(event.target.value)}
                  placeholder={activeConfig.keyPlaceholder}
                />
                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => { void handleSaveKey(activeProvider, keyDraft); }}
                    disabled={activeKeySaving || keyDraft.trim().length < 20}
                  >
                    {activeKeySaving ? '저장 중…' : '저장'}
                  </button>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => { setKeyEditing(false); setKeyDraft(''); }}
                    disabled={activeKeySaving}
                  >
                    취소
                  </button>
                </div>
              </div>
            }
          />
        ) : null}

        {activeKeyFeedback ? (
          <FeedbackRow ok={activeKeyFeedback.ok} message={activeKeyFeedback.msg} />
        ) : null}
      </SectionGroup>

      {/* ─── Catalog section ─── */}
      <SectionGroup
        eyebrow="Catalog"
        title={
          <span className={styles.titleWithLogo}>
            <ProviderLogo provider={activeProvider} className={styles.titleLogo} />
            <span>{activeConfig.label} Models</span>
          </span>
        }
        subtitle={activeConfig.catalogHint}
        trailing={
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <Search size={14} className={styles.searchIcon} aria-hidden />
              <input
                className={styles.searchInput}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="모델 이름 · 태그"
                aria-label="모델 검색"
              />
            </div>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => { void loadCatalog(activeProvider); }}
              disabled={!activeHasApiKey || activeCatalogLoading}
            >
              {activeCatalogLoading ? (
                <LoaderCircle size={12} className={styles.spin} aria-hidden />
              ) : (
                <RefreshCw size={12} aria-hidden />
              )}
              새로고침
            </button>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => handleApplyRecommended(activeProvider)}
              disabled={!activeHasApiKey}
            >
              {activeConfig.applyPresetLabel}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => { void handleModelSave(activeProvider); }}
              disabled={!activeHasApiKey || activeModelSaving || selectedCount === 0}
            >
              {activeModelSaving ? '저장 중…' : `선택 저장 (${selectedCount})`}
            </button>
          </div>
        }
      >
        {!activeHasApiKey ? (
          <EmptyRow
            title={`${activeConfig.label} API 키를 먼저 등록해 주세요`}
            description="키 등록 후 카탈로그가 자동으로 로드됩니다."
          />
        ) : activeCatalogLoading ? (
          <EmptyRow title="카탈로그 로드 중…" description="잠시 후 다시 확인해 주세요." />
        ) : activeCatalogError ? (
          <EmptyRow title="카탈로그를 불러오지 못했습니다" description={activeCatalogError} />
        ) : filteredCatalog.length === 0 ? (
          <EmptyRow title="검색 결과가 없습니다" description="검색어를 비우면 전체 목록이 표시됩니다." />
        ) : (
          filteredCatalog.map((item) => {
            const selected = activeSelectedModelIds.includes(item.id);
            const isDefault = activeDefaultModelId === item.id;
            return (
              <ModelRow
                key={item.id}
                item={item}
                selected={selected}
                isDefault={isDefault}
                onToggle={() => handleToggleModel(activeProvider, item.id)}
                onSetDefault={
                  selected && !isDefault
                    ? () => handleSetDefaultModel(activeProvider, item.id)
                    : undefined
                }
              />
            );
          })
        )}

        {activeModelFeedback ? (
          <FeedbackRow ok={activeModelFeedback.ok} message={activeModelFeedback.msg} />
        ) : null}
      </SectionGroup>

      {/* ─── Manual additions (capability-gated) ─── */}
      {activeConfig.supportsManualModelId ? (
        <SectionGroup
          eyebrow="Manual"
          title="수동 추가 모델"
          subtitle={`${activeConfig.label} 카탈로그에 아직 보이지 않는 모델도 직접 추가할 수 있습니다.`}
        >
          <Row
            label={<label htmlFor="provider-manual-id" className={styles.inlineLabel}>모델 ID 추가</label>}
            description={
              <div className={styles.inlineEditor}>
                <input
                  id="provider-manual-id"
                  className={styles.input}
                  type="text"
                  value={manualModelId}
                  onChange={(event) => setManualModelId(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const trimmed = manualModelId.trim();
                      if (trimmed && handleAddManualModel(activeProvider, trimmed)) setManualModelId('');
                    }
                  }}
                  placeholder="예: gpt-5.5"
                  disabled={!activeHasApiKey}
                />
                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => {
                      const trimmed = manualModelId.trim();
                      if (trimmed && handleAddManualModel(activeProvider, trimmed)) setManualModelId('');
                    }}
                    disabled={!activeHasApiKey || !manualModelId.trim()}
                  >
                    <Plus size={12} aria-hidden /> 추가
                  </button>
                </div>
              </div>
            }
          />

          {manualSelectedModelIds.length > 0 ? (
            manualSelectedModelIds.map((modelId) => (
              <Row
                key={modelId}
                leadingIcon={<DotIcon />}
                label={<span className={styles.monoId}>{modelId}</span>}
                description="수동 추가 — 카탈로그 외 모델"
                trailing={
                  <button
                    type="button"
                    className={`${styles.linkButton} ${styles.linkButtonDanger}`}
                    onClick={() => handleRemoveManualModel(activeProvider, modelId)}
                  >
                    <X size={12} aria-hidden /> 제거
                  </button>
                }
              />
            ))
          ) : (
            <Row description="수동 추가된 모델이 없습니다." />
          )}
        </SectionGroup>
      ) : null}

      {/* ─── Defaults section ─── always rendered once the API key exists so
            users see the picker (and its empty-state hint) even before they
            enable any models. */}
      {activeHasApiKey ? (
        <SectionGroup
          eyebrow="Defaults"
          title={
            <span className={styles.titleWithLogo}>
              <ProviderLogo provider={activeProvider} className={styles.titleLogo} />
              <span>{activeConfig.defaultsTitle}</span>
            </span>
          }
          subtitle={activeConfig.defaultsSubtitle}
        >
          <Row
            label={<label htmlFor="provider-default-model" className={styles.inlineLabel}>기본 모델</label>}
            description={
              hasDefaultsToShow
                ? (activeDefaultModelId
                    ? `현재: ${activeDefaultModelId}`
                    : 'ProjectChatSurface 모델 selector가 비어있을 때 사용됩니다.')
                : '활성화된 모델이 없습니다 — 카탈로그에서 모델을 켜세요.'
            }
            trailing={
              <select
                id="provider-default-model"
                className={styles.select}
                value={activeDefaultModelId}
                onChange={(event) => handleSetDefaultModel(activeProvider, event.target.value)}
                disabled={!hasDefaultsToShow}
                aria-label={`${activeConfig.label} 기본 모델 선택`}
              >
                {!hasDefaultsToShow ? (
                  <option value="">선택된 모델이 없습니다</option>
                ) : null}
                {defaultModelOptions.map((modelId) => (
                  <option key={modelId} value={modelId}>{modelId}</option>
                ))}
              </select>
            }
          />
          {activeConfig.supportsGeminiModes ? (
            <Row
              label={<label htmlFor="provider-default-mode" className={styles.inlineLabel}>기본 모드</label>}
              description="새 Gemini 채팅의 추론 모드 초기값."
              trailing={
                <select
                  id="provider-default-mode"
                  className={styles.select}
                  value={geminiDefaultModeId}
                  onChange={(event) => setGeminiDefaultModeId(event.target.value)}
                  aria-label="Gemini 기본 모드 선택"
                >
                  {GEMINI_MODE_SELECTION_OPTIONS.map((mode) => (
                    <option key={mode.id} value={mode.id}>{mode.label}</option>
                  ))}
                </select>
              }
            />
          ) : null}
        </SectionGroup>
      ) : null}
    </div>
  );
}
