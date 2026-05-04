export type AbortChatInput = {
  sessionId: string;
  chatId?: string | null;
};

export type AbortChatResult = {
  accepted: boolean;
  message: string;
};

export async function abortActiveChat({ sessionId, chatId }: AbortChatInput): Promise<AbortChatResult> {
  const trimmedChatId = typeof chatId === 'string' && chatId.trim().length > 0 ? chatId.trim() : undefined;
  const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/actions`, {
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
