'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileKey,
  Info,
  KeyRound,
  Save,
  UploadCloud,
} from 'lucide-react';
import styles from './SshSection.module.css';

type Feedback = { ok: boolean; msg: string } | null;

export function SshSection() {
  const [sshUser, setSshUser] = useState('ubuntu');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/settings/ssh')
      .then((response) => response.json())
      .then((data) => {
        setSshUser(data.sshUser ?? 'ubuntu');
        setHasKey(Boolean(data.hasKey));
      })
      .catch(() => {});
  }, []);

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

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files[0];
      if (file) {
        loadFile(file);
      }
    },
    [loadFile],
  );

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

  const isFileLoaded = Boolean(sshPrivateKey && fileName);
  const headingId = 'settings-ssh-title';

  return (
    <div className={styles.section}>
      <section className={styles.card} role="region" aria-labelledby={headingId}>
        <div className={styles.inner}>
          <div className={styles.header}>
            <div className={styles.titleWrap}>
              <span className={styles.eyebrow}>
                <KeyRound size={12} aria-hidden />
                Terminal Credentials
              </span>
              <h2 id={headingId} className={styles.title}>SSH</h2>
              <p className={styles.description}>
                SSH 자격증명은 보안 영역에서 별도 관리됩니다. 키는 AES-256-GCM으로 암호화되어
                저장되며, 워크스페이스 터미널 세션에서만 사용됩니다.
              </p>
            </div>
            <div
              className={`${styles.statusPill} ${hasKey ? styles.statusActive : styles.statusInactive}`}
              role="status"
              aria-live="polite"
            >
              <span className={styles.statusPillDot} aria-hidden />
              {hasKey ? 'Stored' : 'Not stored'}
            </div>
          </div>

          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ssh-user-input">
                SSH 접속 유저
              </label>
              <input
                id="ssh-user-input"
                className={styles.input}
                type="text"
                value={sshUser}
                onChange={(event) => setSshUser(event.target.value)}
                placeholder="ubuntu"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className={styles.field}>
              <span className={styles.label}>SSH Private Key</span>

              {hasKey && !sshPrivateKey && (
                <div className={styles.keySet}>
                  <CheckCircle2 size={14} aria-hidden />
                  키가 등록되어 있습니다. 새 파일을 올리면 교체됩니다.
                </div>
              )}

              <div
                className={`${styles.dropzone} ${dragOver ? styles.dropzoneDragOver : ''} ${isFileLoaded ? styles.dropzoneFileLoaded : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="SSH 키 파일 선택"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <span className={styles.dropzoneIcon} aria-hidden>
                  {isFileLoaded ? <FileKey size={22} /> : <UploadCloud size={22} />}
                </span>
                {isFileLoaded ? (
                  <>
                    <p className={styles.dropzoneText}>
                      <strong className={styles.dropzoneFileName}>{fileName}</strong>
                    </p>
                    <p className={styles.dropzoneSub}>클릭하면 다른 파일로 교체합니다</p>
                  </>
                ) : (
                  <>
                    <p className={styles.dropzoneText}>
                      <strong>파일을 드래그</strong>하거나 클릭하여 선택
                    </p>
                    <p className={styles.dropzoneSub}>id_rsa, id_ed25519 · PEM 형식</p>
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
                aria-expanded={showTextInput}
              >
                {showTextInput ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
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
                  aria-label="SSH Private Key 텍스트 입력"
                />
              )}
            </div>

            <div className={styles.hint}>
              <Info size={14} className={styles.hintIcon} aria-hidden />
              <span>키는 AES-256-GCM으로 암호화되어 DB에 저장되며, 평문은 어디에도 기록되지 않습니다.</span>
            </div>
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={14} aria-hidden />
              {saving ? '저장 중...' : '저장'}
            </button>
            {feedback ? (
              <span
                className={`${styles.feedback} ${feedback.ok ? styles.feedbackOk : styles.feedbackErr}`}
                role="status"
                aria-live="polite"
              >
                {feedback.msg}
              </span>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
