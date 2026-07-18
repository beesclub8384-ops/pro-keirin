-- races 테이블에 경주 등급 컬럼 2개 추가 (근본 해결 1단계)
-- 목표: 광명/창원/부산 3개 경기장이 races.grade 를 단일 진실의 원천으로 사용
--       → entries 테이블 의존 제거, 진영/등급 분석 코드 단일화
--
--   grade     : 정규화된 기저등급 (분석용). '선발' / '우수' / '특선' / NULL
--   grade_raw : 원본 등급 라벨 그대로. kcycle/lepopark/spo1 에서 온 접미사 포함
--               (예: '선발결승', '선발준결', '우수특별', '특선GradeⅠ')
--
-- 이 마이그레이션은 컬럼 추가만 한다. 기존 데이터는 건드리지 않으며 초기값은 전부 NULL.
-- 실제 등급 값 백필은 후속 단계(스크래퍼 등급 캡처 + 백필 스크립트)에서 수행.

ALTER TABLE races ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE races ADD COLUMN IF NOT EXISTS grade_raw text;

-- 정규화 기저등급만 허용 (NULL 허용 = 미백필 상태)
ALTER TABLE races DROP CONSTRAINT IF EXISTS races_grade_check;
ALTER TABLE races ADD CONSTRAINT races_grade_check
  CHECK (grade IS NULL OR grade IN ('선발', '우수', '특선'));

-- 컬럼 코멘트
COMMENT ON COLUMN races.grade IS '정규화 기저등급 (분석용): 선발/우수/특선, 미백필 시 NULL';
COMMENT ON COLUMN races.grade_raw IS 'kcycle/lepopark/spo1 원본 등급 라벨 (결승/준결승/특별 등 접미사 포함)';

-- 분석용 인덱스 (등급 있는 행만 부분 인덱스)
CREATE INDEX IF NOT EXISTS idx_races_grade
  ON races(grade) WHERE grade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_races_venue_grade
  ON races(venue, grade) WHERE grade IS NOT NULL;
