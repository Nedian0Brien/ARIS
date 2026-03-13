'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import type { ProviderId } from '@/lib/settings/providerModels';
import styles from './OpenAiApiKeyCard.module.css';

type Feedback = { ok: boolean; msg: string } | null;

const PROVIDER_KEY_LABELS: Record<string, string> = {
  codex: 'OpenAI API Key',
  claude: 'Anthropic API Key',
  gemini: 'Google API Key',
};

const PROVIDER_KEY_PLACEHOLDERS: Record<string, string> = {
  codex: 'sk-...',
  claude: 'sk-ant-...',
  gemini: 'AIza...',
};

export function OpenAiApiKeyCard({
  providerOptions,
  activeProvider,
  onProviderChange,
  hasKey,
  saving,
  deleting,
  feedback,
  onSave,
  onDelete,
}: {
  providerOptions: Array<{ id: ProviderId; label: string }>;
  activeProvider: ProviderId;
  onProviderChange: (provider: ProviderId) => void;
  hasKey: boolean;
  saving: boolean;
  deleting: boolean;
  feedback: Feedback;
  onSave: (apiKey: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    setApiKey('');
  }, [activeProvider]);

  useEffect(() => {
    if (feedback?.ok) {
      setApiKey('');
    }
  }, [feedback]);

  const isCodex = activeProvider === 'codex';
  const isClaude = activeProvider === 'claude';
  const isActiveProvider = isCodex || isClaude;
  const providerTitle = activeProvider === 'claude' ? 'Claude' : activeProvider === 'gemini' ? 'Gemini' : 'Codex';
  const themeClass = activeProvider === 'claude'
    ? styles.themeClaude
    : activeProvider === 'gemini'
      ? styles.themeGemini
      : styles.themeCodex;

  const keyLabel = PROVIDER_KEY_LABELS[activeProvider] ?? 'API Key';
  const keyPlaceholder = PROVIDER_KEY_PLACEHOLDERS[activeProvider] ?? '';

  const runtimeLabel = isCodex
    ? 'Codex 실행 인자에 미주입'
    : isClaude
      ? 'Claude 실행 인자에 미주입'
      : '런타임 분리';

  return (
    <section className={`${styles.card} ${themeClass}`}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <div className={styles.eyebrow}>
              <KeyRound size={14} />
              Provider Credentials
            </div>
            <h3 className={styles.title}>Model Provider API Keys</h3>
            <p className={styles.description}>
              공급자별 API 키를 분리 저장합니다. 키는 AES-256-GCM으로 암호화되며 런타임
              에이전트 실행 경로에 주입하지 않습니다.
            </p>
          </div>
          {isActiveProvider ? (
            <div className={`${styles.statusPill} ${hasKey ? styles.statusActive : styles.statusInactive}`}>
              {hasKey ? '등록됨' : '미등록'}
            </div>
          ) : (
            <div className={`${styles.statusPill} ${styles.statusPlanned}`}>
              Placeholder
            </div>
          )}
        </div>

        <div className={styles.providerRail} aria-label="모델 공급자 선택">
          {providerOptions.map((provider) => {
            const active = provider.id === activeProvider;
            return (
              <button
                key={provider.id}
                type="button"
                className={`${styles.providerButton} ${active ? styles.providerButtonActive : ''} ${styles[`provider${provider.label}Tone` as keyof typeof styles]}`}
                onClick={() => onProviderChange(provider.id)}
              >
                {provider.label}
              </button>
            );
          })}
        </div>

        {isActiveProvider ? (
          <>
            <div className={styles.securityGrid}>
              <div className={styles.securityItem}>
                <span className={styles.securityLabel}>보관 방식</span>
                <span className={styles.securityValue}>AES-256-GCM 암호화</span>
              </div>
              <div className={styles.securityItem}>
                <span className={styles.securityLabel}>사용 범위</span>
                <span className={styles.securityValue}>설정 탭 모델 카탈로그 조회 전용</span>
              </div>
              <div className={styles.securityItem}>
                <span className={styles.securityLabel}>런타임 분리</span>
                <span className={styles.securityValue}>{runtimeLabel}</span>
              </div>
            </div>

            <div className={styles.form}>
              {hasKey ? (
                <div className={styles.keySet}>
                  <CheckCircle2 size={14} />
                  키가 등록되어 있습니다.
                </div>
              ) : null}
              <div>
                <label className={styles.label}>{keyLabel}</label>
                <div className={styles.inputRow}>
                  <input
                    className={styles.input}
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={hasKey ? '새 키를 입력하면 교체됩니다' : keyPlaceholder}
                  />
                </div>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => { void onSave(apiKey); }}
                  disabled={saving || deleting || apiKey.trim().length < 20}
                >
                  {hasKey ? <Sparkles size={16} /> : <ShieldCheck size={16} />}
                  {saving ? '저장 중...' : hasKey ? '키 갱신' : '키 등록'}
                </button>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => { void onDelete(); }}
                  disabled={!hasKey || saving || deleting}
                >
                  {hasKey ? <Trash2 size={16} /> : <CheckCircle2 size={16} />}
                  {deleting ? '삭제 중...' : '등록 제거'}
                </button>
                {feedback ? (
                  <span className={`${styles.feedback} ${feedback.ok ? styles.feedbackOk : styles.feedbackErr}`}>
                    {feedback.msg}
                  </span>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className={styles.placeholderPanel}>
            <div className={styles.placeholderEyebrow}>{providerTitle} Placeholder</div>
            <div className={styles.placeholderTitle}>{providerTitle} API 키 설정은 다음 단계에서 연결됩니다</div>
            <p className={styles.placeholderText}>
              공급자별 저장 구조는 동일하게 유지하되, 현재 배포에서는 Codex(OpenAI)와 Claude(Anthropic)만
              실제 카탈로그 조회와 연결되어 있습니다.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
