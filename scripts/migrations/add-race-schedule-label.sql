-- race_schedule 테이블에 이벤트명(label) 컬럼 추가
ALTER TABLE race_schedule ADD COLUMN IF NOT EXISTS label TEXT;
