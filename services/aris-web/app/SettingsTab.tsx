'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { KeyRound, CheckCircle2, UploadCloud, FileKey, ChevronDown, ChevronUp, Bot } from 'lucide-react';
import styles from './SettingsTab.module.css';

export function SettingsTab() {
  const [sshUser, setSshUser] = useState('ubuntu');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Model Settings State
  const [customModels, setCustomModels] = useState({ codex: '', claude: '', gemini: '' });
  const [modelSaving, setModelSaving] = useState(false);
  const [modelFeedback, setModelFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings/ssh')
      .then((r) => r.json())
      .then((data) => {
        setSshUser(data.sshUser ?? 'ubuntu');
        setHasKey(!!data.hasKey);
      })
      .catch(() => {});

    // Load custom models from localStorage
    const savedModels = localStorage.getItem('customAiModels');
    if (savedModels) {
      try {
        setCustomModels(JSON.parse(savedModels));
      } catch (e) {}
    }
  }, []);

  const loadFile = useCallback((file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setSshPrivateKey(text);
      setFileName(file.name);
      setShowTextInput(false);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, [loadFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  };

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

  const handleModelSave = () => {
    setModelSaving(true);
    setModelFeedback(null);
    try {
      localStorage.setItem('customAiModels', JSON.stringify(customModels));
      setModelFeedback({ ok: true, msg: 'AI 모델 설정이 저장되었습니다.' });
      setTimeout(() => setModelFeedback(null), 3000);
    } catch {
      setModelFeedback({ ok: false, msg: '저장 실패' });
    } finally {
      setModelSaving(false);
    }
  };

  const isFileLoaded = !!sshPrivateKey && !!fileName;

  return (
    <div className={`animate-in ${styles.settingsShell}`}>
      {/* AI 모델 설정 섹션 */}
      <div className={styles.section} style={{ marginBottom: '24px' }}>
        <div className={styles.sectionTitle}>
          <Bot size={16} />
          AI 모델 설정
        </div>
        <p className={styles.keyHint} style={{ marginBottom: '16px' }}>
          채팅에서 사용할 각 제공자별 커스텀 모델 이름을 입력하세요. 입력된 모델은 채팅 화면의 모델 선택기에 자동 추가됩니다.
        </p>

        <div className={styles.field}>
          <label className={styles.label}>CODEX (OpenAI) 커스텀 모델</label>
          <input
            className={styles.input}
            type="text"
            value={customModels.codex}
            onChange={(e) => setCustomModels({ ...customModels, codex: e.target.value })}
            placeholder="예: gpt-4-turbo"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Claude (Anthropic) 커스텀 모델</label>
          <input
            className={styles.input}
            type="text"
            value={customModels.claude}
            onChange={(e) => setCustomModels({ ...customModels, claude: e.target.value })}
            placeholder="예: claude-3-opus-20240229"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Gemini (Google) 커스텀 모델</label>
          <input
            className={styles.input}
            type="text"
            value={customModels.gemini}
            onChange={(e) => setCustomModels({ ...customModels, gemini: e.target.value })}
            placeholder="예: gemini-1.5-pro"
          />
        </div>

        <div className={styles.footer}>
          <button className={styles.saveBtn} onClick={handleModelSave} disabled={modelSaving}>
            {modelSaving ? '저장 중...' : '저장'}
          </button>
          {modelFeedback && (
            <span className={modelFeedback.ok ? styles.feedbackOk : styles.feedbackErr}>
              {modelFeedback.msg}
            </span>
          )}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <KeyRound size={16} />
          SSH 터미널 설정
        </div>

        {/* SSH 유저 */}
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

        {/* SSH Key */}
        <div className={styles.field}>
          <label className={styles.label}>SSH Private Key</label>

          {hasKey && !sshPrivateKey && (
            <div className={styles.keySet}>
              <CheckCircle2 size={14} />
              키가 등록되어 있습니다. 새 파일을 올리면 교체됩니다.
            </div>
          )}

          {/* 드롭존 */}
          <div
            className={`${styles.dropzone} ${dragOver ? styles.dragOver : ''} ${isFileLoaded ? styles.fileLoaded : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
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

          {/* 텍스트 직접 입력 토글 */}
          <button
            className={styles.textToggle}
            onClick={() => setShowTextInput((v) => !v)}
          >
            {showTextInput ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            텍스트로 직접 입력
          </button>

          {showTextInput && (
            <textarea
              className={styles.textarea}
              value={sshPrivateKey}
              onChange={(e) => { setSshPrivateKey(e.target.value); setFileName(null); }}
              placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
              spellCheck={false}
              autoComplete="off"
            />
          )}

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
