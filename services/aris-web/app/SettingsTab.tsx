'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, FileKey, KeyRound, Settings2, UploadCloud } from 'lucide-react';
import { OpenAiApiKeyCard } from '@/components/settings/OpenAiApiKeyCard';
import { CodexModelCatalogCard } from '@/components/settings/CodexModelCatalogCard';
import {
  DEFAULT_CLAUDE_MODEL_SELECTIONS,
  DEFAULT_CODEX_MODEL_SELECTIONS,
  type ClaudeCatalogItem,
  type ModelSettingsResponse,
  type OpenAiCatalogItem,
  type ProviderId,
} from '@/lib/settings/providerModels';
import styles from './SettingsTab.module.css';

type Feedback = { ok: boolean; msg: string } | null;
const PROVIDER_OPTIONS: Array<{ id: ProviderId; label: string }> = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
];

const DEFAULT_MODEL_SETTINGS: ModelSettingsResponse = {
  providers: {
    codex: { selectedModelIds: [] },
    claude: { selectedModelIds: [] },
    gemini: { selectedModelIds: [] },
  },
  legacyCustomModels: {
    codex: '',
    claude: '',
    gemini: '',
  },
  secrets: {
    openAiApiKeyConfigured: false,
    claudeApiKeyConfigured: false,
  },
};

export function SettingsTab() {
  const [sshUser, setSshUser] = useState('ubuntu');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [modelSettings, setModelSettings] = useState<ModelSettingsResponse>(DEFAULT_MODEL_SETTINGS);
  const [activeProvider, setActiveProvider] = useState<ProviderId>('codex');

  // Codex 상태
  const [codexCatalogItems, setCodexCatalogItems] = useState<OpenAiCatalogItem[]>([]);
  const [selectedCodexModelIds, setSelectedCodexModelIds] = useState<string[]>([...DEFAULT_CODEX_MODEL_SELECTIONS]);
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

  const syncCodexSelection = useCallback((settings: ModelSettingsResponse) => {
    const persisted = settings.providers.codex.selectedModelIds;
    setSelectedCodexModelIds(persisted.length > 0 ? persisted : [...DEFAULT_CODEX_MODEL_SELECTIONS]);
  }, []);

  const syncClaudeSelection = useCallback((settings: ModelSettingsResponse) => {
    const persisted = settings.providers.claude.selectedModelIds;
    setSelectedClaudeModelIds(persisted.length > 0 ? persisted : [...DEFAULT_CLAUDE_MODEL_SELECTIONS]);
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
      return data;
    } catch (error) {
      setCodexModelFeedback({
        ok: false,
        msg: error instanceof Error ? error.message : '모델 설정을 불러오지 못했습니다.',
      });
      return null;
    }
  }, [syncCodexSelection, syncClaudeSelection]);

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

  useEffect(() => {
    fetch('/api/settings/ssh')
      .then((response) => response.json())
      .then((data) => {
        setSshUser(data.sshUser ?? 'ubuntu');
        setHasKey(Boolean(data.hasKey));
      })
      .catch(() => {});

    void loadModelSettings().then((settings) => {
      if (settings?.secrets.openAiApiKeyConfigured) {
        void loadCodexCatalog();
      }
      if (settings?.secrets.claudeApiKeyConfigured) {
        void loadClaudeCatalog();
      }
    });
  }, [loadModelSettings, loadCodexCatalog, loadClaudeCatalog]);

  const loadFile = useCallback((file: File) => {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setSshPrivateKey(text);
      setFileName(file.name);
      setShowTextInput(false);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      loadFile(file);
    }
  }, [loadFile]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      loadFile(file);
    }
    event.target.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/settings/ssh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sshUser, sshPrivateKey: sshPrivateKey || undefined }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setFeedback({ ok: false, msg: data.error ?? '저장 실패' });
      } else {
        if (sshPrivateKey.trim()) {
          setHasKey(true);
          setFileName(null);
          setSshPrivateKey('');
        }
        setFeedback({ ok: true, msg: '저장되었습니다.' });
      }
    } catch {
      setFeedback({ ok: false, msg: '네트워크 오류' });
    } finally {
      setSaving(false);
    }
  };

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

  // Codex 모델 토글 / 권장 / 저장
  const handleToggleCodexModel = useCallback((modelId: string) => {
    setSelectedCodexModelIds((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((item) => item !== modelId);
      }
      const next = [...prev, modelId];
      const order = new Map(codexCatalogItems.map((item, index) => [item.id, index]));
      next.sort((left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER));
      return next;
    });
  }, [codexCatalogItems]);

  const handleApplyRecommendedCodexModels = useCallback(() => {
    if (codexCatalogItems.length === 0) {
      setSelectedCodexModelIds([...DEFAULT_CODEX_MODEL_SELECTIONS]);
      return;
    }
    const available = new Set(codexCatalogItems.map((item) => item.id));
    const recommended = DEFAULT_CODEX_MODEL_SELECTIONS.filter((modelId) => available.has(modelId));
    setSelectedCodexModelIds(recommended.length > 0 ? [...recommended] : [...DEFAULT_CODEX_MODEL_SELECTIONS]);
  }, [codexCatalogItems]);

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
        body: JSON.stringify({ providers: { codex: { selectedModelIds: selectedCodexModelIds } } }),
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
  }, [selectedCodexModelIds, syncCodexSelection]);

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

  // 활성 provider에 따라 카드에 전달할 props 결정
  const isCodex = activeProvider === 'codex';
  const isClaude = activeProvider === 'claude';

  const activeHasApiKey = isCodex
    ? modelSettings.secrets.openAiApiKeyConfigured
    : isClaude
      ? modelSettings.secrets.claudeApiKeyConfigured
      : false;

  const activeKeyHasKey = isCodex
    ? modelSettings.secrets.openAiApiKeyConfigured
    : isClaude
      ? modelSettings.secrets.claudeApiKeyConfigured
      : false;

  const activeKeySaving = isCodex ? codexKeySaving : isClaude ? claudeKeySaving : false;
  const activeKeyDeleting = isCodex ? codexKeyDeleting : isClaude ? claudeKeyDeleting : false;
  const activeKeyFeedback = isCodex ? codexKeyFeedback : isClaude ? claudeKeyFeedback : null;
  const handleActiveKeySave = isCodex ? handleSaveCodexKey : isClaude ? handleSaveClaudeKey : async (_: string) => {};
  const handleActiveKeyDelete = isCodex ? handleDeleteCodexKey : isClaude ? handleDeleteClaudeKey : async () => {};

  const activeCatalogItems = isCodex ? codexCatalogItems : isClaude ? claudeCatalogItems : [];
  const activeSelectedModelIds = isCodex ? selectedCodexModelIds : isClaude ? selectedClaudeModelIds : [];
  const activeCatalogLoading = isCodex ? codexCatalogLoading : isClaude ? claudeCatalogLoading : false;
  const activeModelSaving = isCodex ? codexModelSaving : isClaude ? claudeModelSaving : false;
  const activeCatalogError = isCodex ? codexCatalogError : isClaude ? claudeCatalogError : null;
  const activeModelFeedback = isCodex ? codexModelFeedback : isClaude ? claudeModelFeedback : null;
  const handleActiveToggle = isCodex ? handleToggleCodexModel : isClaude ? handleToggleClaudeModel : (_: string) => {};
  const handleActiveRefresh = isCodex ? loadCodexCatalog : isClaude ? loadClaudeCatalog : async () => {};
  const handleActiveModelSave = isCodex ? handleCodexModelSave : isClaude ? handleClaudeModelSave : async () => {};
  const handleActiveApplyRecommended = isCodex
    ? handleApplyRecommendedCodexModels
    : isClaude
      ? handleApplyRecommendedClaudeModels
      : () => {};

  const isFileLoaded = Boolean(sshPrivateKey && fileName);

  return (
    <div className={`animate-in ${styles.settingsShell}`}>
      <div className={styles.hero}>
        <div className={styles.heroEyebrow}>
          <Settings2 size={14} />
          Runtime Settings
        </div>
        <h2 className={styles.heroTitle}>모델 카탈로그와 인프라 자격증명을 한 화면에서 관리</h2>
        <p className={styles.heroDescription}>
          OpenAI(Codex)와 Anthropic(Claude) 모델 선택은 동적 카탈로그 기반으로 관리하고, SSH 자격증명은 별도 보안
          영역에서 유지합니다.
        </p>
      </div>

      <div className={styles.stack}>
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
          loading={activeCatalogLoading}
          saving={activeModelSaving}
          error={activeCatalogError}
          feedback={activeModelFeedback}
          onToggle={handleActiveToggle}
          onRefresh={handleActiveRefresh}
          onSave={handleActiveModelSave}
          onApplyRecommended={handleActiveApplyRecommended}
        />

        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <KeyRound size={16} />
            SSH 터미널 설정
          </div>

          <div className={styles.field}>
            <label className={styles.label}>SSH 접속 유저</label>
            <input
              className={styles.input}
              type="text"
              value={sshUser}
              onChange={(event) => setSshUser(event.target.value)}
              placeholder="ubuntu"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>SSH Private Key</label>

            {hasKey && !sshPrivateKey && (
              <div className={styles.keySet}>
                <CheckCircle2 size={14} />
                키가 등록되어 있습니다. 새 파일을 올리면 교체됩니다.
              </div>
            )}

            <div
              className={`${styles.dropzone} ${dragOver ? styles.dragOver : ''} ${isFileLoaded ? styles.fileLoaded : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  fileInputRef.current?.click();
                }
              }}
            >
              {isFileLoaded ? (
                <>
                  <FileKey size={28} className={styles.dropzoneIcon} />
                  <p className={styles.dropzoneText}>{fileName}</p>
                  <p className={styles.dropzoneSub}>클릭하면 다른 파일로 교체</p>
                </>
              ) : (
                <>
                  <UploadCloud size={28} className={styles.dropzoneIcon} />
                  <p className={styles.dropzoneText}>
                    <strong>파일을 드래그</strong>하거나 클릭하여 선택
                  </p>
                  <p className={styles.dropzoneSub}>id_rsa, id_ed25519 등 PEM 형식</p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              accept=".pem,.key,*"
              onChange={handleFileChange}
            />

            <button
              type="button"
              className={styles.textToggle}
              onClick={() => setShowTextInput((value) => !value)}
            >
              {showTextInput ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              텍스트로 직접 입력
            </button>

            {showTextInput && (
              <textarea
                className={styles.textarea}
                value={sshPrivateKey}
                onChange={(event) => {
                  setSshPrivateKey(event.target.value);
                  setFileName(null);
                }}
                placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
                spellCheck={false}
                autoComplete="off"
              />
            )}

            <p className={styles.keyHint}>키는 AES-256-GCM으로 암호화되어 DB에 저장됩니다.</p>
          </div>

          <div className={styles.footer}>
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
            {feedback ? (
              <span className={feedback.ok ? styles.feedbackOk : styles.feedbackErr}>
                {feedback.msg}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
