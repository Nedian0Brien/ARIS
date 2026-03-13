import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HappyEventLogger } from '../src/runtime/happyEventLogger.js';

const tempDirs: string[] = [];

function createTempLogsDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aris-happy-log-test-'));
  tempDirs.push(dir);
  return dir;
}

function collectNdjsonFilesRecursively(dir: string, collector: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectNdjsonFilesRecursively(fullPath, collector);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ndjson')) {
      collector.push(fullPath);
    }
  }
  return collector;
}

function collectNdjsonFiles(dir: string): string[] {
  const files: string[] = [];
  return collectNdjsonFilesRecursively(dir, files);
}

describe('HappyEventLogger', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('writes raw and parsed records into separate ndjson files', () => {
    const logsDir = createTempLogsDir();
    const logger = new HappyEventLogger(logsDir, 10_000);

    logger.logRaw({
      sessionId: 's1',
      channel: 'app_server',
      line: '{"type":"item.completed"}',
    });
    logger.logParsed({
      sessionId: 's1',
      channel: 'app_server',
      stage: 'incoming_payload',
      payload: { type: 'item.completed' },
    });

    const files = collectNdjsonFiles(logsDir);
    const rawPath = files.find((entry) => entry.endsWith('-raw.ndjson'));
    const parsedPath = files.find((entry) => entry.endsWith('-parsed.ndjson'));

    expect(rawPath).toBeDefined();
    expect(parsedPath).toBeDefined();

    const raw = readFileSync(rawPath as string, 'utf8').trim().split('\n');
    const parsed = readFileSync(parsedPath as string, 'utf8').trim().split('\n');

    expect(raw).toHaveLength(1);
    expect(parsed).toHaveLength(1);
    expect(JSON.parse(raw[0])).toMatchObject({
      sessionId: 's1',
      channel: 'app_server',
      line: '{"type":"item.completed"}',
    });
    expect(JSON.parse(parsed[0])).toMatchObject({
      sessionId: 's1',
      channel: 'app_server',
      stage: 'incoming_payload',
      payload: { type: 'item.completed' },
    });
  });

  it('prunes oldest ndjson logs when total size exceeds configured limit', () => {
    const logsDir = createTempLogsDir();
    const logger = new HappyEventLogger(logsDir, 350);

    for (let index = 0; index < 12; index += 1) {
      logger.logRaw({
        sessionId: 's1',
        channel: 'exec_cli',
        line: `raw-${index}-${'x'.repeat(80)}`,
      });
      logger.logParsed({
        sessionId: 's1',
        channel: 'exec_cli',
        stage: 'parsed_append',
        payload: { index, detail: 'y'.repeat(80) },
      });
    }

    const files = collectNdjsonFiles(logsDir).filter((filePath) => !filePath.endsWith('happy-prune-events.ndjson'));
    const total = files.reduce((sum, filePath) => sum + statSync(filePath).size, 0);

    expect(total).toBeLessThanOrEqual(350);
  });
});
