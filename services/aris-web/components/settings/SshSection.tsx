'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, FileKey, UploadCloud } from 'lucide-react';
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
    if (!file) return;
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
      if (file) loadFile(file);
    },
    [loadFile],
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) loadFile(file);
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
      <section className={styles.group} aria-labelledby={headingId}>
        <header className={styles.groupHead}>
          <div className={styles.groupHeadText}>
            <span className={styles.groupEyebrow}>Terminal · Secure Shell</span>
            <h2 id={headingId} className={styles.groupTitle}>SSH Credentials</h2>
            <p className={styles.groupSubtitle}>
              키는 AES-256-GCM으로 암호화되어 저장되며, 워크스페이스 터미널 세션에서만 사용됩니다.
              평문은 어디에도 기록되지 않습니다.
            </p>
          </div>
        </header>

        <div className={styles.rowList}>
          {/* Status row */}
          <Row
            label="현재 상태"
            description={
              hasKey
                ? '키가 등록되어 있습니다. 새 파일을 업로드하면 교체됩니다.'
                : '아직 등록된 키가 없습니다. 아래 영역에 키 파일을 업로드해 주세요.'
            }
            trailing={
              <span
                className={`${styles.pill} ${hasKey ? styles.pillOk : styles.pillPending}`}
                role="status"
                aria-live="polite"
              >
                <span className={styles.pillDot} aria-hidden />
                {hasKey ? 'Stored' : 'Not stored'}
              </span>
            }
          />

          {/* SSH user row */}
          <Row
            label={<label htmlFor="ssh-user-input" className={styles.inlineLabel}>SSH 접속 유저</label>}
            description="원격 서버에 연결할 때 사용할 사용자명."
            trailing={
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
            }
          />

          {/* Private key drop zone */}
          <div className={styles.rowVertical}>
            <div className={styles.rowBody}>
              <div className={styles.rowLabel}>
                <span>SSH Private Key</span>
                {hasKey && !sshPrivateKey ? (
                  <span className={styles.inlineNote}>
                    <CheckCircle2 size={12} aria-hidden /> 키 등록됨 — 교체하려면 새 파일을 올리세요
                  </span>
                ) : null}
              </div>
              <div className={styles.rowDescription}>id_rsa, id_ed25519 또는 PEM 파일을 지원합니다.</div>
            </div>

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
                {isFileLoaded ? <FileKey size={20} /> : <UploadCloud size={20} />}
              </span>
              {isFileLoaded ? (
                <div className={styles.dropzoneText}>
                  <strong className={styles.dropzoneFileName}>{fileName}</strong>
                  <span className={styles.dropzoneSub}>클릭하면 다른 파일로 교체합니다</span>
                </div>
              ) : (
                <div className={styles.dropzoneText}>
                  <strong>파일을 드래그</strong>하거나 클릭하여 선택
                  <span className={styles.dropzoneSub}>id_rsa · id_ed25519 · PEM</span>
                </div>
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

            {showTextInput ? (
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
            ) : null}
          </div>

          {/* Save action */}
          <Row
            label="변경사항 저장"
            description="저장 즉시 워크스페이스 터미널에 반영됩니다."
            trailing={
              <div className={styles.trailingGroup}>
                {feedback ? (
                  <span
                    className={`${styles.feedbackText} ${feedback.ok ? styles.feedbackOk : styles.feedbackErr}`}
                    role="status"
                    aria-live="polite"
                  >
                    {feedback.msg}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? '저장 중…' : '저장'}
                </button>
              </div>
            }
          />
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  description,
  trailing,
}: {
  label?: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowBody}>
        {label ? <div className={styles.rowLabel}>{label}</div> : null}
        {description ? <div className={styles.rowDescription}>{description}</div> : null}
      </div>
      {trailing ? <div className={styles.rowTrailing}>{trailing}</div> : null}
    </div>
  );
}
