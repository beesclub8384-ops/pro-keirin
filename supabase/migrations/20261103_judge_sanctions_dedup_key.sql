-- judge_sanctions 고유키를 내용 기준(dedup_key)으로 변경 + 출처 정리 (2026-11-03)
--
-- 배경:
--   1) kcycle 심판제재 페이지(/race/judge/sanctionsracer)의 No. 는 고정 식별자가 아니다.
--      연도 목록은 2022·2023년 7페이지부터 서버 오류가 나서 회차(tms) 필터로 받아야 하는데,
--      회차 필터를 걸면 No. 가 회차마다 1부터 다시 매겨진다 → (source,no,race_year,venue) 키로는
--      같은 제재를 같은 행으로 인식할 수 없다.
--   2) source='judge_racer' 에 출처 3곳(kcycle 광명 / lepopark 창원 / spo1 부산)이 섞여 있었다.
--   3) source='racer_state' 144건은 공정제재 페이지(/racer/state/sanction) 데이터로,
--      racer_sanctions 와 중복이다 → 삭제 (백업: docs/recovery/backup-sanctions-before-cleanup-2026-11-03T07-09-44Z.json)
--
-- dedup_key 규칙 (수집기와 반드시 같게 유지):
--   judge_racer(kcycle 광명): racer_id|해당경주(공백 제거)|제재기간(공백 제거)#k
--     k = 같은 내용 안에서 no 오름차순 순번 (페이지에 완전히 같은 행이 2쌍 있다)
--   lepopark(창원) / spo1(부산): no|race_year  (각 사이트 고유 번호 그대로)
--
-- no: 화면 정렬용 표시 번호. kcycle 연도 목록 No. 를 확정할 수 없는 행은 NULL.

BEGIN;

DELETE FROM judge_sanctions WHERE source = 'racer_state';

UPDATE judge_sanctions SET source = 'lepopark' WHERE source = 'judge_racer' AND venue = '창원';
UPDATE judge_sanctions SET source = 'spo1'     WHERE source = 'judge_racer' AND venue = '부산';

ALTER TABLE judge_sanctions ADD COLUMN IF NOT EXISTS dedup_key text;

UPDATE judge_sanctions SET dedup_key = no || '|' || race_year
 WHERE source IN ('lepopark', 'spo1');

UPDATE judge_sanctions j SET dedup_key = k.key
  FROM (
    SELECT id,
           coalesce(racer_id, '') || '|' || regexp_replace(coalesce(race_info, ''), '\s', '', 'g')
             || '|' || regexp_replace(coalesce(sanction_value, ''), '\s', '', 'g')
             || '#' || row_number() OVER (
                  PARTITION BY racer_id,
                               regexp_replace(coalesce(race_info, ''), '\s', '', 'g'),
                               regexp_replace(coalesce(sanction_value, ''), '\s', '', 'g')
                  ORDER BY race_year, no, id) AS key
      FROM judge_sanctions WHERE source = 'judge_racer'
  ) k
 WHERE j.id = k.id;

ALTER TABLE judge_sanctions ALTER COLUMN dedup_key SET NOT NULL;
ALTER TABLE judge_sanctions ALTER COLUMN no DROP NOT NULL;
ALTER TABLE judge_sanctions DROP CONSTRAINT IF EXISTS judge_sanctions_source_no_year_venue_key;
ALTER TABLE judge_sanctions ADD CONSTRAINT judge_sanctions_source_dedup_key UNIQUE (source, dedup_key);

COMMENT ON COLUMN judge_sanctions.source IS 'judge_racer=kcycle /race/judge/sanctionsracer(광명), lepopark=창원 /api/racer/penalty, spo1=부산 racerSanction.do';
COMMENT ON COLUMN judge_sanctions.dedup_key IS '내용 기준 고유키. 규칙은 supabase/migrations/20261103_judge_sanctions_dedup_key.sql 참조';
COMMENT ON COLUMN judge_sanctions.no IS '표시용 번호(사이트 No.). kcycle 연도 No. 미확정 행은 NULL';

COMMIT;
