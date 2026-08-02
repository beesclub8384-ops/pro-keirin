-- kcycle 제재선수 이력 (/racer/state/sanction) 적재용 테이블
-- ⚠️ 심판제재(judge_sanctions, /race/judge/sanctionsracer)와는 다른 페이지 → 별도 테이블
-- result: 처리결과 셀 전문 보존 / result_category: 7종 분류 (매칭 실패 시 NULL)

CREATE TABLE IF NOT EXISTS racer_sanctions (
  id BIGSERIAL PRIMARY KEY,
  seq_no INTEGER UNIQUE,
  racer_name TEXT,
  cohort TEXT,
  racer_id TEXT,
  result TEXT,            -- 셀 전문 그대로 (예: '출전정지 1회 2일')
  result_category TEXT,   -- 7종 중 하나, 매칭 실패 시 NULL
  reason TEXT,
  effective_date DATE
);
CREATE INDEX IF NOT EXISTS idx_racer_sanctions_racer ON racer_sanctions(racer_id);
CREATE INDEX IF NOT EXISTS idx_racer_sanctions_cat ON racer_sanctions(result_category);
CREATE INDEX IF NOT EXISTS idx_racer_sanctions_date ON racer_sanctions(effective_date);

COMMENT ON TABLE racer_sanctions IS 'kcycle 제재선수 이력 (/racer/state/sanction). 심판제재(judge_sanctions)와 별개.';
COMMENT ON COLUMN racer_sanctions.result IS '처리결과 셀 전문 (예: 출전정지 1회 2일)';
COMMENT ON COLUMN racer_sanctions.result_category IS '7종 카테고리(등록취소/주선제외/경주관여금지/경주관여정지/출전정지/서면경고/기타), 매칭 실패 시 NULL';
