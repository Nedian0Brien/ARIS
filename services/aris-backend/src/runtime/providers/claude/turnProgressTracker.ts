const MODEL_SHORTEN_RE = /^(claude|gemini|codex|opencode)-(.+)$/i;

function shortenModel(raw: string): string {
  const m = MODEL_SHORTEN_RE.exec(raw.trim());
  if (!m) return raw.trim();
  return `${m[1]!.toLowerCase()}/${m[2]}`;
}

export type ProgressMeta = {
  step: number;
  elapsedMs: number;
  modelLabel?: string;
};

export class TurnProgressTracker {
  private readonly startedAt = Date.now();
  private stepCount = 0;
  private model?: string;

  nextStep(): void { this.stepCount += 1; }

  setModel(raw: string): void {
    if (this.model || !raw.trim()) return;
    this.model = shortenModel(raw.trim());
  }

  toMeta(): ProgressMeta {
    return {
      step: this.stepCount,
      elapsedMs: Date.now() - this.startedAt,
      ...(this.model ? { modelLabel: this.model } : {}),
    };
  }
}
