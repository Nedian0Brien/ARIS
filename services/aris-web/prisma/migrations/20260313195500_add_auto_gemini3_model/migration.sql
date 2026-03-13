ALTER TABLE "SessionChat"
DROP CONSTRAINT IF EXISTS "SessionChat_model_allowed_check";

ALTER TABLE "SessionChat"
ADD CONSTRAINT "SessionChat_model_allowed_check"
CHECK (
  "model" IS NULL
  OR (
    char_length(btrim("model")) BETWEEN 1 AND 120
    AND lower(btrim("model")) <> 'gpt-5-codex'
    AND (
      btrim("model") IN (
        'gpt-5.3-codex', 'gpt-5', 'gpt-5-mini',
        'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5',
        'auto-gemini-3', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'
      )
      OR btrim("model") ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    )
  )
);
