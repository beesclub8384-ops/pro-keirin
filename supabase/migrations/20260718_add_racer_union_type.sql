-- 경륜 선수 노조 3분류를 위한 union_type 컬럼 추가
-- 기존 is_union(boolean, PKRU 여부)만으로는 회색지대/1노조 구분 불가 → 단일 소스로 통합
--   pkru  = 프로경륜선수노동조합 (2노조), 기존 is_union=true
--   gray  = 회색지대 (미조합/미분류) — 명단 기반
--   korru = 한국경륜노동조합 (1노조) — 현재는 NULL(무표시)로 취급, 컬럼값은 향후 확장용
-- is_union 컬럼은 유지한다 (interview/team, admin/racer-list 라우트가 사용 중).

ALTER TABLE racer_profiles
  ADD COLUMN IF NOT EXISTS union_type text;

ALTER TABLE racer_profiles
  DROP CONSTRAINT IF EXISTS racer_profiles_union_type_check;
ALTER TABLE racer_profiles
  ADD CONSTRAINT racer_profiles_union_type_check
  CHECK (union_type IS NULL OR union_type IN ('pkru', 'korru', 'gray'));

-- 1) PKRU: is_union=true 인 모든 행 → 'pkru'
UPDATE racer_profiles
  SET union_type = 'pkru'
  WHERE is_union = true;

-- 2) 회색지대 14명 (아직 pkru로 지정되지 않은 행만) → 'gray'
--    이름 기준. pkru가 우선하므로 union_type IS NULL 조건으로 충돌 방지.
UPDATE racer_profiles
  SET union_type = 'gray'
  WHERE union_type IS NULL
    AND name IN (
      '박종현', '박제원', '이정운', '김원호', '장인석', '류근철', '김현',
      '김규봉', '김이남', '강동규', '성낙송', '이태호', '정충교', '김태율'
    );

CREATE INDEX IF NOT EXISTS idx_racer_profiles_union_type
  ON racer_profiles(union_type);
