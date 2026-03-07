-- 선수 프로필에 신체정보 컬럼 추가
ALTER TABLE racer_profiles ADD COLUMN IF NOT EXISTS birth_year TEXT;
ALTER TABLE racer_profiles ADD COLUMN IF NOT EXISTS height SMALLINT;
ALTER TABLE racer_profiles ADD COLUMN IF NOT EXISTS weight SMALLINT;
ALTER TABLE racer_profiles ADD COLUMN IF NOT EXISTS blood_type TEXT;
