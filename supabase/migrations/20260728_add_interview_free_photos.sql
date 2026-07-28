-- 인터뷰 폼: 질문과 무관한 자유 첨부 사진 (최대 3장) 저장용 컬럼
-- 질문별 사진은 interview_responses.photo_urls 에, 자유 사진은 여기 별도 보관한다.
-- 기사 생성기(interview-generator)가 이 값을 읽어 article.photos 로 합류시킨다.

ALTER TABLE interview_requests
  ADD COLUMN IF NOT EXISTS free_photos JSONB;

COMMENT ON COLUMN interview_requests.free_photos IS '질문과 무관한 자유 첨부 사진 URL 배열 (선택, 최대 3장)';
