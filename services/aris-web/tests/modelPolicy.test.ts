import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  resolveRuntimeMessageModel,
  BUILTIN_MODELS_BY_AGENT,
} from '@/lib/happy/modelPolicy';

describe('resolveRuntimeMessageModel', () => {
  it('display label "Opus 4.7" 가 오면 requested로 통과하지 않는다 (회귀 가드)', () => {
    const result = resolveRuntimeMessageModel({
      agent: 'claude',
      requestedModel: 'Opus 4.7',
    });
    expect(result.source).not.toBe('requested');
    // 정확히 어떤 fallback이냐는 정책 디테일이지만, source가 'default'로 떨어지고 fallbackReason이 'requested_disallowed'여야 한다
    expect(result.source).toBe('default');
    expect(result.fallbackReason).toBe('requested_disallowed');
    expect(result.model).toBe(BUILTIN_MODELS_BY_AGENT.claude[0]);
  });

  it('canonical builtin id 가 오면 requested로 통과한다', () => {
    const result = resolveRuntimeMessageModel({
      agent: 'claude',
      requestedModel: 'claude-sonnet-4-6',
    });
    expect(result.source).toBe('requested');
    expect(result.model).toBe('claude-sonnet-4-6');
  });

  it('customModel 로 등록된 id 가 오면 custom으로 통과한다', () => {
    const result = resolveRuntimeMessageModel({
      agent: 'codex',
      requestedModel: 'my-custom-model',
      customModel: 'my-custom-model',
    });
    expect(result.source).toBe('requested');
    expect(result.model).toBe('my-custom-model');
    expect(result.customModel).toBe('my-custom-model');
  });

  it('알 수 없는 id 가 오면 default 로 fallback 한다', () => {
    const result = resolveRuntimeMessageModel({
      agent: 'gemini',
      requestedModel: 'unknown-id',
    });
    expect(result.source).toBe('default');
    expect(result.model).toBe(BUILTIN_MODELS_BY_AGENT.gemini[0]);
    expect(result.fallbackReason).toBe('requested_disallowed');
  });
});
