ALTER TABLE "ProjectChat"
ADD COLUMN IF NOT EXISTS "modelReasoningEffort" TEXT;

UPDATE "ProjectChat"
SET "modelReasoningEffort" = lower(btrim("modelReasoningEffort"))
WHERE "modelReasoningEffort" IS NOT NULL
  AND btrim("modelReasoningEffort") <> '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ProjectChat_model_reasoning_effort_check'
  ) THEN
    ALTER TABLE "ProjectChat"
    ADD CONSTRAINT "ProjectChat_model_reasoning_effort_check"
    CHECK (
      "modelReasoningEffort" IS NULL
      OR lower(btrim("modelReasoningEffort")) IN ('low', 'medium', 'high', 'xhigh')
    );
  END IF;
END $$;
