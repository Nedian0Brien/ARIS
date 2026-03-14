import { describe, expect, it } from 'vitest';
import { resolveRuntimeModelSelection } from '../src/runtime/modelPolicy.js';

describe('modelPolicy', () => {
  it('accepts gemini-3-flash-preview as a requested runtime model', () => {
    expect(resolveRuntimeModelSelection({
      agent: 'gemini',
      requestedModel: 'gemini-3-flash-preview',
      sessionModel: 'auto-gemini-3',
    })).toEqual({
      agent: 'gemini',
      model: 'gemini-3-flash-preview',
      source: 'requested',
      requestedModel: 'gemini-3-flash-preview',
    });
  });
});
