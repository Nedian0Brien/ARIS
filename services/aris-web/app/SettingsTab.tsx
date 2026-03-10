'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, FileKey, KeyRound, Settings2, UploadCloud } from 'lucide-react';
import { OpenAiApiKeyCard } from '@/components/settings/OpenAiApiKeyCard';
import { CodexModelCatalogCard } from '@/components/settings/CodexModelCatalogCard';
import {
  DEFAULT_CODEX_MODEL_SELECTIONS,
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
  const [catalogItems, setCatalogItems] = useState<OpenAiCatalogItem[]>([]);
  const [selectedCodexModelIds, setSelectedCodexModelIds] = useState<string[]>([...DEFAULT_CODEX_MODEL_SELECTIONS]);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelFeedback, setModelFeedback] = useState<Feedback>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [keySaving, setKeySaving] = useState(false);
  const [keyDeleting, setKeyDeleting] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<Feedback>(null);
  const [activeProvider, setActiveProvider] = useState<ProviderId>('codex');

  const syncCodexSelection = useCallback((settings: ModelSettingsResponse) => {
    const persisted = settings.providers.codex.selectedModelIds;
    setSelectedCodexModelIds(persisted.length > 0 ? persisted : [...DEFAULT_CODEX_MODEL_SELECTIONS]);
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
      return data;
    } catch (error) {
      setModelFeedback({
        ok: false,
        msg: error instanceof Error ? error.message : '모델 설정을 불러오지 못했습니다.',
      });
      return null;
    }
  }, [syncCodexSelection]);

  const loadOpenAiCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await fetch('/api/settings/models/catalog/openai');
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error('모델 카탈로그를 불러오지 못했습니다.');
      }
      setCatalogItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      setCatalogItems([]);
      setCatalogError(error instanceof Error ? error.message : '모델 카탈로그를 불러오지 못했습니다.');
    } finally {
      setCatalogLoading(false);
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
        void loadOpenAiCatalog();
      }
    });
  }, [loadModelSettings, loadOpenAiCatalog]);

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

  const handleSaveOpenAiKey = useCallback(async (apiKey: string) => {
    if (apiKey.trim().length < 20) {
      setKeyFeedback({ ok: false, msg: '유효한 OpenAI API 키를 입력해 주세요.' });
      return;
    }
    setKeySaving(true);
    setKeyFeedback(null);
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
      setKeyFeedback({ ok: true, msg: 'OpenAI API 키가 저장되었습니다.' });
      const settings = await loadModelSettings();
      if (settings?.secrets.openAiApiKeyConfigured) {
        await loadOpenAiCatalog();
      }
    } catch (error) {
      setKeyFeedback({ ok: false, msg: error instanceof Error ? error.message : 'OpenAI API 키 저장에 실패했습니다.' });
    } finally {
      setKeySaving(false);
    }
  }, [loadModelSettings, loadOpenAiCatalog]);

  const handleDeleteOpenAiKey = useCallback(async () => {
    setKeyDeleting(true);
    setKeyFeedback(null);
    try {
      const response = await fetch('/api/settings/openai-key', {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'OpenAI API 키 제거에 실패했습니다.');
      }
      setCatalogItems([]);
      setCatalogError(null);
      setKeyFeedback({ ok: true, msg: '등록된 OpenAI API 키를 제거했습니다.' });
      await loadModelSettings();
    } catch (error) {
      setKeyFeedback({ ok: false, msg: error instanceof Error ? error.message : 'OpenAI API 키 제거에 실패했습니다.' });
    } finally {
      setKeyDeleting(false);
    }
  }, [loadModelSettings]);

  const handleToggleCodexModel = useCallback((modelId: string) => {
    setSelectedCodexModelIds((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((item) => item !== modelId);
      }

      const next = [...prev, modelId];
      const order = new Map(catalogItems.map((item, index) => [item.id, index]));
      next.sort((left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER));
      return next;
    });
  }, [catalogItems]);

  const handleApplyRecommendedCodexModels = useCallback(() => {
    if (catalogItems.length === 0) {
      setSelectedCodexModelIds([...DEFAULT_CODEX_MODEL_SELECTIONS]);
      return;
    }
    const available = new Set(catalogItems.map((item) => item.id));
    const recommended = DEFAULT_CODEX_MODEL_SELECTIONS.filter((modelId) => available.has(modelId));
    setSelectedCodexModelIds(recommended.length > 0 ? [...recommended] : [...DEFAULT_CODEX_MODEL_SELECTIONS]);
  }, [catalogItems]);

  const handleModelSave = useCallback(async () => {
    if (selectedCodexModelIds.length === 0) {
      setModelFeedback({ ok: false, msg: '최소 1개 이상의 Codex 모델을 선택해 주세요.' });
      return;
    }

    setModelSaving(true);
    setModelFeedback(null);
    try {
      const response = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providers: {
            codex: {
              selectedModelIds: selectedCodexModelIds,
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
      setModelFeedback({ ok: true, msg: 'Codex 사용할 모델 목록이 저장되었습니다.' });
    } catch (error) {
      setModelFeedback({ ok: false, msg: error instanceof Error ? error.message : 'Codex 모델 목록 저장에 실패했습니다.' });
    } finally {
      setModelSaving(false);
    }
  }, [selectedCodexModelIds, syncCodexSelection]);

  const isFileLoaded = Boolean(sshPrivateKey && fileName);
  const hasOpenAiApiKey = modelSettings.secrets.openAiApiKeyConfigured;

  return (
    <div className={`animate-in ${styles.settingsShell}`}>
      <div className={styles.hero}>
        <div className={styles.heroEyebrow}>
          <Settings2 size={14} />
          Runtime Settings
        </div>
        <h2 className={styles.heroTitle}>모델 카탈로그와 인프라 자격증명을 한 화면에서 관리</h2>
        <p className={styles.heroDescription}>
          OpenAI 모델 선택은 동적 카탈로그 기반으로 관리하고, SSH 자격증명은 별도 보안 영역에서 유지합니다.
        </p>
      </div>

      <div className={styles.stack}>
        <OpenAiApiKeyCard
          providerOptions={PROVIDER_OPTIONS}
          activeProvider={activeProvider}
          onProviderChange={setActiveProvider}
          hasKey={hasOpenAiApiKey}
          saving={keySaving}
          deleting={keyDeleting}
          feedback={keyFeedback}
          onSave={handleSaveOpenAiKey}
          onDelete={handleDeleteOpenAiKey}
        />

        <CodexModelCatalogCard
          providerOptions={PROVIDER_OPTIONS}
          activeProvider={activeProvider}
          onProviderChange={setActiveProvider}
          hasApiKey={hasOpenAiApiKey}
          items={catalogItems}
          selectedModelIds={selectedCodexModelIds}
          loading={catalogLoading}
          saving={modelSaving}
          error={catalogError}
          feedback={modelFeedback}
          onToggle={handleToggleCodexModel}
          onRefresh={loadOpenAiCatalog}
          onSave={handleModelSave}
          onApplyRecommended={handleApplyRecommendedCodexModels}
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
