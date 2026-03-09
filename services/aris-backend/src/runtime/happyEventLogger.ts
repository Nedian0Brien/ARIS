import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import * as path from 'node:path';

const DEFAULT_MAX_BYTES = 1_024 * 1_024 * 1_024; // 1GB
const RAW_LOG_FILE = 'happy-raw.ndjson';
const PARSED_LOG_FILE = 'happy-parsed.ndjson';

type LogChannel = 'app_server' | 'exec_cli';
type LogStage = 'incoming_raw' | 'incoming_payload' | 'parsed_append' | 'run_status' | 'turn_status';

export type HappyRawLogRecord = {
  sessionId: string;
  chatId?: string;
  model?: string;
  turnStatus?: string;
  channel: LogChannel;
  line: string;
};

export type HappyParsedLogRecord = {
  sessionId: string;
  chatId?: string;
  model?: string;
  turnStatus?: string;
  channel: LogChannel;
  stage: LogStage;
  payload: unknown;
};

export class HappyEventLogger {
  private readonly logsDir: string;

  private readonly maxBytes: number;

  private initialized = false;

  constructor(logsDir: string, maxBytes = DEFAULT_MAX_BYTES) {
    this.logsDir = logsDir;
    this.maxBytes = maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES;
  }

  logRaw(record: HappyRawLogRecord): void {
    this.appendRecord(RAW_LOG_FILE, record);
  }

  logParsed(record: HappyParsedLogRecord): void {
    this.appendRecord(PARSED_LOG_FILE, record);
  }

  private appendRecord(fileName: string, record: object): void {
    try {
      this.ensureLogsDir();
      const filePath = path.join(this.logsDir, fileName);
      const serialized = JSON.stringify({
        loggedAt: new Date().toISOString(),
        ...record,
      });
      appendFileSync(filePath, `${serialized}\n`, 'utf8');
      this.pruneIfNeeded();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`happy event log write failed: ${message}`);
    }
  }

  private ensureLogsDir(): void {
    if (this.initialized) {
      return;
    }
    mkdirSync(this.logsDir, { recursive: true });
    this.initialized = true;
  }

  private pruneIfNeeded(): void {
    const files = readdirSync(this.logsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .filter((entry) => entry.name.endsWith('.ndjson'))
      .map((entry) => {
        const filePath = path.join(this.logsDir, entry.name);
        const stats = statSync(filePath);
        return {
          filePath,
          name: entry.name,
          size: stats.size,
          mtimeMs: stats.mtimeMs,
        };
      });

    let totalBytes = files.reduce((sum, item) => sum + item.size, 0);
    if (totalBytes <= this.maxBytes) {
      return;
    }

    files.sort((a, b) => {
      if (a.mtimeMs === b.mtimeMs) {
        return a.name.localeCompare(b.name);
      }
      return a.mtimeMs - b.mtimeMs;
    });

    for (const file of files) {
      unlinkSync(file.filePath);
      totalBytes -= file.size;
      if (totalBytes <= this.maxBytes) {
        break;
      }
    }
  }
}
