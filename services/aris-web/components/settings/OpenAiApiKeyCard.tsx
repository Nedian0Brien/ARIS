'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import styles from './OpenAiApiKeyCard.module.css';

type Feedback = { ok: boolean; msg: string } | null;

export function OpenAiApiKeyCard({
  hasKey,
  saving,
  deleting,
  feedback,
  onSave,
  onDelete,
}: {
  hasKey: boolean;
  saving: boolean;
  deleting: boolean;
  feedback: Feedback;
  onSave: (apiKey: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (feedback?.ok) {
      setApiKey('');
    }
  }, [feedback]);

  return (
    <section className={styles.card}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <div className={styles.eyebrow}>
              <KeyRound size={14} />
              OpenAI Credentials
            </div>
            <h3 className={styles.title}>모델 카탈로그 전용 API 키</h3>
            <p className={styles.description}>
              키는 암호화 저장되며 OpenAI 모델 목록을 조회할 때만 사용됩니다. 에이전트 실행 경로에는 주입하지 않아
              런타임 노출이나 추가 호출이 발생하지 않습니다.
            </p>
          </div>
          <div className={`${styles.statusPill} ${hasKey ? styles.statusActive : styles.statusInactive}`}>
            {hasKey ? '등록됨' : '미등록'}
          </div>
        </div>

        <div className={styles.securityGrid}>
          <div className={styles.securityItem}>
            <span className={styles.securityLabel}>보관 방식</span>
            <span className={styles.securityValue}>AES-256-GCM 암호화</span>
          </div>
          <div className={styles.securityItem}>
            <span className={styles.securityLabel}>사용 범위</span>
            <span className={styles.securityValue}>설정 탭 카탈로그 조회 전용</span>
          </div>
          <div className={styles.securityItem}>
            <span className={styles.securityLabel}>런타임 분리</span>
            <span className={styles.securityValue}>Codex 실행 인자에 미주입</span>
          </div>
        </div>

        <div className={styles.form}>
          <div>
            <label className={styles.label}>OpenAI API Key</label>
            <div className={styles.inputRow}>
              <input
                className={styles.input}
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={hasKey ? '새 키를 입력하면 교체됩니다' : 'sk-...'}
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
      </div>
    </section>
  );
}
