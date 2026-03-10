ALTER TABLE "SessionChat"
ADD COLUMN IF NOT EXISTS "modelReasoningEffort" TEXT;

UPDATE "SessionChat"
SET "modelReasoningEffort" = lower(btrim("modelReasoningEffort"))
WHERE "modelReasoningEffort" IS NOT NULL
  AND btrim("modelReasoningEffort") <> '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SessionChat_model_reasoning_effort_check'
  ) THEN
    ALTER TABLE "SessionChat"
    ADD CONSTRAINT "SessionChat_model_reasoning_effort_check"
    CHECK (
      "modelReasoningEffort" IS NULL
      OR lower(btrim("modelReasoningEffort")) IN ('low', 'medium', 'high', 'xhigh')
    );
  END IF;
END $$;
