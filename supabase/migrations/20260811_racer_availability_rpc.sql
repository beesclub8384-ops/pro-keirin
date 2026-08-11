-- /racers 선수 가용율(최근 30일/90일 출전) 집계 RPC
--
-- 배경: 기존 src/lib/racer-availability.ts 는 PostgREST 임베드
--   decision_card_entries?select=...decision_card_races!inner(decision_card_pages!inner(date))
-- 를 썼는데, PostgREST 가 LATERAL 안쪽에 LIMIT/OFFSET 을 넣는 탓에 플래너가
-- 선택적인 date 조건(4,999페이지 중 111개)을 바깥으로 끌어올리지 못했다.
-- 그 결과 decision_card_entries(391,986행) 전체 Seq Scan → offset 후반부 4.3초 →
-- anon 역할 statement_timeout(3s) 초과로 상시 실패했다.
-- 같은 조인을 평범한 JOIN 으로 쓰면 33ms 이므로 집계를 DB 로 옮긴다.
--
-- ⚠️ 집계 정의는 기존 TS 로직(racer-availability.ts)을 그대로 옮긴 것이다. 임의 변경 금지.
--   1) 결장 제외      : is_absent 가 true 인 엔트리만 제외 (null/false 는 포함)
--   2) 집계 단위      : racer_id 가 아니라 "공백 제거한 이름" 기준 (동명이인은 합산)
--   3) 이름 매핑      : racer_ids(year>=2024). 매핑 안 되는 racer_id 의 엔트리는 버림
--   4) recent30/90    : 출주 "일수"가 아니라 엔트리 건수 (TS 의 rec.recent90++ 와 동일)
--   5) total_days     : 서로 다른 날짜 수 (TS 의 dates Set 크기와 동일)
--   6) total_entries  : 기간 내 원본 엔트리 행 수 (결장·미매핑 포함, TS 의 entries.length)
--   7) 경기장 필터 없음: 광명·창원·부산이 모두 합산된다. 화면 문구는 "광명 출전 기준"이라
--      실제 동작과 다르지만, 이번 작업은 성능 수정이므로 기존 동작을 그대로 보존했다.
--
-- racer_ids 는 racer_id 당 이름이 유일함을 데이터로 확인하고 DISTINCT 조인했다.
-- cutoff 는 호출자가 넘긴다(기존 TS 가 서버 시각 기준으로 계산하던 것과 동일하게 유지).
-- 미지정 시 UTC 오늘 기준 -90 / -30 일.

DROP FUNCTION IF EXISTS public.fn_racer_availability(date, date);

CREATE OR REPLACE FUNCTION public.fn_racer_availability(
  p_cutoff90 date DEFAULT ((now() AT TIME ZONE 'utc')::date - 90),
  p_cutoff30 date DEFAULT ((now() AT TIME ZONE 'utc')::date - 30)
)
RETURNS TABLE (
  racer_name     text,
  racer_ids      text[],
  recent30       integer,
  recent90       integer,
  last_race_date date,
  total_days     integer,
  total_entries  bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $func$
BEGIN
  -- cutoff 를 리터럴로 박아 매 호출 재계획시킨다.
  -- 파라미터로 넘기면 date >= $1 의 선택도를 기본값(~33%)으로 추정해
  -- decision_card_entries 부터 훑는 generic plan 이 잡혀 4.8초가 걸린다(리터럴이면 33ms).
  RETURN QUERY EXECUTE format($q$
    WITH win AS (  -- 기간 내 엔트리 (원본 그대로, 필터 전)
      SELECT dce.racer_id, dce.is_absent, dcp.date
      FROM decision_card_entries dce
      JOIN decision_card_races  dcr ON dcr.id = dce.dc_race_id
      JOIN decision_card_pages  dcp ON dcp.id = dcr.page_id
      WHERE dcp.date >= %L::date
    ),
    total AS (SELECT count(*) AS n FROM win),
    idmap AS (  -- racer_id → 공백 제거 이름
      SELECT DISTINCT ri.racer_id, replace(ri.name, ' ', '') AS nm
      FROM racer_ids ri
      WHERE ri.year >= 2024 AND ri.racer_id IS NOT NULL AND ri.name IS NOT NULL
    ),
    name_ids AS (  -- 이름별 racer_id 목록 (동명이인 판정용 — 출전 여부 무관)
      SELECT nm, array_agg(DISTINCT racer_id) AS ids
      FROM idmap
      GROUP BY nm
    ),
    agg AS (
      SELECT m.nm,
             count(*) FILTER (WHERE w.date >= %L::date)::int AS r30,
             count(*)::int                                   AS r90,
             max(w.date)                                     AS last_d,
             count(DISTINCT w.date)::int                     AS days
      FROM win w
      JOIN idmap m ON m.racer_id = w.racer_id
      WHERE w.is_absent IS NOT TRUE
      GROUP BY m.nm
    )
    SELECT a.nm, ni.ids, a.r30, a.r90, a.last_d, a.days, t.n
    FROM agg a
    JOIN name_ids ni ON ni.nm = a.nm
    CROSS JOIN total t
    ORDER BY a.nm
  $q$, p_cutoff90, p_cutoff30);
END;
$func$;

COMMENT ON FUNCTION public.fn_racer_availability(date, date) IS
  '/racers 선수 가용율 집계. 이름(공백제거) 기준, is_absent=true 제외, racer_ids(year>=2024) 매핑. 경기장 필터 없음(3개장 합산).';

GRANT EXECUTE ON FUNCTION public.fn_racer_availability(date, date) TO anon, authenticated, service_role;

-- date 필터가 Seq Scan 을 타고 있어 보조 인덱스 추가 (병목은 아니나 저렴한 개선)
CREATE INDEX IF NOT EXISTS idx_dc_pages_date ON public.decision_card_pages (date);
