'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cpu, Info, SlidersHorizontal } from 'lucide-react';
import { OpenAiApiKeyCard } from '@/components/settings/OpenAiApiKeyCard';
import { CodexModelCatalogCard } from '@/components/settings/CodexModelCatalogCard';
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

const PROVIDER_OPTIONS: Array<{ id: ProviderId; label: string }> = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
];

const DEFAULT_MODEL_SETTINGS: ModelSettingsResponse = {
  providers: {
    codex: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
    claude: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
    gemini: { selectedModelIds: [], defaultModelId: null, defaultModeId: DEFAULT_GEMINI_MODE_ID },
  },
  legacyCustomModels: {
    codex: '',
    claude: '',
    gemini: '',
  },
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
      if (!response.ok || !data) {
        throw new Error('모델 카탈로그를 불러오지 못했습니다.');
      }
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
      if (!response.ok || !data) {
        throw new Error('Claude 모델 카탈로그를 불러오지 못했습니다.');
      }
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
      if (!response.ok || !data) {
        throw new Error('Gemini 모델 카탈로그를 불러오지 못했습니다.');
      }
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
      if (settings?.secrets.openAiApiKeyConfigured) {
        void loadCodexCatalog();
      }
      if (settings?.secrets.claudeApiKeyConfigured) {
        void loadClaudeCatalog();
      }
      if (settings?.secrets.geminiApiKeyConfigured) {
        void loadGeminiCatalog();
      }
    });
  }, [loadClaudeCatalog, loadCodexCatalog, loadGeminiCatalog, loadModelSettings]);

  // Codex 키 핸들러
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
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'OpenAI API 키 저장에 실패했습니다.');
      }
      setCodexKeyFeedback({ ok: true, msg: 'OpenAI API 키가 저장되었습니다.' });
      const settings = await loadModelSettings();
      if (settings?.secrets.openAiApiKeyConfigured) {
        await loadCodexCatalog();
      }
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
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'OpenAI API 키 제거에 실패했습니다.');
      }
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

  // Claude 키 핸들러
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
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Anthropic API 키 저장에 실패했습니다.');
      }
      setClaudeKeyFeedback({ ok: true, msg: 'Anthropic API 키가 저장되었습니다.' });
      const settings = await loadModelSettings();
      if (settings?.secrets.claudeApiKeyConfigured) {
        await loadClaudeCatalog();
      }
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
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Anthropic API 키 제거에 실패했습니다.');
      }
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

  // Gemini 키 핸들러
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
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Google AI Studio API 키 저장에 실패했습니다.');
      }
      setGeminiKeyFeedback({ ok: true, msg: 'Google AI Studio API 키가 저장되었습니다.' });
      const settings = await loadModelSettings();
      if (settings?.secrets.geminiApiKeyConfigured) {
        await loadGeminiCatalog();
      }
    } catch (error) {
      setGeminiKeyFeedback({
        ok: false,
        msg: error instanceof Error ? error.message : 'Google AI Studio API 키 저장에 실패했습니다.',
      });
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
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Google AI Studio API 키 제거에 실패했습니다.');
      }
      setGeminiCatalogItems([]);
      setGeminiCatalogError(null);
      setGeminiKeyFeedback({ ok: true, msg: '등록된 Google AI Studio API 키를 제거했습니다.' });
      await loadModelSettings();
    } catch (error) {
      setGeminiKeyFeedback({
        ok: false,
        msg: error instanceof Error ? error.message : 'Google AI Studio API 키 제거에 실패했습니다.',
      });
    } finally {
      setGeminiKeyDeleting(false);
    }
  }, [loadModelSettings]);

  // Codex 모델 토글 / 권장 / 저장
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
      if (!prev.includes(modelId)) {
        return prev;
      }
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
            codex: {
              selectedModelIds: selectedCodexModelIds,
              defaultModelId: selectedCodexDefaultModelId,
            },
          },
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error('사용할 Codex 모델 목록을 저장하지 못했습니다.');
      }
      setModelSettings(data);
      syncCodexSelection(data);
      setCodexModelFeedback({ ok: true, msg: 'Codex 사용할 모델 목록이 저장되었습니다.' });
    } catch (error) {
      setCodexModelFeedback({ ok: false, msg: error instanceof Error ? error.message : 'Codex 모델 목록 저장에 실패했습니다.' });
    } finally {
      setCodexModelSaving(false);
    }
  }, [selectedCodexDefaultModelId, selectedCodexModelIds, syncCodexSelection]);

  // Claude 모델 토글 / 권장 / 저장
  const handleToggleClaudeModel = useCallback((modelId: string) => {
    setSelectedClaudeModelIds((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((item) => item !== modelId);
      }
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
      if (!response.ok || !data) {
        throw new Error('사용할 Claude 모델 목록을 저장하지 못했습니다.');
      }
      setModelSettings(data);
      syncClaudeSelection(data);
      setClaudeModelFeedback({ ok: true, msg: 'Claude 사용할 모델 목록이 저장되었습니다.' });
    } catch (error) {
      setClaudeModelFeedback({ ok: false, msg: error instanceof Error ? error.message : 'Claude 모델 목록 저장에 실패했습니다.' });
    } finally {
      setClaudeModelSaving(false);
    }
  }, [selectedClaudeModelIds, syncClaudeSelection]);

  // Gemini 모델 토글 / 권장 / 저장
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
      if (!response.ok || !data) {
        throw new Error('사용할 Gemini 모델 목록을 저장하지 못했습니다.');
      }
      setModelSettings(data);
      syncGeminiSelection(data);
      setGeminiModelFeedback({ ok: true, msg: 'Gemini 사용할 모델 목록이 저장되었습니다.' });
    } catch (error) {
      setGeminiModelFeedback({ ok: false, msg: error instanceof Error ? error.message : 'Gemini 모델 목록 저장에 실패했습니다.' });
    } finally {
      setGeminiModelSaving(false);
    }
  }, [selectedGeminiDefaultModelId, selectedGeminiDefaultModeId, selectedGeminiModelIds, syncGeminiSelection]);

  // 활성 provider에 따라 카드에 전달할 props 결정
  const isCodex = activeProvider === 'codex';
  const isClaude = activeProvider === 'claude';

  const activeHasApiKey = isCodex
    ? modelSettings.secrets.openAiApiKeyConfigured
    : isClaude
      ? modelSettings.secrets.claudeApiKeyConfigured
      : modelSettings.secrets.geminiApiKeyConfigured;

  const activeKeyHasKey = isCodex
    ? modelSettings.secrets.openAiApiKeyConfigured
    : isClaude
      ? modelSettings.secrets.claudeApiKeyConfigured
      : modelSettings.secrets.geminiApiKeyConfigured;

  const activeKeySaving = isCodex ? codexKeySaving : isClaude ? claudeKeySaving : geminiKeySaving;
  const activeKeyDeleting = isCodex ? codexKeyDeleting : isClaude ? claudeKeyDeleting : geminiKeyDeleting;
  const activeKeyFeedback = isCodex ? codexKeyFeedback : isClaude ? claudeKeyFeedback : geminiKeyFeedback;
  const handleActiveKeySave = isCodex ? handleSaveCodexKey : isClaude ? handleSaveClaudeKey : handleSaveGeminiKey;
  const handleActiveKeyDelete = isCodex ? handleDeleteCodexKey : isClaude ? handleDeleteClaudeKey : handleDeleteGeminiKey;

  const activeCatalogItems = isCodex ? codexCatalogItems : isClaude ? claudeCatalogItems : geminiCatalogItems;
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

  return (
    <div className={styles.section}>
      <OpenAiApiKeyCard
        providerOptions={PROVIDER_OPTIONS}
        activeProvider={activeProvider}
        onProviderChange={setActiveProvider}
        hasKey={activeKeyHasKey}
        saving={activeKeySaving}
        deleting={activeKeyDeleting}
        feedback={activeKeyFeedback}
        onSave={handleActiveKeySave}
        onDelete={handleActiveKeyDelete}
      />

      <CodexModelCatalogCard
        providerOptions={PROVIDER_OPTIONS}
        activeProvider={activeProvider}
        onProviderChange={setActiveProvider}
        hasApiKey={activeHasApiKey}
        items={activeCatalogItems}
        selectedModelIds={activeSelectedModelIds}
        manualModelIds={isCodex ? manualCodexModelIds : []}
        loading={activeCatalogLoading}
        saving={activeModelSaving}
        error={activeCatalogError}
        feedback={activeModelFeedback}
        onToggle={handleActiveToggle}
        onAddManualModel={isCodex ? handleAddCodexManualModel : undefined}
        onRemoveManualModel={isCodex ? handleRemoveCodexManualModel : undefined}
        onRefresh={handleActiveRefresh}
        onSave={handleActiveModelSave}
        onApplyRecommended={handleActiveApplyRecommended}
      />

      {activeProvider === 'gemini' && (
        <section
          className={styles.subCard}
          role="region"
          aria-labelledby="gemini-defaults-title"
        >
          <header className={styles.subCardHeader}>
            <span className={styles.subCardIcon} aria-hidden>
              <SlidersHorizontal size={16} />
            </span>
            <div>
              <h3 id="gemini-defaults-title" className={styles.subCardTitle}>Gemini 기본 실행값</h3>
              <p className={styles.subCardSubtitle}>새 Gemini 채팅의 초기 모델과 모드를 정의합니다.</p>
            </div>
          </header>
          <div className={styles.subCardBody}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="gemini-default-model">기본 모델</label>
              <div className={styles.selectWrap}>
                <select
                  id="gemini-default-model"
                  className={styles.select}
                  value={selectedGeminiDefaultModelId}
                  onChange={(event) => setSelectedGeminiDefaultModelId(event.target.value)}
                  disabled={selectedGeminiModelIds.length === 0}
                >
                  {selectedGeminiModelIds.map((modelId) => (
                    <option key={modelId} value={modelId}>
                      {modelId}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="gemini-default-mode">기본 모드</label>
              <div className={styles.selectWrap}>
                <select
                  id="gemini-default-mode"
                  className={styles.select}
                  value={selectedGeminiDefaultModeId}
                  onChange={(event) => setSelectedGeminiDefaultModeId(event.target.value)}
                >
                  {GEMINI_MODE_SELECTION_OPTIONS.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.hint}>
              <Info size={14} className={styles.hintIcon} aria-hidden />
              <span>
                새 Gemini 채팅은 여기서 저장한 기본 모델과 모드로 시작합니다. 채팅 화면에서는 ACP capability를 다시 조회하지 않습니다.
              </span>
            </div>
          </div>
        </section>
      )}

      {activeProvider === 'codex' && (
        <section
          className={styles.subCard}
          role="region"
          aria-labelledby="codex-defaults-title"
        >
          <header className={styles.subCardHeader}>
            <span className={styles.subCardIcon} aria-hidden>
              <Cpu size={16} />
            </span>
            <div>
              <h3 id="codex-defaults-title" className={styles.subCardTitle}>Codex 기본 실행값</h3>
              <p className={styles.subCardSubtitle}>새 Codex 채팅의 초기 모델을 정의합니다.</p>
            </div>
          </header>
          <div className={styles.subCardBody}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="codex-default-model">기본 모델</label>
              <div className={styles.selectWrap}>
                <select
                  id="codex-default-model"
                  className={styles.select}
                  value={selectedCodexDefaultModelId}
                  onChange={(event) => setSelectedCodexDefaultModelId(event.target.value)}
                  disabled={selectedCodexModelIds.length === 0}
                >
                  {selectedCodexModelIds.map((modelId) => (
                    <option key={modelId} value={modelId}>
                      {modelId}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.hint}>
              <Info size={14} className={styles.hintIcon} aria-hidden />
              <span>
                새 Codex 채팅은 현재 브라우저의 마지막 모델 선택을 우선 사용하고, 캐시가 없거나 더 이상 선택 목록에 없으면 여기서 저장한 기본 모델로 시작합니다.
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
