'use client';

import { useCallback, useRef, useState } from 'react';
import type { UiEvent } from '@/lib/happy/types';
import { withAppBasePath } from '@/lib/routing/appPath';
import { buildProjectRuntimeTerminalPath } from '@/lib/projectRuntimeAdapter';
import { terminalOutput } from '../../projectChatSurfaceUtils';

export type WorkspaceTerminalEntry = {
  id: string;
  command: string;
  output: string;
  exitCode: number | null;
  running: boolean;
  error: string | null;
};

export type WorkspaceTerminalApi = {
  entries: WorkspaceTerminalEntry[];
  running: boolean;
  run: (command: string) => void;
  clear: () => void;
};

function readExitCode(event: UiEvent | undefined): number | null {
  const value = event?.meta?.exitCode;
  return typeof value === 'number' ? value : null;
}

// 사이드바 Terminal 탭의 원샷 커맨드 러너. 컴포저 Terminal 모드와 같은
// 엔드포인트를 쓴다 — 백엔드가 30초 타임아웃 bash로 실행하고 결과를 채팅
// 이벤트로 영구 저장한다(감사 추적). 여기 entries는 화면 표시용 사본이다.
export function useTerminalRunner(input: {
  projectId: string;
  chatId: string | null;
  workspacePanelId: string | null;
  onEvents?: (events: UiEvent[]) => void;
}): WorkspaceTerminalApi {
  const { projectId, chatId, workspacePanelId, onEvents } = input;
  const [entries, setEntries] = useState<WorkspaceTerminalEntry[]>([]);
  const [running, setRunning] = useState(false);
  const entrySeqRef = useRef(0);

  const run = useCallback((command: string) => {
    const trimmed = command.trim();
    if (!trimmed || running) return;
    entrySeqRef.current += 1;
    const entryId = `term-${entrySeqRef.current}`;
    if (!chatId) {
      setEntries((previous) => [...previous, {
        id: entryId,
        command: trimmed,
        output: '',
        exitCode: null,
        running: false,
        error: '명령을 실행하려면 먼저 채팅을 선택하세요.',
      }]);
      return;
    }
    setRunning(true);
    setEntries((previous) => [...previous, {
      id: entryId,
      command: trimmed,
      output: '',
      exitCode: null,
      running: true,
      error: null,
    }]);
    void fetch(withAppBasePath(buildProjectRuntimeTerminalPath(projectId)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        command: trimmed,
        ...(workspacePanelId ? { workspacePanelId } : {}),
      }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { events?: UiEvent[]; error?: string };
        if (!response.ok || !body.events?.length) {
          throw new Error(body.error ?? '터미널 명령 실행에 실패했습니다.');
        }
        const resultEvent = body.events[body.events.length - 1];
        setEntries((previous) => previous.map((entry) => (entry.id === entryId
          ? {
              ...entry,
              running: false,
              output: terminalOutput(resultEvent),
              exitCode: readExitCode(resultEvent),
            }
          : entry)));
        onEvents?.(body.events);
      })
      .catch((error) => {
        setEntries((previous) => previous.map((entry) => (entry.id === entryId
          ? {
              ...entry,
              running: false,
              error: error instanceof Error ? error.message : '터미널 명령 실행에 실패했습니다.',
            }
          : entry)));
      })
      .finally(() => setRunning(false));
  }, [chatId, onEvents, projectId, running, workspacePanelId]);

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  return { entries, running, run, clear };
}
