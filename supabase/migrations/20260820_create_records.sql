-- 노동조합 문서 자료실(/records) 저장 테이블
-- 첨부파일 실체는 storage 'records-files'(private) 버킷, 여기에는 경로 배열만 보관
-- ⚠️ daenap과 동일 패턴: RLS 활성화 + 정책 0개 → service_role(서버 사이드)로만 접근, 열람은 signed URL

CREATE TABLE IF NOT EXISTS records (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL,                       -- 회의록 | 발송공문 | 수신공문 | 기타
  title TEXT NOT NULL,                          -- 문서 제목
  doc_date DATE,                                -- 문서 날짜 (없을 수 있음)
  counterpart TEXT,                             -- 상대처 (발송처/수신처)
  doc_number TEXT,                              -- 문서번호
  memo TEXT,                                    -- 검색용 메모
  file_paths TEXT[] NOT NULL DEFAULT '{}',      -- records-files 버킷 내 경로 배열
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_records_category ON records(category);
CREATE INDEX IF NOT EXISTS idx_records_doc_date ON records(doc_date DESC);

-- daenap과 동일: RLS 활성화 + 정책 없음 → anon/authenticated 전면 차단, service_role만 접근
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE records IS '프로경륜선수노동조합 문서 자료실(/records). 회의록·공문 등 문서 메타데이터 + 첨부파일 경로. RLS 정책 없음(service_role 서버 사이드 전용), 첨부는 records-files private 버킷 signed URL로 열람.';
COMMENT ON COLUMN records.category IS '문서 분류: 회의록 | 발송공문 | 수신공문 | 기타';
COMMENT ON COLUMN records.doc_date IS '문서 작성/발송/수신 일자. 미상일 수 있어 NULL 허용.';
COMMENT ON COLUMN records.counterpart IS '상대처. 발송공문이면 발송처, 수신공문이면 수신처.';
COMMENT ON COLUMN records.doc_number IS '공문 문서번호 (예: 프로노조-2026-001).';
COMMENT ON COLUMN records.memo IS '검색용 메모. 본문 요약·키워드 등 자유 입력.';
COMMENT ON COLUMN records.file_paths IS 'records-files 버킷 내 오브젝트 경로 배열. 첨부 여러 개 가능. 공개 URL이 아니라 경로만 저장.';

-- 저장소 버킷: records-files (private, 50MB, MIME 제한 없음 — hwp/pdf/docx/xlsx/이미지 혼재)
-- daenap-photos와 동일하게 public=false → signed URL로만 접근
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('records-files', 'records-files', false, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;
