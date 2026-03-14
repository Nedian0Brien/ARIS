import { describe, expect, it } from 'vitest';
import { resolveRuntimeModelSelection } from '../src/runtime/modelPolicy.js';

describe('modelPolicy', () => {
  it('accepts gemini-3-flash as a requested runtime model', () => {
    expect(resolveRuntimeModelSelection({
      agent: 'gemini',
      requestedModel: 'gemini-3-flash',
      sessionModel: 'auto-gemini-3',
    })).toEqual({
      agent: 'gemini',
      model: 'gemini-3-flash',
      source: 'requested',
      requestedModel: 'gemini-3-flash',
    });
  });
});
