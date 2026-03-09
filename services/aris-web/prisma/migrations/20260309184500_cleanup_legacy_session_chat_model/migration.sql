-- Normalize legacy/invalid chat model records
UPDATE "SessionChat"
SET "model" = NULL
WHERE "model" IS NOT NULL
  AND btrim("model") = '';

UPDATE "SessionChat"
SET "model" = 'gpt-5.3-codex'
WHERE lower(btrim(coalesce("model", ''))) = 'gpt-5-codex';
