'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Info, KeyRound, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import type { ProviderId } from '@/lib/settings/providerModels';
import styles from './OpenAiApiKeyCard.module.css';

type Feedback = { ok: boolean; msg: string } | null;

const PROVIDER_KEY_LABELS: Record<string, string> = {
  codex: 'OpenAI API Key',
  claude: 'Anthropic API Key',
  gemini: 'Google AI Studio API Key',
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
  const isGemini = activeProvider === 'gemini';
  const isActiveProvider = isCodex || isClaude || isGemini;
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
      : isGemini
        ? 'Gemini 실행 인자에 미주입'
        : '런타임 분리';

  const headingId = `settings-apikey-${activeProvider}-title`;

  return (
    <section
      className={`${styles.card} ${themeClass}`}
      role="region"
      aria-labelledby={headingId}
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <span className={styles.eyebrow}>
              <KeyRound size={12} aria-hidden />
              Provider Credentials
            </span>
            <h2 id={headingId} className={styles.title}>API Key</h2>
            <p className={styles.description}>
              공급자별 API 키를 분리 저장합니다. AES-256-GCM으로 암호화되며, 런타임 에이전트 실행 경로에는
              주입하지 않고 카탈로그 조회에만 사용합니다.
            </p>
          </div>
          {isActiveProvider ? (
            <div
              className={`${styles.statusPill} ${hasKey ? styles.statusActive : styles.statusInactive}`}
              role="status"
              aria-live="polite"
            >
              <span className={styles.statusPillDot} aria-hidden />
              {hasKey ? 'Connected' : 'Not configured'}
            </div>
          ) : (
            <div className={`${styles.statusPill} ${styles.statusPlanned}`}>
              <span className={styles.statusPillDot} aria-hidden />
              Placeholder
            </div>
          )}
        </div>

        <div className={styles.providerRail} role="tablist" aria-label="Model provider">
          {providerOptions.map((provider) => {
            const active = provider.id === activeProvider;
            const toneClass = styles[`provider${provider.label}Tone` as keyof typeof styles];
            return (
              <button
                key={provider.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`${styles.providerButton} ${active ? styles.providerButtonActive : ''} ${toneClass}`}
                onClick={() => onProviderChange(provider.id)}
              >
                <span className={styles.providerDot} aria-hidden />
                {provider.label}
              </button>
            );
          })}
        </div>

        {isActiveProvider ? (
          <>
            <div className={styles.securityGrid} aria-label="Key security details">
              <div className={styles.securityItem}>
                <span className={styles.securityLabel}>Storage</span>
                <span className={styles.securityValue}>AES-256-GCM 암호화</span>
              </div>
              <div className={styles.securityItem}>
                <span className={styles.securityLabel}>Scope</span>
                <span className={styles.securityValue}>설정 탭 카탈로그 조회 전용</span>
              </div>
              <div className={styles.securityItem}>
                <span className={styles.securityLabel}>Runtime</span>
                <span className={styles.securityValue}>{runtimeLabel}</span>
              </div>
            </div>

            <div className={styles.form}>
              {hasKey ? (
                <div className={styles.keySet}>
                  <CheckCircle2 size={14} aria-hidden />
                  키가 등록되어 있습니다. 새 키를 입력하면 교체됩니다.
                </div>
              ) : null}
              <div>
                <label className={styles.label} htmlFor={`${activeProvider}-api-key-input`}>
                  {keyLabel}
                </label>
                <div className={styles.inputRow}>
                  <input
                    id={`${activeProvider}-api-key-input`}
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
                  {hasKey ? <Sparkles size={14} aria-hidden /> : <ShieldCheck size={14} aria-hidden />}
                  {saving ? '저장 중...' : hasKey ? '키 갱신' : '키 등록'}
                </button>
                {hasKey ? (
                  <button
                    type="button"
                    className={`${styles.ghostButton} ${styles.dangerButton}`}
                    onClick={() => { void onDelete(); }}
                    disabled={saving || deleting}
                  >
                    <Trash2 size={14} aria-hidden />
                    {deleting ? '제거 중...' : '키 제거'}
                  </button>
                ) : null}
                {feedback ? (
                  <span className={`${styles.feedback} ${feedback.ok ? styles.feedbackOk : styles.feedbackErr}`}>
                    {feedback.msg}
                  </span>
                ) : null}
              </div>
            </div>

            <div className={styles.hint}>
              <Info size={14} className={styles.hintIcon} aria-hidden />
              <span>
                키는 워크스페이스 계정에 종속되어 다른 사용자와 공유되지 않습니다. 카탈로그 새로고침 시에만
                재호출됩니다.
              </span>
            </div>
          </>
        ) : (
          <div className={styles.placeholderPanel}>
            <div className={styles.placeholderEyebrow}>{providerTitle} Placeholder</div>
            <div className={styles.placeholderTitle}>{providerTitle} API 키 설정은 다음 단계에서 연결됩니다</div>
            <p className={styles.placeholderText}>
              공급자별 저장 구조는 동일하게 유지합니다. 연결 대상 API의 인증 형태와 키 검증 정책만 provider별로
              다르게 적용합니다.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
