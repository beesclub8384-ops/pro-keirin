-- /records 한글 파일명 지원 — 원본 파일명 보관 컬럼 추가
--
-- Supabase Storage 오브젝트 키는 비ASCII 문자를 거부한다("Invalid key").
-- 기존 경로 형식 {연도}/{타임스탬프}-{랜덤}__{원본이름}.{확장자} 은 원본 이름을 키에 넣기 때문에
-- 한글 파일명(예: 제2대_제1회_정기대의원회_회의록.pdf)이 업로드 단계에서 통째로 거부됐다.
--
-- 해결: 경로에서 원본 이름을 빼고 ASCII만으로 만든다({연도}/{타임스탬프}-{랜덤}.{확장자}).
--       대신 원본 파일명(한글 그대로)을 여기 file_names 에 따로 보관한다.
--       file_paths 와 순서 1:1 대응 — i번째 경로의 원래 이름이 i번째 file_names 값이다.

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS file_names TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN records.file_names IS '첨부 원본 파일명(한글 포함) 배열. file_paths와 순서 1:1 대응. Storage 키는 ASCII만 허용해 경로에 원본 이름을 넣을 수 없으므로 여기 따로 보관한다.';

-- 두 배열의 길이가 어긋나면 목록에서 엉뚱한 이름이 붙는 무음 실패가 된다. DB에서 막는다.
-- (빈 배열은 array_length가 NULL을 돌려주므로 coalesce 필요)
ALTER TABLE records
  DROP CONSTRAINT IF EXISTS records_file_names_len_chk;
ALTER TABLE records
  ADD CONSTRAINT records_file_names_len_chk
  CHECK (coalesce(array_length(file_names, 1), 0) = coalesce(array_length(file_paths, 1), 0));
