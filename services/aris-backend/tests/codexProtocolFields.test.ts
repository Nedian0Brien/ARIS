import { describe, expect, it } from 'vitest';
import {
  extractCodexObservedThreadId,
  extractCodexRequestId,
  parseCodexJsonLine,
} from '../src/runtime/providers/codex/codexProtocolFields.js';

describe('codexProtocolFields', () => {
  describe('parseCodexJsonLine', () => {
    it('returns parsed object for valid JSON object lines', () => {
      expect(parseCodexJsonLine('{"thread_id":"abc"}')).toEqual({ thread_id: 'abc' });
    });

    it('returns null and reports the raw line for unparseable input', () => {
      let warned = '';
      const result = parseCodexJsonLine('not json', (raw) => {
        warned = raw;
      });
      expect(result).toBeNull();
      expect(warned).toBe('not json');
    });

    it('returns null for non-object JSON values', () => {
      expect(parseCodexJsonLine('"just a string"')).toBeNull();
      expect(parseCodexJsonLine('42')).toBeNull();
      expect(parseCodexJsonLine('[1,2,3]')).toBeNull();
    });
  });

  describe('extractCodexObservedThreadId', () => {
    it('extracts from snake_case key', () => {
      expect(extractCodexObservedThreadId({ thread_id: 'thread-1' })).toBe('thread-1');
    });

    it('extracts from camelCase key', () => {
      expect(extractCodexObservedThreadId({ threadId: 'thread-2' })).toBe('thread-2');
    });

    it('extracts from lowercase concatenated variant', () => {
      expect(extractCodexObservedThreadId({ threadid: 'thread-3' })).toBe('thread-3');
    });

    it('descends into nested records and arrays', () => {
      const payload = {
        params: {
          result: { resume_thread_id: 'thread-deep' },
        },
      };
      expect(extractCodexObservedThreadId(payload)).toBe('thread-deep');
    });

    it('returns undefined when no key matches', () => {
      expect(extractCodexObservedThreadId({ unrelated: 'x' })).toBeUndefined();
      expect(extractCodexObservedThreadId(null)).toBeUndefined();
    });

    it('ignores empty string values and continues searching', () => {
      const payload = {
        thread_id: '   ',
        params: { threadId: 'real-thread' },
      };
      expect(extractCodexObservedThreadId(payload)).toBe('real-thread');
    });
  });

  describe('extractCodexRequestId', () => {
    it('extracts string ids', () => {
      expect(extractCodexRequestId({ request_id: 'req-1' })).toBe('req-1');
      expect(extractCodexRequestId({ requestId: 'req-2' })).toBe('req-2');
    });

    it('extracts numeric ids', () => {
      expect(extractCodexRequestId({ id: 42 })).toBe(42);
    });

    it('returns undefined when no id-like key is present', () => {
      expect(extractCodexRequestId({ unrelated: true })).toBeUndefined();
    });
  });
});
