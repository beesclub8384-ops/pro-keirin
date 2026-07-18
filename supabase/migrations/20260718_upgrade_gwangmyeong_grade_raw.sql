-- 광명 grade_raw 업그레이드 (근본 해결 최종: 3개장 grade_raw 단일 SSOT)
-- decision_card_races.race_type 원문 → races.grade_raw (결승/준결승/특별 라벨 보존)
-- → 3개장 모두 grade_raw 하나로 결승/준결승/일반 판별 가능, decision_card 조인 의존 제거.
--
-- 범위: 광명 2022~2025 (decision_card 100% 커버, 조인 1:1 검증 완료 — 중복/충돌 0건).
-- 조인: races ↔ decision_card_pages(date, 광명) ↔ decision_card_races(race_no).
--
-- 안전장치:
--   - venue='광명' WHERE 필수. 창원/부산 grade/grade_raw 절대 미변경.
--   - 멱등: 재실행해도 동일 결과.
--   - race_type 없는 경주는 grade_raw 기존값(entries 백필) 유지.

-- ── Step A: 34건 grade 재정렬 (race_type='특선' 인데 entries-MODE grade='우수') ──
--   근거: 출주표 공식 지정(race_type)이 경주 등급의 권위 소스. entries 선수등급 다수결(MODE)은
--         프록시였으며, 연말 특별전(51회차)에서 우수급 선수가 특선 경주에 출전해 MODE가 '우수'로
--         집계된 케이스. 태양 확정 판정 → race_type 기준 '특선'으로 정정.
WITH conflict AS (
  SELECT r.id
  FROM races r
  JOIN decision_card_pages p ON p.date = r.date AND (p.venue = '광명' OR p.venue IS NULL)
  JOIN decision_card_races dr ON dr.page_id = p.id AND dr.race_no = r.race_no
  WHERE r.venue = '광명' AND r.year BETWEEN 2022 AND 2025
    AND dr.race_type = '특선' AND r.grade = '우수'
)
UPDATE races SET grade = '특선' WHERE id IN (SELECT id FROM conflict);

-- ── Step B: 광명 grade_raw = race_type 원문 (그랑프리결승/준결/특우 보존) ──
WITH rt AS (
  SELECT r.id, dr.race_type
  FROM races r
  JOIN decision_card_pages p ON p.date = r.date AND (p.venue = '광명' OR p.venue IS NULL)
  JOIN decision_card_races dr ON dr.page_id = p.id AND dr.race_no = r.race_no
  WHERE r.venue = '광명' AND r.year BETWEEN 2022 AND 2025
    AND dr.race_type IS NOT NULL
)
UPDATE races r SET grade_raw = rt.race_type
FROM rt
WHERE r.id = rt.id;
