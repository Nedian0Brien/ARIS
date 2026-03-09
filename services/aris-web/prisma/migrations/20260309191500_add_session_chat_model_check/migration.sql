-- Legacy/blank value normalization before adding model constraint.
UPDATE "SessionChat"
SET "model" = NULL
WHERE "model" IS NOT NULL
  AND btrim("model") = '';

UPDATE "SessionChat"
SET "model" = 'gpt-5.3-codex'
WHERE lower(btrim(coalesce("model", ''))) = 'gpt-5-codex';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SessionChat_model_allowed_check'
  ) THEN
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
            'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'
          )
          OR btrim("model") ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
        )
      )
    );
  END IF;
END $$;
