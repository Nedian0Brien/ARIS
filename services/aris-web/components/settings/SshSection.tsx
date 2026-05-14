'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, FileKey, KeyRound, Settings2, UploadCloud } from 'lucide-react';
import styles from '@/app/SettingsTab.module.css';

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

  const isFileLoaded = Boolean(sshPrivateKey && fileName);

  return (
    <div className={`animate-in ${styles.settingsShell}`}>
      <div className={styles.hero}>
        <div className={styles.heroEyebrow}>
          <Settings2 size={14} />
          Runtime Settings
        </div>
        <h2 className={styles.heroTitle}>SSH 자격증명 관리</h2>
        <p className={styles.heroDescription}>
          SSH 자격증명은 보안 영역에서 별도 관리됩니다. 키는 AES-256-GCM으로 암호화되어 저장됩니다.
        </p>
      </div>

      <div className={styles.stack}>
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
