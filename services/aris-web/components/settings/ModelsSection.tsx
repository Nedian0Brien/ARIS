'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Check,
  CheckCircle2,
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
import styles from './ModelsSection.module.css';

type Feedback = { ok: boolean; msg: string } | null;
type CatalogItem = OpenAiCatalogItem | ClaudeCatalogItem | GeminiCatalogItem;

const PROVIDER_OPTIONS: Array<{
  id: ProviderId;
  label: string;
  initials: string;
  keyLabel: string;
  keyPlaceholder: string;
  catalogHint: string;
}> = [
  {
    id: 'codex',
    label: 'Codex',
    initials: 'OA',
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
    catalogHint: 'OpenAI /v1/models 카탈로그',
  },
  {
    id: 'claude',
    label: 'Claude',
    initials: 'AN',
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-...',
    catalogHint: 'Anthropic /v1/models 카탈로그',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    initials: 'GO',
    keyLabel: 'Google AI Studio API Key',
    keyPlaceholder: 'AIza...',
    catalogHint: 'Google AI /v1beta/models 카탈로그',
  },
];

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
  const [activeProvider, setActiveProvider] = useState<ProviderId>('codex');

  // Codex 상태
  const [codexCatalogItems, setCodexCatalogItems] = useState<OpenAiCatalogItem[]>([]);
  const [selectedCodexModelIds, setSelectedCodexModelIds] = useState<string[]>([]);
  const [selectedCodexDefaultModelId, setSelectedCodexDefaultModelId] = useState<string>('');
  const [codexModelSaving, setCodexModelSaving] = useState(false);
  const [codexModelFeedback, setCodexModelFeedback] = useState<Feedback>(null);
  const [codexCatalogLoading, setCodexCatalogLoading] = useState(false);
  const [codexCatalogError, setCodexCatalogError] = useState<string | null>(null);
  const [codexKeySaving, setCodexKeySaving] = useState(false);
  const [codexKeyDeleting, setCodexKeyDeleting] = useState(false);
  const [codexKeyFeedback, setCodexKeyFeedback] = useState<Feedback>(null);

  // Claude 상태
  const [claudeCatalogItems, setClaudeCatalogItems] = useState<ClaudeCatalogItem[]>([]);
  const [selectedClaudeModelIds, setSelectedClaudeModelIds] = useState<string[]>([...DEFAULT_CLAUDE_MODEL_SELECTIONS]);
  const [claudeModelSaving, setClaudeModelSaving] = useState(false);
  const [claudeModelFeedback, setClaudeModelFeedback] = useState<Feedback>(null);
  const [claudeCatalogLoading, setClaudeCatalogLoading] = useState(false);
  const [claudeCatalogError, setClaudeCatalogError] = useState<string | null>(null);
  const [claudeKeySaving, setClaudeKeySaving] = useState(false);
  const [claudeKeyDeleting, setClaudeKeyDeleting] = useState(false);
  const [claudeKeyFeedback, setClaudeKeyFeedback] = useState<Feedback>(null);

  // Gemini 상태
  const [geminiCatalogItems, setGeminiCatalogItems] = useState<GeminiCatalogItem[]>([]);
  const [selectedGeminiModelIds, setSelectedGeminiModelIds] = useState<string[]>([...DEFAULT_GEMINI_MODEL_SELECTIONS]);
  const [selectedGeminiDefaultModelId, setSelectedGeminiDefaultModelId] = useState<string>(DEFAULT_GEMINI_MODEL_SELECTIONS[0]);
  const [selectedGeminiDefaultModeId, setSelectedGeminiDefaultModeId] = useState<string>(DEFAULT_GEMINI_MODE_ID);
  const [geminiModelSaving, setGeminiModelSaving] = useState(false);
  const [geminiModelFeedback, setGeminiModelFeedback] = useState<Feedback>(null);
  const [geminiCatalogLoading, setGeminiCatalogLoading] = useState(false);
  const [geminiCatalogError, setGeminiCatalogError] = useState<string | null>(null);
  const [geminiKeySaving, setGeminiKeySaving] = useState(false);
  const [geminiKeyDeleting, setGeminiKeyDeleting] = useState(false);
  const [geminiKeyFeedback, setGeminiKeyFeedback] = useState<Feedback>(null);

  // UI-local
  const [keyEditing, setKeyEditing] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [query, setQuery] = useState('');
  const [manualModelId, setManualModelId] = useState('');
  const deferredQuery = useDeferredValue(query);

  const syncCodexSelection = useCallback((settings: ModelSettingsResponse) => {
    const persisted = settings.providers.codex.selectedModelIds;
    const nextSelected = persisted.length > 0 ? persisted : [];
    setSelectedCodexModelIds(nextSelected);
    setSelectedCodexDefaultModelId(settings.providers.codex.defaultModelId ?? nextSelected[0] ?? '');
  }, []);

  const syncClaudeSelection = useCallback((settings: ModelSettingsResponse) => {
    const persisted = settings.providers.claude.selectedModelIds;
    setSelectedClaudeModelIds(persisted.length > 0 ? persisted : [...DEFAULT_CLAUDE_MODEL_SELECTIONS]);
  }, []);

  const syncGeminiSelection = useCallback((settings: ModelSettingsResponse) => {
    const persisted = settings.providers.gemini.selectedModelIds;
    const nextSelected = persisted.length > 0 ? persisted : [...DEFAULT_GEMINI_MODEL_SELECTIONS];
    setSelectedGeminiModelIds(nextSelected);
    setSelectedGeminiDefaultModelId(settings.providers.gemini.defaultModelId ?? nextSelected[0] ?? DEFAULT_GEMINI_MODEL_SELECTIONS[0]);
    setSelectedGeminiDefaultModeId(settings.providers.gemini.defaultModeId ?? DEFAULT_GEMINI_MODE_ID);
  }, []);

  const loadModelSettings = useCallback(async (): Promise<ModelSettingsResponse | null> => {
    try {
      const response = await fetch('/api/settings/models');
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error('모델 설정을 불러오지 못했습니다.');
      }
      setModelSettings(data);
      syncCodexSelection(data);
      syncClaudeSelection(data);
      syncGeminiSelection(data);
      return data;
    } catch (error) {
      setCodexModelFeedback({
        ok: false,
        msg: error instanceof Error ? error.message : '모델 설정을 불러오지 못했습니다.',
      });
      return null;
    }
  }, [syncClaudeSelection, syncCodexSelection, syncGeminiSelection]);

  const loadCodexCatalog = useCallback(async () => {
    setCodexCatalogLoading(true);
    setCodexCatalogError(null);
    try {
      const response = await fetch('/api/settings/models/catalog/openai');
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error('모델 카탈로그를 불러오지 못했습니다.');
      setCodexCatalogItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      setCodexCatalogItems([]);
      setCodexCatalogError(error instanceof Error ? error.message : '모델 카탈로그를 불러오지 못했습니다.');
    } finally {
      setCodexCatalogLoading(false);
    }
  }, []);

  const loadClaudeCatalog = useCallback(async () => {
    setClaudeCatalogLoading(true);
    setClaudeCatalogError(null);
    try {
      const response = await fetch('/api/settings/models/catalog/claude');
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error('Claude 모델 카탈로그를 불러오지 못했습니다.');
      setClaudeCatalogItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      setClaudeCatalogItems([]);
      setClaudeCatalogError(error instanceof Error ? error.message : 'Claude 모델 카탈로그를 불러오지 못했습니다.');
    } finally {
      setClaudeCatalogLoading(false);
    }
  }, []);

  const loadGeminiCatalog = useCallback(async () => {
    setGeminiCatalogLoading(true);
    setGeminiCatalogError(null);
    try {
      const response = await fetch('/api/settings/models/catalog/gemini');
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error('Gemini 모델 카탈로그를 불러오지 못했습니다.');
      setGeminiCatalogItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      setGeminiCatalogItems([]);
      setGeminiCatalogError(error instanceof Error ? error.message : 'Gemini 모델 카탈로그를 불러오지 못했습니다.');
    } finally {
      setGeminiCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadModelSettings().then((settings) => {
      if (settings?.secrets.openAiApiKeyConfigured) void loadCodexCatalog();
      if (settings?.secrets.claudeApiKeyConfigured) void loadClaudeCatalog();
      if (settings?.secrets.geminiApiKeyConfigured) void loadGeminiCatalog();
    });
  }, [loadClaudeCatalog, loadCodexCatalog, loadGeminiCatalog, loadModelSettings]);

  // Reset transient UI when provider changes
  useEffect(() => {
    setKeyEditing(false);
    setKeyDraft('');
    setQuery('');
    setManualModelId('');
  }, [activeProvider]);

  // Codex key handlers
  const handleSaveCodexKey = useCallback(async (apiKey: string) => {
    if (apiKey.trim().length < 20) {
      setCodexKeyFeedback({ ok: false, msg: '유효한 OpenAI API 키를 입력해 주세요.' });
      return;
    }
    setCodexKeySaving(true);
    setCodexKeyFeedback(null);
    try {
      const response = await fetch('/api/settings/openai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'OpenAI API 키 저장에 실패했습니다.');
      setCodexKeyFeedback({ ok: true, msg: 'OpenAI API 키가 저장되었습니다.' });
      const settings = await loadModelSettings();
      if (settings?.secrets.openAiApiKeyConfigured) await loadCodexCatalog();
    } catch (error) {
      setCodexKeyFeedback({ ok: false, msg: error instanceof Error ? error.message : 'OpenAI API 키 저장에 실패했습니다.' });
    } finally {
      setCodexKeySaving(false);
    }
  }, [loadModelSettings, loadCodexCatalog]);

  const handleDeleteCodexKey = useCallback(async () => {
    setCodexKeyDeleting(true);
    setCodexKeyFeedback(null);
    try {
      const response = await fetch('/api/settings/openai-key', { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'OpenAI API 키 제거에 실패했습니다.');
      setCodexCatalogItems([]);
      setCodexCatalogError(null);
      setCodexKeyFeedback({ ok: true, msg: '등록된 OpenAI API 키를 제거했습니다.' });
      await loadModelSettings();
    } catch (error) {
      setCodexKeyFeedback({ ok: false, msg: error instanceof Error ? error.message : 'OpenAI API 키 제거에 실패했습니다.' });
    } finally {
      setCodexKeyDeleting(false);
    }
  }, [loadModelSettings]);

  // Claude key handlers
  const handleSaveClaudeKey = useCallback(async (apiKey: string) => {
    if (apiKey.trim().length < 20) {
      setClaudeKeyFeedback({ ok: false, msg: '유효한 Anthropic API 키를 입력해 주세요.' });
      return;
    }
    setClaudeKeySaving(true);
    setClaudeKeyFeedback(null);
    try {
      const response = await fetch('/api/settings/claude-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Anthropic API 키 저장에 실패했습니다.');
      setClaudeKeyFeedback({ ok: true, msg: 'Anthropic API 키가 저장되었습니다.' });
      const settings = await loadModelSettings();
      if (settings?.secrets.claudeApiKeyConfigured) await loadClaudeCatalog();
    } catch (error) {
      setClaudeKeyFeedback({ ok: false, msg: error instanceof Error ? error.message : 'Anthropic API 키 저장에 실패했습니다.' });
    } finally {
      setClaudeKeySaving(false);
    }
  }, [loadModelSettings, loadClaudeCatalog]);

  const handleDeleteClaudeKey = useCallback(async () => {
    setClaudeKeyDeleting(true);
    setClaudeKeyFeedback(null);
    try {
      const response = await fetch('/api/settings/claude-key', { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Anthropic API 키 제거에 실패했습니다.');
      setClaudeCatalogItems([]);
      setClaudeCatalogError(null);
      setClaudeKeyFeedback({ ok: true, msg: '등록된 Anthropic API 키를 제거했습니다.' });
      await loadModelSettings();
    } catch (error) {
      setClaudeKeyFeedback({ ok: false, msg: error instanceof Error ? error.message : 'Anthropic API 키 제거에 실패했습니다.' });
    } finally {
      setClaudeKeyDeleting(false);
    }
  }, [loadModelSettings]);

  // Gemini key handlers
  const handleSaveGeminiKey = useCallback(async (apiKey: string) => {
    if (apiKey.trim().length < 20) {
      setGeminiKeyFeedback({ ok: false, msg: '유효한 Google AI Studio API 키를 입력해 주세요.' });
      return;
    }
    setGeminiKeySaving(true);
    setGeminiKeyFeedback(null);
    try {
      const response = await fetch('/api/settings/gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Google AI Studio API 키 저장에 실패했습니다.');
      setGeminiKeyFeedback({ ok: true, msg: 'Google AI Studio API 키가 저장되었습니다.' });
      const settings = await loadModelSettings();
      if (settings?.secrets.geminiApiKeyConfigured) await loadGeminiCatalog();
    } catch (error) {
      setGeminiKeyFeedback({ ok: false, msg: error instanceof Error ? error.message : 'Google AI Studio API 키 저장에 실패했습니다.' });
    } finally {
      setGeminiKeySaving(false);
    }
  }, [loadGeminiCatalog, loadModelSettings]);

  const handleDeleteGeminiKey = useCallback(async () => {
    setGeminiKeyDeleting(true);
    setGeminiKeyFeedback(null);
    try {
      const response = await fetch('/api/settings/gemini-key', { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Google AI Studio API 키 제거에 실패했습니다.');
      setGeminiCatalogItems([]);
      setGeminiCatalogError(null);
      setGeminiKeyFeedback({ ok: true, msg: '등록된 Google AI Studio API 키를 제거했습니다.' });
      await loadModelSettings();
    } catch (error) {
      setGeminiKeyFeedback({ ok: false, msg: error instanceof Error ? error.message : 'Google AI Studio API 키 제거에 실패했습니다.' });
    } finally {
      setGeminiKeyDeleting(false);
    }
  }, [loadModelSettings]);

  // Model toggles
  const handleToggleCodexModel = useCallback((modelId: string) => {
    setSelectedCodexModelIds((prev) => {
      if (prev.includes(modelId)) {
        const next = prev.filter((item) => item !== modelId);
        setSelectedCodexDefaultModelId((current) => (current === modelId ? (next[0] ?? '') : current));
        return next;
      }
      const next = [...prev, modelId];
      const order = new Map(codexCatalogItems.map((item, index) => [item.id, index]));
      next.sort((left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER));
      setSelectedCodexDefaultModelId((current) => current || next[0] || '');
      return next;
    });
  }, [codexCatalogItems]);

  const handleApplyRecommendedCodexModels = useCallback(() => {
    if (codexCatalogItems.length === 0) {
      setCodexModelFeedback({ ok: false, msg: '먼저 OpenAI 모델 카탈로그를 불러와 주세요.' });
      return;
    }
    const catalogModelIds = codexCatalogItems.map((item) => item.id);
    const catalogModelIdSet = new Set(catalogModelIds);
    const manualModelIds = selectedCodexModelIds.filter((modelId) => !catalogModelIdSet.has(modelId));
    const nextSelected = [...catalogModelIds, ...manualModelIds];
    setSelectedCodexModelIds(nextSelected);
    setSelectedCodexDefaultModelId((current) => (current && nextSelected.includes(current) ? current : (nextSelected[0] ?? '')));
  }, [codexCatalogItems, selectedCodexModelIds]);

  const handleAddCodexManualModel = useCallback((rawModelId: string) => {
    const normalizedModelId = sanitizeManualModelId(rawModelId);
    if (!normalizedModelId) {
      setCodexModelFeedback({
        ok: false,
        msg: '모델명은 영문자/숫자로 시작하고 점(.), 밑줄(_), 하이픈(-), 콜론(:)만 포함할 수 있습니다.',
      });
      return false;
    }
    let duplicate = false;
    setSelectedCodexModelIds((prev) => {
      if (prev.includes(normalizedModelId)) {
        duplicate = true;
        return prev;
      }
      setSelectedCodexDefaultModelId((current) => current || normalizedModelId);
      return [...prev, normalizedModelId];
    });
    if (duplicate) {
      setCodexModelFeedback({ ok: false, msg: '이미 선택 목록에 있는 모델입니다.' });
      return false;
    }
    setCodexModelFeedback({ ok: true, msg: `${normalizedModelId} 모델을 추가했습니다. 저장을 누르면 반영됩니다.` });
    return true;
  }, []);

  const handleRemoveCodexManualModel = useCallback((modelId: string) => {
    setSelectedCodexModelIds((prev) => {
      if (!prev.includes(modelId)) return prev;
      const next = prev.filter((item) => item !== modelId);
      setSelectedCodexDefaultModelId((current) => (current === modelId ? (next[0] ?? '') : current));
      return next;
    });
    setCodexModelFeedback({ ok: true, msg: `${modelId} 모델을 목록에서 제거했습니다. 저장을 누르면 반영됩니다.` });
  }, []);

  const handleCodexModelSave = useCallback(async () => {
    if (selectedCodexModelIds.length === 0) {
      setCodexModelFeedback({ ok: false, msg: '최소 1개 이상의 Codex 모델을 선택해 주세요.' });
      return;
    }
    setCodexModelSaving(true);
    setCodexModelFeedback(null);
    try {
      const response = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providers: {
            codex: { selectedModelIds: selectedCodexModelIds, defaultModelId: selectedCodexDefaultModelId },
          },
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error('사용할 Codex 모델 목록을 저장하지 못했습니다.');
      setModelSettings(data);
      syncCodexSelection(data);
      setCodexModelFeedback({ ok: true, msg: 'Codex 사용할 모델 목록이 저장되었습니다.' });
    } catch (error) {
      setCodexModelFeedback({ ok: false, msg: error instanceof Error ? error.message : 'Codex 모델 목록 저장에 실패했습니다.' });
    } finally {
      setCodexModelSaving(false);
    }
  }, [selectedCodexDefaultModelId, selectedCodexModelIds, syncCodexSelection]);

  const handleToggleClaudeModel = useCallback((modelId: string) => {
    setSelectedClaudeModelIds((prev) => {
      if (prev.includes(modelId)) return prev.filter((item) => item !== modelId);
      const next = [...prev, modelId];
      const order = new Map(claudeCatalogItems.map((item, index) => [item.id, index]));
      next.sort((left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER));
      return next;
    });
  }, [claudeCatalogItems]);

  const handleApplyRecommendedClaudeModels = useCallback(() => {
    if (claudeCatalogItems.length === 0) {
      setSelectedClaudeModelIds([...DEFAULT_CLAUDE_MODEL_SELECTIONS]);
      return;
    }
    const available = new Set(claudeCatalogItems.map((item) => item.id));
    const recommended = DEFAULT_CLAUDE_MODEL_SELECTIONS.filter((modelId) => available.has(modelId));
    setSelectedClaudeModelIds(recommended.length > 0 ? [...recommended] : [...DEFAULT_CLAUDE_MODEL_SELECTIONS]);
  }, [claudeCatalogItems]);

  const handleClaudeModelSave = useCallback(async () => {
    if (selectedClaudeModelIds.length === 0) {
      setClaudeModelFeedback({ ok: false, msg: '최소 1개 이상의 Claude 모델을 선택해 주세요.' });
      return;
    }
    setClaudeModelSaving(true);
    setClaudeModelFeedback(null);
    try {
      const response = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: { claude: { selectedModelIds: selectedClaudeModelIds } } }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error('사용할 Claude 모델 목록을 저장하지 못했습니다.');
      setModelSettings(data);
      syncClaudeSelection(data);
      setClaudeModelFeedback({ ok: true, msg: 'Claude 사용할 모델 목록이 저장되었습니다.' });
    } catch (error) {
      setClaudeModelFeedback({ ok: false, msg: error instanceof Error ? error.message : 'Claude 모델 목록 저장에 실패했습니다.' });
    } finally {
      setClaudeModelSaving(false);
    }
  }, [selectedClaudeModelIds, syncClaudeSelection]);

  const handleToggleGeminiModel = useCallback((modelId: string) => {
    setSelectedGeminiModelIds((prev) => {
      if (prev.includes(modelId)) {
        const next = prev.filter((item) => item !== modelId);
        setSelectedGeminiDefaultModelId((current) => (current === modelId ? (next[0] ?? DEFAULT_GEMINI_MODEL_SELECTIONS[0]) : current));
        return next;
      }
      const next = [...prev, modelId];
      const order = new Map(geminiCatalogItems.map((item, index) => [item.id, index]));
      next.sort((left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER));
      setSelectedGeminiDefaultModelId((current) => current || next[0] || DEFAULT_GEMINI_MODEL_SELECTIONS[0]);
      return next;
    });
  }, [geminiCatalogItems]);

  const handleApplyRecommendedGeminiModels = useCallback(() => {
    if (geminiCatalogItems.length === 0) {
      setSelectedGeminiModelIds([...DEFAULT_GEMINI_MODEL_SELECTIONS]);
      setSelectedGeminiDefaultModelId(DEFAULT_GEMINI_MODEL_SELECTIONS[0]);
      return;
    }
    const available = new Set(geminiCatalogItems.map((item) => item.id));
    const recommended = DEFAULT_GEMINI_MODEL_SELECTIONS.filter((modelId) => available.has(modelId));
    const nextSelected = recommended.length > 0 ? [...recommended] : [...DEFAULT_GEMINI_MODEL_SELECTIONS];
    setSelectedGeminiModelIds(nextSelected);
    setSelectedGeminiDefaultModelId(nextSelected[0] ?? DEFAULT_GEMINI_MODEL_SELECTIONS[0]);
  }, [geminiCatalogItems]);

  const handleGeminiModelSave = useCallback(async () => {
    if (selectedGeminiModelIds.length === 0) {
      setGeminiModelFeedback({ ok: false, msg: '최소 1개 이상의 Gemini 모델을 선택해 주세요.' });
      return;
    }
    setGeminiModelSaving(true);
    setGeminiModelFeedback(null);
    try {
      const response = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providers: {
            gemini: {
              selectedModelIds: selectedGeminiModelIds,
              defaultModelId: selectedGeminiDefaultModelId,
              defaultModeId: selectedGeminiDefaultModeId,
            },
          },
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error('사용할 Gemini 모델 목록을 저장하지 못했습니다.');
      setModelSettings(data);
      syncGeminiSelection(data);
      setGeminiModelFeedback({ ok: true, msg: 'Gemini 사용할 모델 목록이 저장되었습니다.' });
    } catch (error) {
      setGeminiModelFeedback({ ok: false, msg: error instanceof Error ? error.message : 'Gemini 모델 목록 저장에 실패했습니다.' });
    } finally {
      setGeminiModelSaving(false);
    }
  }, [selectedGeminiDefaultModelId, selectedGeminiDefaultModeId, selectedGeminiModelIds, syncGeminiSelection]);

  // ── Active provider derivation ────────────────────────────────────────
  const isCodex = activeProvider === 'codex';
  const isClaude = activeProvider === 'claude';
  const isGemini = activeProvider === 'gemini';
  const activeMeta = PROVIDER_OPTIONS.find((option) => option.id === activeProvider) ?? PROVIDER_OPTIONS[0];

  const activeHasApiKey = isCodex
    ? modelSettings.secrets.openAiApiKeyConfigured
    : isClaude
      ? modelSettings.secrets.claudeApiKeyConfigured
      : modelSettings.secrets.geminiApiKeyConfigured;

  const activeKeySaving = isCodex ? codexKeySaving : isClaude ? claudeKeySaving : geminiKeySaving;
  const activeKeyDeleting = isCodex ? codexKeyDeleting : isClaude ? claudeKeyDeleting : geminiKeyDeleting;
  const activeKeyFeedback = isCodex ? codexKeyFeedback : isClaude ? claudeKeyFeedback : geminiKeyFeedback;
  const handleActiveKeySave = isCodex ? handleSaveCodexKey : isClaude ? handleSaveClaudeKey : handleSaveGeminiKey;
  const handleActiveKeyDelete = isCodex ? handleDeleteCodexKey : isClaude ? handleDeleteClaudeKey : handleDeleteGeminiKey;

  const activeCatalogItems: CatalogItem[] = isCodex ? codexCatalogItems : isClaude ? claudeCatalogItems : geminiCatalogItems;
  const activeSelectedModelIds = isCodex ? selectedCodexModelIds : isClaude ? selectedClaudeModelIds : selectedGeminiModelIds;
  const codexCatalogModelIdSet = new Set(codexCatalogItems.map((item) => item.id));
  const manualCodexModelIds = selectedCodexModelIds.filter((modelId) => !codexCatalogModelIdSet.has(modelId));
  const activeCatalogLoading = isCodex ? codexCatalogLoading : isClaude ? claudeCatalogLoading : geminiCatalogLoading;
  const activeModelSaving = isCodex ? codexModelSaving : isClaude ? claudeModelSaving : geminiModelSaving;
  const activeCatalogError = isCodex ? codexCatalogError : isClaude ? claudeCatalogError : geminiCatalogError;
  const activeModelFeedback = isCodex ? codexModelFeedback : isClaude ? claudeModelFeedback : geminiModelFeedback;
  const handleActiveToggle = isCodex ? handleToggleCodexModel : isClaude ? handleToggleClaudeModel : handleToggleGeminiModel;
  const handleActiveRefresh = isCodex ? loadCodexCatalog : isClaude ? loadClaudeCatalog : loadGeminiCatalog;
  const handleActiveModelSave = isCodex ? handleCodexModelSave : isClaude ? handleClaudeModelSave : handleGeminiModelSave;
  const handleActiveApplyRecommended = isCodex
    ? handleApplyRecommendedCodexModels
    : isClaude
      ? handleApplyRecommendedClaudeModels
      : handleApplyRecommendedGeminiModels;

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

  const applyPresetLabel = isCodex ? '카탈로그 전체 적용' : '권장 세트 적용';
  const selectedCount = activeSelectedModelIds.length;

  const codexDefaultRows = isCodex && selectedCodexModelIds.length > 0;
  const geminiDefaultRows = isGemini && selectedGeminiModelIds.length > 0;

  return (
    <div className={styles.section}>
      {/* ─── Provider segmented control ─── */}
      <div className={styles.providerStrip} role="tablist" aria-label="Model provider">
        {PROVIDER_OPTIONS.map((provider) => {
          const active = provider.id === activeProvider;
          return (
            <button
              key={provider.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-provider={provider.id}
              className={`${styles.providerPill} ${active ? styles.providerPillActive : ''}`}
              onClick={() => setActiveProvider(provider.id)}
            >
              <span className={styles.providerInitials} aria-hidden>{provider.initials}</span>
              <span className={styles.providerName}>{provider.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── Credentials section ─── */}
      <SectionGroup
        eyebrow="Credentials"
        title={`${activeMeta.label} API Key`}
        subtitle="AES-256-GCM 암호화 · 워크스페이스 스코프 · 카탈로그 조회 전용"
      >
        <Row
          leadingIcon={<KeyMaskIcon hasKey={activeHasApiKey} />}
          label={activeMeta.keyLabel}
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
                  onClick={() => { void handleActiveKeyDelete(); }}
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
                  placeholder={activeMeta.keyPlaceholder}
                />
                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => { void handleActiveKeySave(keyDraft); }}
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
        title={`${activeMeta.label} Models`}
        subtitle={activeMeta.catalogHint}
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
              onClick={() => { void handleActiveRefresh(); }}
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
              onClick={handleActiveApplyRecommended}
              disabled={!activeHasApiKey}
            >
              {applyPresetLabel}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => { void handleActiveModelSave(); }}
              disabled={!activeHasApiKey || activeModelSaving || selectedCount === 0}
            >
              {activeModelSaving ? '저장 중…' : `선택 저장 (${selectedCount})`}
            </button>
          </div>
        }
      >
        {!activeHasApiKey ? (
          <EmptyRow
            title={`${activeMeta.label} API 키를 먼저 등록해 주세요`}
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
            const isDefault = isCodex
              ? item.id === selectedCodexDefaultModelId
              : isGemini
                ? item.id === selectedGeminiDefaultModelId
                : false;
            return (
              <ModelRow
                key={item.id}
                item={item}
                selected={selected}
                isDefault={isDefault}
                onToggle={() => handleActiveToggle(item.id)}
              />
            );
          })
        )}

        {activeModelFeedback ? (
          <FeedbackRow ok={activeModelFeedback.ok} message={activeModelFeedback.msg} />
        ) : null}
      </SectionGroup>

      {/* ─── Codex manual additions ─── */}
      {isCodex ? (
        <SectionGroup
          eyebrow="Manual"
          title="수동 추가 모델"
          subtitle="OpenAI 카탈로그에 아직 보이지 않는 모델도 직접 추가할 수 있습니다."
        >
          <Row
            label={<label htmlFor="codex-manual-id" className={styles.inlineLabel}>모델 ID 추가</label>}
            description={
              <div className={styles.inlineEditor}>
                <input
                  id="codex-manual-id"
                  className={styles.input}
                  type="text"
                  value={manualModelId}
                  onChange={(event) => setManualModelId(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const trimmed = manualModelId.trim();
                      if (trimmed && handleAddCodexManualModel(trimmed)) setManualModelId('');
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
                      if (trimmed && handleAddCodexManualModel(trimmed)) setManualModelId('');
                    }}
                    disabled={!activeHasApiKey || !manualModelId.trim()}
                  >
                    <Plus size={12} aria-hidden /> 추가
                  </button>
                </div>
              </div>
            }
          />

          {manualCodexModelIds.length > 0 ? (
            manualCodexModelIds.map((modelId) => (
              <Row
                key={modelId}
                leadingIcon={<DotIcon />}
                label={<span className={styles.monoId}>{modelId}</span>}
                description="수동 추가 — 카탈로그 외 모델"
                trailing={
                  <button
                    type="button"
                    className={`${styles.linkButton} ${styles.linkButtonDanger}`}
                    onClick={() => handleRemoveCodexManualModel(modelId)}
                  >
                    <X size={12} aria-hidden /> 제거
                  </button>
                }
              />
            ))
          ) : (
            <Row
              description="수동 추가된 모델이 없습니다."
            />
          )}
        </SectionGroup>
      ) : null}

      {/* ─── Codex defaults ─── */}
      {codexDefaultRows ? (
        <SectionGroup
          eyebrow="Defaults"
          title="Codex 기본 실행값"
          subtitle="새 Codex 채팅의 초기 모델을 정의합니다. 브라우저의 마지막 선택이 있으면 그쪽이 우선합니다."
        >
          <Row
            label={<label htmlFor="codex-default-model" className={styles.inlineLabel}>기본 모델</label>}
            description="선택 목록 중 하나를 새 채팅의 초기 모델로 사용합니다."
            trailing={
              <select
                id="codex-default-model"
                className={styles.select}
                value={selectedCodexDefaultModelId}
                onChange={(event) => setSelectedCodexDefaultModelId(event.target.value)}
                disabled={selectedCodexModelIds.length === 0}
              >
                {selectedCodexModelIds.map((modelId) => (
                  <option key={modelId} value={modelId}>{modelId}</option>
                ))}
              </select>
            }
          />
        </SectionGroup>
      ) : null}

      {/* ─── Gemini defaults ─── */}
      {geminiDefaultRows ? (
        <SectionGroup
          eyebrow="Defaults"
          title="Gemini 기본 실행값"
          subtitle="새 Gemini 채팅의 초기 모델과 모드를 정의합니다. ACP capability는 다시 조회하지 않습니다."
        >
          <Row
            label={<label htmlFor="gemini-default-model" className={styles.inlineLabel}>기본 모델</label>}
            description="새 Gemini 채팅이 이 모델로 시작합니다."
            trailing={
              <select
                id="gemini-default-model"
                className={styles.select}
                value={selectedGeminiDefaultModelId}
                onChange={(event) => setSelectedGeminiDefaultModelId(event.target.value)}
                disabled={selectedGeminiModelIds.length === 0}
              >
                {selectedGeminiModelIds.map((modelId) => (
                  <option key={modelId} value={modelId}>{modelId}</option>
                ))}
              </select>
            }
          />
          <Row
            label={<label htmlFor="gemini-default-mode" className={styles.inlineLabel}>기본 모드</label>}
            description="새 Gemini 채팅의 추론 모드 초기값."
            trailing={
              <select
                id="gemini-default-mode"
                className={styles.select}
                value={selectedGeminiDefaultModeId}
                onChange={(event) => setSelectedGeminiDefaultModeId(event.target.value)}
              >
                {GEMINI_MODE_SELECTION_OPTIONS.map((mode) => (
                  <option key={mode.id} value={mode.id}>{mode.label}</option>
                ))}
              </select>
            }
          />
        </SectionGroup>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Row primitives — local helpers, kept small to mirror home-feed-row tone */
/* ─────────────────────────────────────────────────────────────────────── */

function SectionGroup({
  eyebrow,
  title,
  subtitle,
  trailing,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `settings-section-${eyebrow.toLowerCase()}-${title.replace(/\s+/g, '-').toLowerCase()}`;
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

function Row({
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

function ModelRow({
  item,
  selected,
  isDefault,
  onToggle,
}: {
  item: CatalogItem;
  selected: boolean;
  isDefault: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.row} ${styles.rowInteractive} ${selected ? styles.rowSelected : ''}`}
      aria-pressed={selected}
      onClick={onToggle}
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
        <span className={styles.timestamp}>
          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
        </span>
      </div>
    </button>
  );
}

function EmptyRow({ title, description }: { title: string; description: string }) {
  return (
    <div className={`${styles.row} ${styles.rowEmpty}`}>
      <div className={styles.rowBody}>
        <div className={styles.rowLabel}>{title}</div>
        <div className={styles.rowDescription}>{description}</div>
      </div>
    </div>
  );
}

function FeedbackRow({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div className={`${styles.row} ${styles.rowFeedback}`}>
      <span className={`${styles.statusDot} ${ok ? styles.statusDotOk : styles.statusDotErr}`} aria-hidden />
      <div className={styles.rowBody}>
        <div className={`${styles.feedbackText} ${ok ? styles.feedbackOk : styles.feedbackErr}`}>{message}</div>
      </div>
    </div>
  );
}

function StatusPill({
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

function KeyMaskIcon({ hasKey }: { hasKey: boolean }) {
  return (
    <span className={`${styles.leadingBadge} ${hasKey ? styles.leadingBadgeOk : ''}`}>
      {hasKey ? <CheckCircle2 size={14} aria-hidden /> : <span className={styles.leadingBadgeChar}>•••</span>}
    </span>
  );
}

function DotIcon() {
  return <span className={styles.leadingDot} />;
}
