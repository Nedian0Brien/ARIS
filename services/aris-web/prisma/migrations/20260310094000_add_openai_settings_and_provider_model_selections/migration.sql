ALTER TABLE "UiPreference"
ADD COLUMN IF NOT EXISTS "providerModelSelections" JSONB,
ADD COLUMN IF NOT EXISTS "openAiApiKeyEncrypted" TEXT;
