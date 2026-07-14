-- 인터뷰 조회 성능: FK(request_id) 인덱스 + status/published_at 복합 인덱스
-- (Postgres는 FK를 자동 인덱싱하지 않음 → enrich 시 seq scan 방지)

CREATE INDEX IF NOT EXISTS idx_interview_responses_request_id
  ON interview_responses(request_id);

-- published 필터 + published_at 정렬을 한 인덱스로 커버
CREATE INDEX IF NOT EXISTS idx_interview_articles_status_published
  ON interview_articles(status, published_at DESC);
