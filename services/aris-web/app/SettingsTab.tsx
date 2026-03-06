'use client';

import { useState, useEffect } from 'react';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import styles from './SettingsTab.module.css';

export function SettingsTab() {
  const [sshUser, setSshUser] = useState('ubuntu');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings/ssh')
      .then((r) => r.json())
      .then((data) => {
        setSshUser(data.sshUser ?? 'ubuntu');
        setHasKey(!!data.hasKey);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/ssh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sshUser, sshPrivateKey: sshPrivateKey || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFeedback({ ok: false, msg: data.error ?? '저장 실패' });
      } else {
        if (sshPrivateKey.trim()) setHasKey(true);
        setSshPrivateKey('');
        setFeedback({ ok: true, msg: '저장되었습니다.' });
      }
    } catch {
      setFeedback({ ok: false, msg: '네트워크 오류' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`animate-in ${styles.settingsShell}`}>
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
            onChange={(e) => setSshUser(e.target.value)}
            placeholder="ubuntu"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>SSH Private Key</label>
          {hasKey && !sshPrivateKey && (
            <div className={styles.keySet}>
              <CheckCircle2 size={14} />
              키가 등록되어 있습니다. 새 키를 입력하면 교체됩니다.
            </div>
          )}
          <textarea
            className={styles.textarea}
            value={sshPrivateKey}
            onChange={(e) => setSshPrivateKey(e.target.value)}
            placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
            spellCheck={false}
            autoComplete="off"
          />
          <p className={styles.keyHint}>
            키는 AES-256-GCM으로 암호화되어 DB에 저장됩니다.
          </p>
        </div>

        <div className={styles.footer}>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
          {feedback && (
            <span className={feedback.ok ? styles.feedbackOk : styles.feedbackErr}>
              {feedback.msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
