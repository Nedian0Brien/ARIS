-- Chat별 실측 토큰 사용량(제공자 usage 이벤트/transcript에서 수집)
ALTER TABLE "Chat" ADD COLUMN "usageStats" JSONB;
