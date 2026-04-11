export function normalizeUsageProbeMessageData(data: string | ArrayBuffer): string | Uint8Array {
  if (typeof data === 'string') {
    return data;
  }
  return new Uint8Array(data);
}
