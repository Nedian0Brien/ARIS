import { buildProjectRuntimeActionPath } from '@/lib/projectRuntimeAdapter';

export type AbortChatInput = {
  projectId: string;
  chatId?: string | null;
};

export type AbortProjectChatInput = {
  projectId: string;
  runtimeProjectId?: string | null;
  chatId?: string | null;
};

export type AbortChatResult = {
  accepted: boolean;
  message: string;
};

async function abortChatViaRuntimePath(runtimeActionPath: string, chatId?: string | null): Promise<AbortChatResult> {
  const trimmedChatId = typeof chatId === 'string' && chatId.trim().length > 0 ? chatId.trim() : undefined;
  const response = await fetch(runtimeActionPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'abort', chatId: trimmedChatId }),
    cache: 'no-store',
  });

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    result?: { accepted?: boolean; message?: string };
  };

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' && body.error.length > 0
      ? body.error
      : '에이전트 실행 중단에 실패했습니다.');
  }

  const result = body?.result ?? {};
  return {
    accepted: Boolean(result.accepted),
    message: typeof result.message === 'string' ? result.message : '',
  };
}

export async function abortActiveChat({ projectId, chatId }: AbortChatInput): Promise<AbortChatResult> {
  return abortChatViaRuntimePath(`/api/runtime/projects/${encodeURIComponent(projectId)}/actions`, chatId);
}

export async function abortProjectChat({ projectId, runtimeProjectId, chatId }: AbortProjectChatInput): Promise<AbortChatResult> {
  const targetRuntimeProjectId = typeof runtimeProjectId === 'string' && runtimeProjectId.trim()
    ? runtimeProjectId.trim()
    : projectId;
  return abortChatViaRuntimePath(buildProjectRuntimeActionPath(targetRuntimeProjectId), chatId);
}
