-- judge_sanctions 에 출처(source) 구분과 시행일(enforced_at) 추가
--
-- 배경: 제재 데이터 출처가 두 곳이다.
--   judge_racer  = /race/judge/sanctionsracer  (합산적용 위주, 기존 수집분)
--   racer_state  = /racer/state/sanction        (서면경고 포함 전 제재유형)
-- 두 페이지는 No. 를 각자 1부터 매기므로 (no, race_year, venue) 만으로는
-- 서로 다른 제재가 같은 키를 갖게 되어 덮어쓰기가 발생한다.
-- 예) 2026 광명 no.3 → 구: 강병석(합산적용) / 신: 서면경고 건
-- 유니크키에 source 를 포함시켜 두 출처가 공존하도록 한다.

ALTER TABLE judge_sanctions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'judge_racer',
  ADD COLUMN IF NOT EXISTS enforced_at date;

ALTER TABLE judge_sanctions
  DROP CONSTRAINT IF EXISTS judge_sanctions_no_year_venue_key;

ALTER TABLE judge_sanctions
  ADD CONSTRAINT judge_sanctions_source_no_year_venue_key
  UNIQUE (source, no, race_year, venue);

CREATE INDEX IF NOT EXISTS idx_judge_sanctions_source ON judge_sanctions (source);

COMMENT ON COLUMN judge_sanctions.source IS 'judge_racer=/race/judge/sanctionsracer, racer_state=/racer/state/sanction';
COMMENT ON COLUMN judge_sanctions.enforced_at IS '시행일 (racer_state 출처에만 존재)';
