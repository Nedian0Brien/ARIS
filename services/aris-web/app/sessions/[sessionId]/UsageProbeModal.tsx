'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { ChatCommandId, UsageCommandProvider } from './chatCommands';
import { buildUsageProbeDescriptor } from './chatCommands';
import { formatUsageProbeCloseMessage, normalizeUsageProbeMessageData } from './usageProbeTerminal';
import { parseUsageProbeOutput, type ParsedUsageProbe } from './usageProbeParser';
import styles from './UsageProbeModal.module.css';
import '@xterm/xterm/css/xterm.css';

type Props = {
  provider: UsageCommandProvider;
  commandId: ChatCommandId;
  workspacePath: string;
  onClose: () => void;
};

export function UsageProbeModal({ provider, commandId, workspacePath, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null);
  const fitAddonRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const automationTimersRef = useRef<number[]>([]);
  const receivedChunkRef = useRef(false);
  const transcriptRef = useRef('');
  const [probeNonce, setProbeNonce] = useState(0);
  const [connected, setConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('연결 중...');
  const [latestProbeEvent, setLatestProbeEvent] = useState('');
  const [parsedUsage, setParsedUsage] = useState<ParsedUsageProbe>({
    fiveHour: null,
    weekly: null,
  });

  const descriptor = useMemo(
    () => buildUsageProbeDescriptor(provider, commandId, workspacePath),
    [provider, commandId, workspacePath],
  );

  const clearAutomationTimers = useCallback(() => {
    for (const timerId of automationTimersRef.current) {
      window.clearTimeout(timerId);
    }
    automationTimersRef.current = [];
  }, []);

  const appendProbeEvent = useCallback((message: string) => {
    console.info(`[usage-probe:${provider}] ${message}`);
    setLatestProbeEvent(message);
  }, [provider]);

  const runAutomation = useCallback((ws: WebSocket) => {
    clearAutomationTimers();
    for (const step of descriptor.steps) {
      const timerId = window.setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(step.input);
          appendProbeEvent(`입력 전송: ${step.input.trim() || '(empty)'}`);
        }
      }, step.delayMs);
      automationTimersRef.current.push(timerId);
    }
  }, [appendProbeEvent, clearAutomationTimers, descriptor.steps]);

  useEffect(() => {
    let disposed = false;
    receivedChunkRef.current = false;
    transcriptRef.current = '';
    setConnected(false);
    setStatusMessage('연결 중...');
    setLatestProbeEvent('usage probe 초기화');
    setParsedUsage({ fiveHour: null, weekly: null });

    async function boot() {
      if (!containerRef.current) {
        return;
      }

      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ]);
      if (disposed || !containerRef.current) {
        return;
      }

      const term = new Terminal({
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 13,
        theme: {
          background: '#0f172a',
          foreground: '#e2e8f0',
          cursor: '#38bdf8',
          cursorAccent: '#0f172a',
          selectionBackground: 'rgba(56, 189, 248, 0.22)',
        },
        cursorBlink: true,
        scrollback: 6000,
        allowTransparency: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(containerRef.current);
      fitAddon.fit();
      termRef.current = term;
      fitAddonRef.current = fitAddon;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        setConnected(true);
        setStatusMessage('usage probe 실행 중...');
        appendProbeEvent('WebSocket 연결 성공');
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        runAutomation(ws);
      };

      ws.onmessage = (event) => {
        if (disposed) {
          return;
        }
        if (!receivedChunkRef.current) {
          receivedChunkRef.current = true;
          setStatusMessage('터미널 출력 수신 중');
          appendProbeEvent('첫 터미널 출력 수신');
        }
        const normalized = normalizeUsageProbeMessageData(event.data as string | ArrayBuffer);
        term.write(normalized);
        transcriptRef.current += typeof normalized === 'string'
          ? normalized
          : new TextDecoder().decode(normalized);
        if (descriptor.renderMode === 'parsed') {
          setParsedUsage(parseUsageProbeOutput(provider, transcriptRef.current));
        }
      };

      ws.onerror = () => {
        if (!disposed) {
          appendProbeEvent('WebSocket 오류 발생');
        }
      };

      ws.onclose = (event) => {
        if (!disposed) {
          setConnected(false);
          setStatusMessage(formatUsageProbeCloseMessage(event.code, event.reason));
          appendProbeEvent(formatUsageProbeCloseMessage(event.code, event.reason));
        }
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      const observer = new ResizeObserver(() => {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      });
      observer.observe(containerRef.current);
      resizeObserverRef.current = observer;
    }

    void boot();

    return () => {
      disposed = true;
      clearAutomationTimers();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      wsRef.current?.close();
      wsRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      setConnected(false);
    };
  }, [clearAutomationTimers, probeNonce, runAutomation]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.title}>{descriptor.title}</div>
            <div className={styles.subtitle}>{descriptor.guidance}</div>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setProbeNonce((value) => value + 1)}
              title="다시 실행"
              aria-label="다시 실행"
            >
              <RefreshCw size={15} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={onClose}
              title="닫기"
              aria-label="닫기"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className={styles.terminalShell}>
          {descriptor.renderMode === 'parsed' && (
            <div className={styles.usageSummaryGrid}>
              <div className={styles.usageSummaryCard}>
                <div className={styles.usageSummaryLabel}>5-hour</div>
                <div className={styles.usageSummaryValue}>
                  {parsedUsage.fiveHour?.remainingPercent !== undefined
                    ? `${parsedUsage.fiveHour.remainingPercent}%`
                    : '추출 중'}
                </div>
                <div className={styles.usageSummaryMeta}>
                  {parsedUsage.fiveHour?.resetText ?? 'reset 정보 대기중'}
                </div>
              </div>
              <div className={styles.usageSummaryCard}>
                <div className={styles.usageSummaryLabel}>Weekly</div>
                <div className={styles.usageSummaryValue}>
                  {parsedUsage.weekly?.remainingPercent !== undefined
                    ? `${parsedUsage.weekly.remainingPercent}%`
                    : '추출 중'}
                </div>
                <div className={styles.usageSummaryMeta}>
                  {parsedUsage.weekly?.resetText ?? 'reset 정보 대기중'}
                </div>
              </div>
            </div>
          )}
          <div ref={containerRef} className={styles.terminalViewport} />
        </div>

        <div className={styles.footer}>
          <span className={`${styles.statusDot} ${connected ? styles.statusDotConnected : styles.statusDotDisconnected}`} />
          <span>{statusMessage}</span>
        </div>

        {latestProbeEvent && (
          <div className={styles.diagnostics}>
            <div className={styles.diagnosticItem}>{latestProbeEvent}</div>
          </div>
        )}
      </div>
    </div>
  );
}
