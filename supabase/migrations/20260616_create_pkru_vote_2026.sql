-- 투표 데이터 저장 테이블 (2026)
-- - 투표 링크 토큰 저장 (token, 토큰당 1회만 → UNIQUE)
-- - 15개 항목의 찬성/반대 저장 (votes JSONB, true=찬성 / false=반대)
-- - 투표 시간 기록 (voted_at)
CREATE TABLE pkru_vote_2026 (
  id        BIGSERIAL PRIMARY KEY,
  token     TEXT NOT NULL UNIQUE,          -- 투표 링크 토큰 (1토큰 1투표)
  votes     JSONB NOT NULL,               -- 15개 항목 찬성/반대 예: {"item_1": true, ..., "item_15": false}
  voted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- 투표 시각
  -- votes 가 JSON 객체인지 검증 (15개 항목 개수 검증은 앱 레이어에서 처리)
  CONSTRAINT pkru_vote_2026_votes_is_object CHECK (jsonb_typeof(votes) = 'object')
);

-- 투표 시각 기준 조회용 인덱스
CREATE INDEX idx_pkru_vote_2026_voted_at ON pkru_vote_2026(voted_at);
