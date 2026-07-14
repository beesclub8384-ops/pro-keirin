-- 인터뷰 폼 접근을 순차 id 대신 추측 불가능한 토큰(UUID)으로 전환
-- /interview/form/15 (열거 가능) → /interview/form/<uuid> (토큰 없으면 접근 불가)

ALTER TABLE interview_requests
  ADD COLUMN IF NOT EXISTS form_token UUID DEFAULT gen_random_uuid() NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_requests_form_token
  ON interview_requests(form_token);

-- 안전망: 혹시 NULL이 있으면 채움 (NOT NULL + DEFAULT라 실제로는 no-op)
UPDATE interview_requests SET form_token = gen_random_uuid() WHERE form_token IS NULL;
