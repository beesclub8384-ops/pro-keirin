-- 진영 대결(프로연합 vs 노동자연합) 통계 RPC
-- /data/union-battle 페이지용. 모든 집계를 DB에서 수행하고 jsonb 하나로 반환.
-- 기간 2023~2025, 광명/창원/부산. SSOT: races.grade + grade_raw.
--   프로연합 = union_type pkru/korru, 노동자연합 = 그 외 (공백정규화 최신 union_type)
--   대립 경주(B) = 양 진영 최소 2명씩 출전, 대상 = 일반+준결(결승 제외)
--   결승은 진출률/성적 배분만 (성적순 편성이라 대립분석 제외)

CREATE OR REPLACE FUNCTION get_union_battle_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $func$
WITH cls AS (
  SELECT DISTINCT ON (nkey) nkey,
    CASE WHEN union_type IN ('pkru','korru') THEN 'pro' ELSE 'labor' END AS camp
  FROM (SELECT regexp_replace(name,'\s+','','g') AS nkey, union_type, year FROM racer_profiles) s
  ORDER BY nkey, year DESC
),
tgt1 AS (  -- 일반+준결 (결승 제외)
  SELECT r.id AS race_id, r.venue, r.grade, r.year
  FROM races r
  WHERE r.venue IN ('광명','창원','부산') AND r.year BETWEEN 2023 AND 2025 AND r.grade IS NOT NULL
    AND (r.grade_raw NOT LIKE '%결승' OR r.grade_raw LIKE '%준결%')
),
ent1 AS (
  SELECT t.race_id, t.venue, t.grade, t.year, rr.rank, COALESCE(c.camp,'labor') AS camp
  FROM tgt1 t JOIN race_results rr ON rr.race_id=t.race_id
  LEFT JOIN cls c ON c.nkey = regexp_replace(rr.name,'\s+','','g')
),
brace AS (  -- B: 양 진영 최소 2명씩
  SELECT race_id FROM ent1 GROUP BY race_id
  HAVING COUNT(*) FILTER (WHERE camp='pro')>=2 AND COUNT(*) FILTER (WHERE camp='labor')>=2
),
vr1 AS (
  SELECT e.venue,e.grade,e.year,e.race_id,e.rank,e.camp
  FROM ent1 e JOIN brace b ON b.race_id=e.race_id WHERE e.rank IS NOT NULL AND e.rank>=1
),
pairs AS (  -- 프로×노동 쌍대결 (결과)
  SELECT p.venue,p.grade,p.year,
    (p.rank<l.rank) AS pro_won, (l.rank<p.rank) AS labor_won, (p.rank=l.rank) AS tied
  FROM vr1 p JOIN vr1 l ON p.race_id=l.race_id AND p.camp='pro' AND l.camp='labor'
),
matrix AS (
  SELECT venue,grade,
    SUM((pro_won)::int) AS pro_win, SUM((labor_won)::int) AS labor_win, SUM((tied)::int) AS tie
  FROM pairs GROUP BY venue,grade
),
trend AS (
  SELECT venue,grade,year,
    SUM((pro_won)::int) AS pro_win, SUM((labor_won)::int) AS labor_win
  FROM pairs GROUP BY venue,grade,year
),
trad AS (
  SELECT e.grade, e.camp,
    COUNT(*) FILTER (WHERE e.rank>=1) AS n,
    COUNT(*) FILTER (WHERE e.rank=1) AS w1,
    COUNT(*) FILTER (WHERE e.rank BETWEEN 1 AND 2) AS w2,
    COUNT(*) FILTER (WHERE e.rank BETWEEN 1 AND 3) AS w3,
    AVG(e.rank) FILTER (WHERE e.rank>=1) AS avgrank
  FROM ent1 e JOIN brace b ON b.race_id=e.race_id
  GROUP BY e.grade, e.camp
),
ent_all AS (  -- 결승 진출률용 (전 종류)
  SELECT r.venue, r.grade,
    (r.grade_raw LIKE '%결승' AND r.grade_raw NOT LIKE '%준결%') AS is_final,
    COALESCE(c.camp,'labor') AS camp
  FROM races r JOIN race_results rr ON rr.race_id=r.id
  LEFT JOIN cls c ON c.nkey = regexp_replace(rr.name,'\s+','','g')
  WHERE r.venue IN ('광명','창원','부산') AND r.year BETWEEN 2023 AND 2025 AND r.grade IS NOT NULL
),
adv AS (
  SELECT venue,grade,camp,
    COUNT(*) AS starts, COUNT(*) FILTER (WHERE is_final) AS fstarts
  FROM ent_all GROUP BY venue,grade,camp
),
adv2 AS (
  SELECT venue, grade,
    MAX(CASE WHEN camp='pro' THEN starts END) AS pro_starts,
    MAX(CASE WHEN camp='pro' THEN fstarts END) AS pro_f,
    MAX(CASE WHEN camp='labor' THEN starts END) AS labor_starts,
    MAX(CASE WHEN camp='labor' THEN fstarts END) AS labor_f
  FROM adv GROUP BY venue,grade
),
fin AS (  -- 결승 착순 기록
  SELECT r.venue, r.grade, rr.rank, COALESCE(c.camp,'labor') AS camp
  FROM races r JOIN race_results rr ON rr.race_id=r.id
  LEFT JOIN cls c ON c.nkey = regexp_replace(rr.name,'\s+','','g')
  WHERE r.venue IN ('광명','창원','부산') AND r.year BETWEEN 2023 AND 2025
    AND r.grade_raw LIKE '%결승' AND r.grade_raw NOT LIKE '%준결%'
    AND rr.rank IS NOT NULL AND rr.rank>=1
),
standings AS (
  SELECT venue,grade,
    COUNT(*) FILTER (WHERE rank=1) AS win, COUNT(*) FILTER (WHERE rank=1 AND camp='pro') AS win_pro,
    COUNT(*) FILTER (WHERE rank BETWEEN 1 AND 2) AS top2, COUNT(*) FILTER (WHERE rank BETWEEN 1 AND 2 AND camp='pro') AS top2_pro,
    COUNT(*) FILTER (WHERE rank BETWEEN 1 AND 3) AS top3, COUNT(*) FILTER (WHERE rank BETWEEN 1 AND 3 AND camp='pro') AS top3_pro
  FROM fin GROUP BY venue,grade
),
gord AS (SELECT '선발'::text g, 1 o UNION ALL SELECT '우수',2 UNION ALL SELECT '특선',3)
SELECT jsonb_build_object(
  'meta', jsonb_build_object('period','2023-2025','venues', jsonb_build_array('광명','창원','부산')),
  'matrix', (SELECT jsonb_agg(jsonb_build_object(
      'venue',venue,'grade',grade,'proWin',pro_win,'laborWin',labor_win,'tie',tie,
      'decisive',pro_win+labor_win,
      'proWinrate', CASE WHEN pro_win+labor_win>0 THEN round(100.0*pro_win/(pro_win+labor_win),1) END,
      'small', (pro_win+labor_win)<300
    ) ORDER BY venue, (SELECT o FROM gord WHERE g=grade)) FROM matrix),
  'trend', (SELECT jsonb_agg(jsonb_build_object(
      'venue',venue,'grade',grade,'year',year,'n',pro_win+labor_win,
      'proWinrate', CASE WHEN pro_win+labor_win>0 THEN round(100.0*pro_win/(pro_win+labor_win),1) END
    ) ORDER BY venue,(SELECT o FROM gord WHERE g=grade),year) FROM trend),
  'traditional', (SELECT jsonb_agg(jsonb_build_object(
      'grade',grade,'camp',camp,'n',n,
      'winRate',round(100.0*w1/NULLIF(n,0),1),
      'top2Rate',round(100.0*w2/NULLIF(n,0),1),
      'top3Rate',round(100.0*w3/NULLIF(n,0),1),
      'avgRank',round(avgrank::numeric,2)
    ) ORDER BY (SELECT o FROM gord WHERE g=grade), camp DESC) FROM trad),
  'finalsAdvance', (SELECT jsonb_agg(jsonb_build_object(
      'venue',venue,'grade',grade,
      'proRate', round(100.0*pro_f/NULLIF(pro_starts,0),2),
      'laborRate', round(100.0*labor_f/NULLIF(labor_starts,0),2),
      'proSlotShare', round(100.0*pro_f/NULLIF(pro_f+labor_f,0),1),
      'finalStarts', COALESCE(pro_f,0)+COALESCE(labor_f,0)
    ) ORDER BY venue, (SELECT o FROM gord WHERE g=grade)) FROM adv2),
  'finalsStandings', (SELECT jsonb_agg(jsonb_build_object(
      'venue',venue,'grade',grade,'win',win,'winPro',win_pro,'top2',top2,'top2Pro',top2_pro,'top3',top3,'top3Pro',top3_pro,
      'winProPct', round(100.0*win_pro/NULLIF(win,0),1),
      'small', win<20
    ) ORDER BY venue, (SELECT o FROM gord WHERE g=grade)) FROM standings)
);
$func$;

-- 무거운 정규식 조인이라 anon 역할 기본 statement_timeout(수 초)을 초과할 수 있다.
-- 함수 실행 동안만 60s로 상향 (API는 1시간 캐시라 콜드 호출 1회만 느림).
ALTER FUNCTION get_union_battle_stats() SET statement_timeout = '60s';
