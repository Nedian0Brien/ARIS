export function normalizeUsageProbeMessageData(data: string | ArrayBuffer): string | Uint8Array {
  if (typeof data === 'string') {
    return data;
  }
  return new Uint8Array(data);
}

export function formatUsageProbeCloseMessage(code: number, reason: string): string {
  const trimmedReason = reason.trim();
  if (trimmedReason) {
    return `연결 종료됨 (code ${code}, ${trimmedReason})`;
  }
  return `연결 종료됨 (code ${code})`;
}
