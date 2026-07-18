-- 광명 races.grade / grade_raw 백필 (근본 해결 4단계: 3개장 등급 단일화)
-- 데이터 소스: entries 테이블 (광명 전용, 이미 정규화된 3종: 선발/우수/특선)
-- 방식: DB 내 UPDATE (kcycle 재파싱 불필요 — 결과 페이지엔 등급 없음)
--
--   grade     = entries의 (date, race_no)별 MODE(최빈값) — 혼합등급 경주는 대표값
--   grade_raw = grade와 동일 (entries엔 결승/준결승 등 원본 접미사 정보가 없음)
--
-- 안전장치:
--   - venue='광명' 만 UPDATE. 창원/부산 grade/grade_raw는 절대 건드리지 않는다.
--   - entries에 등급이 없는 구년도(2003~2016 등) 경주는 매핑 대상에서 제외 → grade NULL 유지.
--   - 멱등: 재실행해도 동일 결과.

WITH rg AS (
  SELECT date, race_no,
         MODE() WITHIN GROUP (ORDER BY grade) AS g
  FROM entries
  WHERE venue = '광명' AND grade IS NOT NULL
  GROUP BY date, race_no
)
UPDATE races r
  SET grade = rg.g,
      grade_raw = rg.g
FROM rg
WHERE r.venue = '광명'
  AND r.date = rg.date
  AND r.race_no = rg.race_no;
