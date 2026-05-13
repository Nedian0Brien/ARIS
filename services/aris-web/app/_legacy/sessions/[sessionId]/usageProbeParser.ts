import type { UsageCommandProvider } from './chatCommands';

export type ParsedUsageBucket = {
  remainingPercent?: number;
  resetText?: string;
};

export type ParsedUsageProbe = {
  fiveHour: ParsedUsageBucket | null;
  weekly: ParsedUsageBucket | null;
};

const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function parseBucket(lines: string[], bucketPattern: RegExp, resetPattern: RegExp): ParsedUsageBucket | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!bucketPattern.test(line)) {
      continue;
    }
    const percentMatch = line.match(/(\d{1,3})\s*%/);
    const resetInline = line.match(resetPattern);
    const nextLine = lines[index + 1] ?? '';
    const resetNext = nextLine.match(resetPattern);
    return {
      ...(percentMatch ? { remainingPercent: Number.parseInt(percentMatch[1] ?? '', 10) } : {}),
      ...(resetInline?.[1] ? { resetText: resetInline[1].trim() } : resetNext?.[1] ? { resetText: resetNext[1].trim() } : {}),
    };
  }
  return null;
}

export function parseUsageProbeOutput(_provider: UsageCommandProvider, rawText: string): ParsedUsageProbe {
  const normalized = rawText
    .replace(ANSI_PATTERN, '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    fiveHour: parseBucket(normalized, /(5[- ]hour|5h)/i, /reset(?:s|ting)?(?:\s+in|\s*:)?\s+(.+)/i),
    weekly: parseBucket(normalized, /weekly/i, /reset(?:s|ting)?(?:\s+in|\s*:)?\s+(.+)/i),
  };
}
