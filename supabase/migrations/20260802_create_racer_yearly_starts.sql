-- kcycle 선수조회(/racer/info) 경주성적의 연도별 출주횟수 적재용 테이블
-- ⚠️ decision_card_* 와 완전히 독립 (나중에 상호 검증용). 기존 테이블 수정 금지.
-- 저장 규칙: raceyy == 요청연도 AND 출주일수 > 0 인 해만 적재 (0/0·폴백은 저장 안 함).

CREATE TABLE IF NOT EXISTS racer_yearly_starts (
  racer_id TEXT NOT NULL,
  year SMALLINT NOT NULL,
  start_count SMALLINT NOT NULL,   -- 출주횟수
  start_days SMALLINT,             -- 출주일수 (판별용으로 쓰니 같이 저장)
  is_retired BOOLEAN,              -- 명단 출처 (N=현역 / Y=은퇴)
  PRIMARY KEY (racer_id, year)
);
CREATE INDEX IF NOT EXISTS idx_rys_year ON racer_yearly_starts(year);

COMMENT ON TABLE racer_yearly_starts IS 'kcycle 선수조회(/racer/info) 경주성적의 연도별 출주횟수. decision_card_*와 독립 (상호 검증용). raceyy==요청연도 AND 출주일수>0 인 해만 적재.';
