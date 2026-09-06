-- 인터뷰 사진 업로드 실패 기록 테이블
--
-- ⚠️ 존재 이유 (2026-09-06):
--   Vercel Hobby 플랜의 런타임 로그는 1시간이면 사라진다. 2026-09-06 김기동 선수
--   제출 건에서 사진이 Storage에 도달하지 못했는데, 사고 41분 뒤에는 이미 로그가
--   비어 있어 어느 단계에서 끊겼는지 특정하지 못했다.
--   특히 Vercel 서버리스 함수의 요청 본문 상한 4.5MB 초과(413)는 핸들러에
--   도달조차 못 하므로 서버에서는 애초에 아무 로그도 남길 수 없다.
--   → 실패 사실을 DB에 남겨 사후 추적이 가능하게 한다.
--
-- ⚠️ 이 테이블에 대한 기록 실패는 절대 업로드 자체를 막지 않는다 (호출부에서 try-catch).

CREATE TABLE IF NOT EXISTS interview_upload_failures (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_id BIGINT,                            -- interview_requests.id (모를 수 있어 NULL 허용)
  stage TEXT,                                   -- client_fetch | server_formdata | server_convert | server_storage
  error_message TEXT,
  file_name TEXT,
  file_size BIGINT,                             -- 실제 전송한 크기 (클라이언트 압축 후)
  original_size BIGINT,                         -- 사용자가 고른 원본 크기 (클라이언트만 앎)
  user_agent TEXT                               -- 기기 특정용 (아이폰/안드로이드 구분)
);

CREATE INDEX IF NOT EXISTS idx_interview_upload_failures_created_at
  ON interview_upload_failures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_upload_failures_request_id
  ON interview_upload_failures(request_id);

-- records / daenap과 동일: RLS 활성화 + 정책 0개 → anon/authenticated 전면 차단, service_role만 접근
ALTER TABLE interview_upload_failures ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE interview_upload_failures IS '인터뷰 사진 업로드 실패 기록. Vercel Hobby 로그가 1시간이면 사라져 사후 추적이 불가능해 남긴다. RLS 정책 없음(service_role 서버 사이드 전용).';
COMMENT ON COLUMN interview_upload_failures.stage IS '실패 단계: client_fetch(브라우저가 응답을 못 받거나 4xx/5xx 수신 — 413 본문 초과 포함) | server_formdata(multipart 파싱 실패) | server_convert(sharp/heic JPEG 변환 실패) | server_storage(Supabase Storage 업로드 실패)';
COMMENT ON COLUMN interview_upload_failures.file_size IS '실제 전송 크기. 클라이언트 compressImage() 통과 후 값이라 원본과 다를 수 있다.';
COMMENT ON COLUMN interview_upload_failures.original_size IS '사용자가 선택한 원본 파일 크기. 서버는 알 수 없어 클라이언트 신고에만 채워진다.';
