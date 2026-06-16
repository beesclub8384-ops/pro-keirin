// PKRU 2026 투표 항목 설정
// - 위원장 1명 / 부위원장 3명 / 대의원 11명 = 총 15개 항목
// - 각 항목은 찬성(true) / 반대(false) 로 투표
// - id 는 DB(pkru_vote_2026.votes JSONB)의 키로 사용된다: { "item_1": true, ... }

export type VoteRole = "위원장" | "부위원장" | "대의원";

export interface VoteItem {
  /** DB votes JSONB 의 키 (item_1 ~ item_15) */
  id: string;
  /** 후보 이름 */
  name: string;
  /** 직위 */
  role: VoteRole;
}

export const VOTE_ITEMS: VoteItem[] = [
  // 위원장 1명
  { id: "item_1", name: "김형완", role: "위원장" },
  // 부위원장 3명
  { id: "item_2", name: "곽현명", role: "부위원장" },
  { id: "item_3", name: "송대호", role: "부위원장" },
  { id: "item_4", name: "류재민", role: "부위원장" },
  // 대의원 11명
  { id: "item_5", name: "한탁희", role: "대의원" },
  { id: "item_6", name: "박종태", role: "대의원" },
  { id: "item_7", name: "정상민", role: "대의원" },
  { id: "item_8", name: "이기주", role: "대의원" },
  { id: "item_9", name: "이재옥", role: "대의원" },
  { id: "item_10", name: "윤진규", role: "대의원" },
  { id: "item_11", name: "배준호", role: "대의원" },
  { id: "item_12", name: "박진철", role: "대의원" },
  { id: "item_13", name: "김용남", role: "대의원" },
  { id: "item_14", name: "김주한", role: "대의원" },
  { id: "item_15", name: "박용범", role: "대의원" },
];

/** 총 항목 수 (15) */
export const VOTE_TOTAL = VOTE_ITEMS.length;

/** 화면 표시 순서대로의 직위 그룹 */
export const VOTE_ROLES: VoteRole[] = ["위원장", "부위원장", "대의원"];

/** 유효한 항목 id 집합 (API 검증용) */
export const VOTE_ITEM_IDS = new Set(VOTE_ITEMS.map((v) => v.id));

/** 페이지/문서 타이틀 */
export const VOTE_TITLE = "2026년 프로경륜선수노동조합 임원 신임투표";

/** id → 항목 메타 조회 */
export function getVoteItem(id: string): VoteItem | undefined {
  return VOTE_ITEMS.find((v) => v.id === id);
}
