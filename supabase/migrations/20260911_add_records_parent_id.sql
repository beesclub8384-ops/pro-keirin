-- /records 답변 문서 연결 — 원본 공문 아래에 회신을 묶어 보여주기 위한 부모 참조
--
-- 공문 A를 보내고 회신 A-1을 받으면, 지금은 둘이 아무 관계 없는 문서 2건으로 흩어진다.
-- A-1.parent_id = A.id 로 묶어 목록에서 A 아래에 들여쓰기해 보여준다.
--
-- null = 원본 문서, 값 있음 = 답변 문서.
--
-- ⚠️ 1단계만 허용한다 (답변의 답변 금지). 재질의도 답변이 아니라 원본 밑에 단다.
--    깊이 제한은 API(create action)에서 검증한다 — parent_id 가 가리키는 행의
--    parent_id 가 null 인지 확인해서, 답변을 부모로 삼는 요청을 400으로 막는다.
--    DB 제약만으로는 "부모의 부모가 없어야 한다"를 표현할 수 없어(트리거 필요)
--    여기서는 자기 참조만 막는다.
--
-- 삭제 동작(ON DELETE)은 일부러 지정하지 않는다. 현재 /records 에는 삭제 기능이 없고,
-- 기본값(NO ACTION)이면 답변이 달린 원본을 지우려 할 때 DB가 거부한다. 답변만 남아
-- 고아가 되는 것보다 낫다. 삭제 기능을 만들 때 함께 정하면 된다.

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS parent_id BIGINT NULL REFERENCES records(id);

COMMENT ON COLUMN records.parent_id IS '답변 대상 원본 문서의 id. NULL이면 원본 문서, 값이 있으면 그 문서에 대한 답변(회신). 1단계만 허용 — 답변 문서를 부모로 지정할 수 없다(API에서 검증).';

-- 자기 자신을 부모로 지정하는 행을 막는다 (목록 재구성이 무한루프에 빠진다)
ALTER TABLE records
  DROP CONSTRAINT IF EXISTS records_parent_not_self_chk;
ALTER TABLE records
  ADD CONSTRAINT records_parent_not_self_chk
  CHECK (parent_id IS NULL OR parent_id <> id);

-- 원본 1건의 답변을 모아 오는 조회가 기본 동작이다
CREATE INDEX IF NOT EXISTS idx_records_parent_id ON records(parent_id);
