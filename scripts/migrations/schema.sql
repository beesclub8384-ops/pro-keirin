-- Pro-Keirin Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor

.env.local의 SUPABASE_SERVICE_ROLE_KEY를 이걸로 교체해줘:
SUPABASE_SERVICE_ROLE_KEY=RwNI13Dri4ZFXs_eAjMk3A_A5t0WnPN

-- Extension for Korean text trigram search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- 1. races (~50K rows) — 경주 마스터
-- ============================================
CREATE TABLE races (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  year SMALLINT NOT NULL,
  round SMALLINT NOT NULL,
  day SMALLINT NOT NULL,
  race_no SMALLINT NOT NULL,
  date DATE NOT NULL,
  env_time TEXT,
  env_weather TEXT,
  env_wind_dir TEXT,
  env_wind_speed TEXT,
  env_temp TEXT,
  env_humidity TEXT,
  env_rainfall TEXT,
  env_record_200m TEXT,
  env_last_lap TEXT,
  UNIQUE (year, round, day, race_no)
);

CREATE INDEX idx_races_year ON races (year);
CREATE INDEX idx_races_year_round ON races (year, round);
CREATE INDEX idx_races_year_round_day ON races (year, round, day);
CREATE INDEX idx_races_date ON races (date);

-- ============================================
-- 2. race_results (~300K rows) — 경주 결과
-- ============================================
CREATE TABLE race_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  race_id BIGINT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  back_no SMALLINT NOT NULL,
  name TEXT NOT NULL,
  rank SMALLINT,
  gap TEXT,
  race_time TEXT,
  tactic TEXT,
  disqualified TEXT,
  warning TEXT,
  caution TEXT,
  withdrawal TEXT,
  finish TEXT,
  record_200m TEXT,
  speed_200m REAL,
  UNIQUE (race_id, back_no)
);

CREATE INDEX idx_race_results_race_id ON race_results (race_id);

-- ============================================
-- 3. race_odds (~45K rows) — 배당률
-- ============================================
CREATE TABLE race_odds (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  race_id BIGINT REFERENCES races(id),
  date DATE NOT NULL,
  race_no SMALLINT NOT NULL,
  venue TEXT,
  grade_group TEXT,
  odds_win REAL,
  odds_place_1st REAL,
  odds_place_2nd REAL,
  odds_exacta REAL,
  odds_quinella REAL,
  odds_trio REAL,
  odds_trifecta REAL,
  odds_duet REAL,
  UNIQUE (date, race_no)
);

CREATE INDEX idx_race_odds_race_id ON race_odds (race_id);
CREATE INDEX idx_race_odds_date ON race_odds (date);

-- ============================================
-- 4. decision_card_pages (~3.5K rows)
-- ============================================
CREATE TABLE decision_card_pages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  year SMALLINT NOT NULL,
  round SMALLINT NOT NULL,
  day SMALLINT NOT NULL,
  date DATE NOT NULL,
  UNIQUE (year, round, day)
);

CREATE INDEX idx_dc_pages_year ON decision_card_pages (year);

-- ============================================
-- 5. decision_card_races (~50K rows)
-- ============================================
CREATE TABLE decision_card_races (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id BIGINT NOT NULL REFERENCES decision_card_pages(id) ON DELETE CASCADE,
  race_no SMALLINT NOT NULL,
  start_time TEXT,
  laps TEXT,
  race_type TEXT,
  UNIQUE (page_id, race_no)
);

CREATE INDEX idx_dc_races_page_id ON decision_card_races (page_id);

-- ============================================
-- 6. decision_card_entries (~300K rows)
-- ============================================
CREATE TABLE decision_card_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dc_race_id BIGINT NOT NULL REFERENCES decision_card_races(id) ON DELETE CASCADE,
  back_no SMALLINT NOT NULL,
  racer_id TEXT,
  generation SMALLINT,
  age SMALLINT,
  photo_url TEXT,
  win_rate_venue REAL,
  top2_rate_venue REAL,
  top3_rate_venue REAL,
  win_rate_total REAL,
  top2_rate_total REAL,
  top3_rate_total REAL,
  place_1st SMALLINT,
  place_2nd SMALLINT,
  place_3rd SMALLINT,
  tactic_preempt_total TEXT,
  tactic_push_total TEXT,
  tactic_chase_total TEXT,
  tactic_mark_total TEXT,
  tactic_preempt_round TEXT,
  tactic_push_round TEXT,
  tactic_chase_round TEXT,
  tactic_mark_round TEXT,
  grade_adjust TEXT,
  recent3_score_venue TEXT,
  recent3_score_total TEXT,
  performance_rank TEXT,
  UNIQUE (dc_race_id, back_no)
);

CREATE INDEX idx_dc_entries_race_id ON decision_card_entries (dc_race_id);

-- ============================================
-- 7. entries (~320K rows) — 출전 기록
-- ============================================
CREATE TABLE entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  venue TEXT,
  week SMALLINT,
  day SMALLINT,
  race_no SMALLINT NOT NULL,
  back_no SMALLINT NOT NULL,
  color TEXT,
  racer_name TEXT,
  racer_age SMALLINT,
  grade TEXT,
  grade_code TEXT,
  grade_prev TEXT,
  training TEXT,
  gear_rate REAL,
  race_len SMALLINT,
  win_rate REAL,
  top2_rate REAL,
  avg_score REAL,
  rec_200m TEXT,
  UNIQUE (date, race_no, back_no)
);

CREATE INDEX idx_entries_date ON entries (date);

-- ============================================
-- 8. racer_profiles (~13K rows) — 선수 프로필 (연도별)
-- ============================================
CREATE TABLE racer_profiles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  racer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  year SMALLINT NOT NULL,
  grade_change TEXT,
  win_rate REAL,
  top2_rate REAL,
  top3_rate REAL,
  race_count SMALLINT,
  run_days SMALLINT,
  recent3_score REAL,
  recent3_rank SMALLINT,
  total_avg_score REAL,
  total_rank_score REAL,
  recent_200m TEXT,
  training TEXT,
  tactics JSONB,
  violations JSONB,
  indices JSONB,
  UNIQUE (racer_id, year)
);

CREATE INDEX idx_racer_profiles_year ON racer_profiles (year);
CREATE INDEX idx_racer_profiles_name_trgm ON racer_profiles USING gin (name gin_trgm_ops);

-- ============================================
-- 9. rankings (~13K rows) — 랭킹
-- ============================================
CREATE TABLE rankings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  year SMALLINT NOT NULL,
  rank SMALLINT NOT NULL,
  name TEXT NOT NULL,
  generation SMALLINT,
  grade TEXT,
  run_days SMALLINT,
  avg_score REAL,
  avg_score_gm REAL,
  avg_score_cw REAL,
  avg_score_bs REAL,
  recent3 REAL,
  recent3_gm REAL,
  recent3_cw REAL,
  recent3_bs REAL,
  win_rate REAL,
  top2_rate REAL,
  top3_rate REAL,
  UNIQUE (year, rank)
);

CREATE INDEX idx_rankings_year ON rankings (year);
CREATE INDEX idx_rankings_name_year ON rankings (name, year);

-- ============================================
-- 10. racer_ids (~13K rows)
-- ============================================
CREATE TABLE racer_ids (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  racer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  rank SMALLINT,
  year SMALLINT NOT NULL,
  UNIQUE (racer_id, year)
);

CREATE INDEX idx_racer_ids_year ON racer_ids (year);

-- ============================================
-- 11. sanctions (~2.3K rows)
-- ============================================
CREATE TABLE sanctions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  year SMALLINT NOT NULL UNIQUE,
  data JSONB NOT NULL
);

CREATE INDEX idx_sanctions_year ON sanctions (year);

-- ============================================
-- 12. statistics_data (~70 rows) — 배당/매출/고배당/노히트 통계
-- ============================================
CREATE TABLE statistics_data (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stat_type TEXT NOT NULL,
  year SMALLINT,
  data JSONB NOT NULL,
  UNIQUE (stat_type, year)
);

-- ============================================
-- 13. reference_data (~50 rows) — 낙차부상, 상금, 연승 등
-- ============================================
CREATE TABLE reference_data (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data_type TEXT NOT NULL,
  year SMALLINT,
  data JSONB NOT NULL,
  UNIQUE (data_type, year)
);

-- ============================================
-- Row Level Security — public read-only
-- ============================================
ALTER TABLE races ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_card_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_card_races ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_card_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE racer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE racer_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE statistics_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read races" ON races FOR SELECT USING (true);
CREATE POLICY "Public read race_results" ON race_results FOR SELECT USING (true);
CREATE POLICY "Public read race_odds" ON race_odds FOR SELECT USING (true);
CREATE POLICY "Public read decision_card_pages" ON decision_card_pages FOR SELECT USING (true);
CREATE POLICY "Public read decision_card_races" ON decision_card_races FOR SELECT USING (true);
CREATE POLICY "Public read decision_card_entries" ON decision_card_entries FOR SELECT USING (true);
CREATE POLICY "Public read entries" ON entries FOR SELECT USING (true);
CREATE POLICY "Public read racer_profiles" ON racer_profiles FOR SELECT USING (true);
CREATE POLICY "Public read rankings" ON rankings FOR SELECT USING (true);
CREATE POLICY "Public read racer_ids" ON racer_ids FOR SELECT USING (true);
CREATE POLICY "Public read sanctions" ON sanctions FOR SELECT USING (true);
CREATE POLICY "Public read statistics_data" ON statistics_data FOR SELECT USING (true);
CREATE POLICY "Public read reference_data" ON reference_data FOR SELECT USING (true);
