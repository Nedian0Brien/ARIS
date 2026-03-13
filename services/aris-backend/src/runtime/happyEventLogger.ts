import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import * as path from 'node:path';

const DEFAULT_MAX_BYTES = 1_024 * 1_024 * 1_024; // 1GB
const RAW_FILE_SUFFIX = 'raw';
const PARSED_FILE_SUFFIX = 'parsed';
const DELETION_FILE = 'happy-prune-events.ndjson';

type LogRecordType = 'raw' | 'parsed';
type LogFileInfo = {
  filePath: string;
  name: string;
  size: number;
  mtimeMs: number;
};

type LogChannel = 'app_server' | 'exec_cli';
type LogStage = 'incoming_raw' | 'incoming_payload' | 'parsed_append' | 'run_status' | 'turn_status';

export type HappyRawLogRecord = {
  sessionId: string;
  chatId?: string;
  threadId?: string;
  model?: string;
  turnStatus?: string;
  channel: LogChannel;
  line: string;
};

export type HappyParsedLogRecord = {
  sessionId: string;
  chatId?: string;
  threadId?: string;
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
    this.appendRecord('raw', record);
  }

  logParsed(record: HappyParsedLogRecord): void {
    this.appendRecord('parsed', record);
  }

  private appendRecord(type: LogRecordType, record: object): void {
    try {
      this.ensureLogsDir();
      const filePath = this.getLogFilePath(type, record);
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

  private getDateFolder(): string {
    const now = new Date();
    const year = String(now.getFullYear()).padStart(4, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return path.join(this.logsDir, year, month, day);
  }

  private getLogFilePath(type: LogRecordType, record: unknown): string {
    const dateFolder = this.getDateFolder();
    mkdirSync(dateFolder, { recursive: true });
    const conversationKey = this.getConversationKey(record);
    const suffix = type === 'raw' ? RAW_FILE_SUFFIX : PARSED_FILE_SUFFIX;
    const fileName = `${conversationKey}-${suffix}.ndjson`;
    return path.join(dateFolder, fileName);
  }

  private getConversationKey(record: unknown): string {
    const parsedRecord = record as {
      chatId?: unknown;
      threadId?: unknown;
      payload?: unknown;
      sessionId?: unknown;
    };
    const sessionId = this.normalizeLogId(
      typeof parsedRecord.sessionId === 'string'
        ? parsedRecord.sessionId
        : undefined,
    );

    const chatId = this.normalizeLogId(
      typeof parsedRecord.chatId === 'string'
        ? parsedRecord.chatId
        : this.extractChatIdFromPayload(parsedRecord.payload),
    );
    const threadId = this.normalizeLogId(
      typeof parsedRecord.threadId === 'string'
        ? parsedRecord.threadId
        : this.extractThreadIdFromPayload(parsedRecord.payload),
    );

    const safeChatId = chatId || 'no-chat';
    const safeThreadId = threadId || sessionId || 'no-thread';

    return `${safeChatId}-${safeThreadId}`;
  }

  private extractThreadIdFromPayload(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const directThreadId = (payload as { threadId?: unknown }).threadId;
    if (typeof directThreadId === 'string') {
      return directThreadId;
    }

    const nestedThread = (payload as { thread?: unknown }).thread;
    if (nestedThread && typeof nestedThread === 'object') {
      const nestedThreadId = (nestedThread as { id?: unknown }).id;
      if (typeof nestedThreadId === 'string') {
        return nestedThreadId;
      }
    }

    const meta = (payload as { meta?: unknown }).meta;
    if (meta && typeof meta === 'object') {
      const metaThreadId = (meta as { threadId?: unknown }).threadId;
      if (typeof metaThreadId === 'string') {
        return metaThreadId;
      }
    }

    return undefined;
  }

  private extractChatIdFromPayload(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const directChatId = (payload as { chatId?: unknown }).chatId;
    if (typeof directChatId === 'string') {
      return directChatId;
    }

    const meta = (payload as { meta?: unknown }).meta;
    if (meta && typeof meta === 'object') {
      const metaChatId = (meta as { chatId?: unknown }).chatId;
      if (typeof metaChatId === 'string') {
        return metaChatId;
      }
    }

    return undefined;
  }

  private normalizeLogId(raw?: string): string | undefined {
    if (!raw) {
      return undefined;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }

    const safe = trimmed
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);

    return safe || 'invalid-id';
  }

  private recordDeletion(deletedFilePath: string, deletedSize: number, remainingSize: number): void {
    const deletionPath = path.join(this.logsDir, DELETION_FILE);
    const relativePath = path.relative(this.logsDir, deletedFilePath);
    const payload = {
      loggedAt: new Date().toISOString(),
      action: 'delete_old_log_file',
      deletedFile: relativePath || deletedFilePath,
      deletedSize,
      remainingSize,
      maxBytes: this.maxBytes,
    };
    try {
      appendFileSync(deletionPath, `${JSON.stringify(payload)}\n`, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`happy event deletion log write failed: ${message}`);
    }
  }

  private pruneIfNeeded(): void {
    const files = this.collectLogFiles();
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
      try {
        unlinkSync(file.filePath);
        totalBytes -= file.size;
        this.recordDeletion(file.filePath, file.size, totalBytes);
        if (totalBytes <= this.maxBytes) {
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`happy event log prune failed: ${message}`);
      }
    }
  }

  private collectLogFiles(): LogFileInfo[] {
    const files: LogFileInfo[] = [];
    const walk = (dirPath: string): void => {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.ndjson')) {
          continue;
        }
        try {
          const stats = statSync(fullPath);
          files.push({
            filePath: fullPath,
            name: entry.name,
            size: stats.size,
            mtimeMs: stats.mtimeMs,
          });
        } catch {
          // Ignore transient file changes during pruning scan.
        }
      }
    };

    walk(this.logsDir);
    return files;
  }
}
