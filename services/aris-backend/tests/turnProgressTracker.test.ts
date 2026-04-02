import { describe, expect, it } from 'vitest';
import { TurnProgressTracker } from '../src/runtime/providers/claude/turnProgressTracker.js';

describe('TurnProgressTracker', () => {
  it('starts with step 0 and zero elapsed approximation', () => {
    const tracker = new TurnProgressTracker();
    const meta = tracker.toMeta();
    expect(meta.step).toBe(0);
    expect(meta.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(meta.modelLabel).toBeUndefined();
  });

  it('increments step on each nextStep call', () => {
    const tracker = new TurnProgressTracker();
    tracker.nextStep();
    tracker.nextStep();
    tracker.nextStep();
    expect(tracker.toMeta().step).toBe(3);
  });

  it('shortens claude model names', () => {
    const tracker = new TurnProgressTracker();
    tracker.setModel('claude-opus-4-6');
    expect(tracker.toMeta().modelLabel).toBe('claude/opus-4-6');
  });

  it('shortens gemini model names', () => {
    const tracker = new TurnProgressTracker();
    tracker.setModel('gemini-2.0-flash');
    expect(tracker.toMeta().modelLabel).toBe('gemini/2.0-flash');
  });

  it('keeps unknown model names as-is', () => {
    const tracker = new TurnProgressTracker();
    tracker.setModel('gpt-4o');
    expect(tracker.toMeta().modelLabel).toBe('gpt-4o');
  });

  it('only records the first setModel call', () => {
    const tracker = new TurnProgressTracker();
    tracker.setModel('claude-opus-4-6');
    tracker.setModel('gemini-2.0-flash');
    expect(tracker.toMeta().modelLabel).toBe('claude/opus-4-6');
  });

  it('ignores empty string in setModel', () => {
    const tracker = new TurnProgressTracker();
    tracker.setModel('');
    expect(tracker.toMeta().modelLabel).toBeUndefined();
  });

  it('elapsedMs grows over time', async () => {
    const tracker = new TurnProgressTracker();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(tracker.toMeta().elapsedMs).toBeGreaterThan(0);
  });
});
