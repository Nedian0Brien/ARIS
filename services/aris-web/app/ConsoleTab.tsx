'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Lock, Minus, Plus, FolderOpen } from 'lucide-react';
import type { AuthenticatedUser } from '@/lib/auth/types';
import type { SessionSummary } from '@/lib/happy/types';
import styles from './ConsoleTab.module.css';

// xterm CSS는 클라이언트 번들에만 포함
import '@xterm/xterm/css/xterm.css';

type Props = {
  user: AuthenticatedUser;
  initialSessions: SessionSummary[];
};

const EXTRA_KEYS: { label: string; value: string }[] = [
  { label: 'Tab', value: '\t' },
  { label: 'Ctrl+C', value: '\x03' },
  { label: 'Ctrl+D', value: '\x04' },
  { label: 'Ctrl+Z', value: '\x1a' },
  { label: 'Esc', value: '\x1b' },
  { label: '↑', value: '\x1b[A' },
  { label: '↓', value: '\x1b[B' },
  { label: '←', value: '\x1b[D' },
  { label: '→', value: '\x1b[C' },
  { label: 'Home', value: '\x1b[H' },
  { label: 'End', value: '\x1b[F' },
];

export function ConsoleTab({ user, initialSessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null);
  const fitAddonRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fontSizeRef = useRef(14);
  const [fontSize, setFontSize] = useState(14);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.matchMedia('(max-width: 767px)').matches);
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const connect = useCallback(async (sessionId: string | null) => {
    // 기존 연결 종료
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }
    if (!containerRef.current) return;

    // xterm 동적 로드
    const { Terminal } = await import('@xterm/xterm');
    const { FitAddon } = await import('@xterm/addon-fit');
    const { WebLinksAddon } = await import('@xterm/addon-web-links');

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: fontSizeRef.current,
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#3b82f6',
        cursorAccent: '#0f172a',
        selectionBackground: 'rgba(59,130,246,0.3)',
      },
      cursorBlink: true,
      scrollback: 5000,
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    // 렌더 후 fit (initial paint + delayed re-fit for desktop layout stabilization)
    requestAnimationFrame(() => {
      fitAddon.fit();
      setTimeout(() => fitAddon.fit(), 60);
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // WebSocket 연결
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPath = sessionId ? `/ws/terminal/${encodeURIComponent(sessionId)}` : '/ws/terminal';
    const ws = new WebSocket(`${protocol}//${window.location.host}${wsPath}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // 초기 크기 전송
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    };

    ws.onclose = () => setConnected(false);

    ws.onmessage = (e) => {
      term.write(new Uint8Array(e.data as ArrayBuffer));
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
  }, []);

  // 세션 변경 시 재연결
  useEffect(() => {
    if (user.role !== 'operator') return;
    connect(selectedSessionId);
    return () => {
      wsRef.current?.close();
      termRef.current?.dispose();
    };
  }, [selectedSessionId, connect, user.role]);

  // ResizeObserver로 자동 리사이즈
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
      const term = termRef.current;
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN && term) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 폰트 크기 변경
  const changeFontSize = (delta: number) => {
    const newSize = Math.max(10, Math.min(24, fontSizeRef.current + delta));
    fontSizeRef.current = newSize;
    setFontSize(newSize);
    if (termRef.current) {
      termRef.current.options.fontSize = newSize;
      fitAddonRef.current?.fit();
    }
  };

  // 터미널에 데이터 전송 (모바일 버튼용)
  const sendData = (data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  };

  // viewer 접근 차단
  if (user.role !== 'operator') {
    return (
      <div className={styles.consoleShell}>
        <div className={styles.noAccess}>
          <Lock size={48} strokeWidth={1.5} />
          <p className="title-sm">터미널 접근 권한 없음</p>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            터미널은 operator 역할에서만 사용할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  const activeSessions = initialSessions.filter(
    (s) => s.status === 'running' || s.status === 'idle',
  );

  return (
    <div className={styles.consoleShell}>
      {/* Header */}
      <div className={styles.consoleHeader}>
        <select
          className={styles.sessionSelector}
          value={selectedSessionId ?? ''}
          onChange={(e) => setSelectedSessionId(e.target.value || null)}
        >
          <option value="">새 터미널</option>
          {activeSessions.map((s) => (
            <option key={s.id} value={s.id}>
              [{s.agent}] {s.alias ?? s.projectName ?? s.id.slice(0, 8)}
            </option>
          ))}
        </select>

        <div className={styles.fontControls}>
          <button
            className={styles.iconBtn}
            onClick={() => changeFontSize(-1)}
            title="폰트 축소"
          >
            <Minus size={12} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => changeFontSize(1)}
            title="폰트 확대"
          >
            <Plus size={12} />
          </button>
        </div>

        <span
          className={`${styles.statusDot} ${connected ? styles.connected : styles.disconnected}`}
          title={connected ? '연결됨' : '연결 끊김'}
        />
        <span className={styles.statusLabel}>{connected ? '연결됨' : '연결 끊김'}</span>
      </div>

      {/* xterm 컨테이너 */}
      <div className={styles.xtermContainer} ref={containerRef} />

      {/* 모바일 툴바 */}
      {isMobile && (
        <div className={styles.mobileToolbar}>
          {/* QuickDir 버튼 */}
          {activeSessions.length > 0 && (
            <div className={styles.quickDirScroll}>
              {activeSessions.map((s) => {
                const label = s.alias ?? s.projectName ?? s.id.slice(0, 8);
                return (
                  <button
                    key={s.id}
                    className={styles.quickDirBtn}
                    onClick={() => {
                      setSelectedSessionId(s.id);
                    }}
                    title={`세션으로 전환: ${label}`}
                  >
                    <FolderOpen size={11} />
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* 편의 키 */}
          <div className={styles.extraKeysRow}>
            {EXTRA_KEYS.map((key) => (
              <button
                key={key.label}
                className={styles.extraKey}
                onPointerDown={(e) => {
                  e.preventDefault(); // 가상 키보드 방지
                  sendData(key.value);
                }}
              >
                {key.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
