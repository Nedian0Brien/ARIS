-- Normalize legacy/invalid chat model records
UPDATE "ProjectChat"
SET "model" = NULL
WHERE "model" IS NOT NULL
  AND btrim("model") = '';

UPDATE "ProjectChat"
SET "model" = 'gpt-5.3-codex'
WHERE lower(btrim(coalesce("model", ''))) = 'gpt-5-codex';
