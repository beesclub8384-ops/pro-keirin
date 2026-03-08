-- 경주 일정 테이블 (연간 전체 경주 예정일)
CREATE TABLE IF NOT EXISTS race_schedule (
  id SERIAL PRIMARY KEY,
  year SMALLINT NOT NULL,
  date DATE NOT NULL,
  round SMALLINT NOT NULL,
  day SMALLINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (year, round, day)
);

CREATE INDEX IF NOT EXISTS idx_race_schedule_year ON race_schedule (year);
CREATE INDEX IF NOT EXISTS idx_race_schedule_date ON race_schedule (date);
