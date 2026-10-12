/**
 * 낙차 대장 — 분류 규칙 단일 모듈
 *
 * race_results 의 사고 관련 필드를 해석하는 규칙은 **여기에만** 둔다.
 * 라우트와 화면이 각자 판정하면 한쪽만 고쳐져 조용히 어긋난다.
 *
 * ⚠️ 빈값 표기가 구장마다 다르다 (실측):
 *   - 광명 계열 → 문자열 '-' (race_time 은 '::')
 *   - 창원·부산 계열 → SQL NULL
 *   `withdrawal <> '-'` 만 쓰면 창원·부산 행이 **전부** 빠지는데 에러는 안 난다.
 *   그래서 빈값 판정은 isBlank() 하나로만 한다.
 */

/** 구장별로 다른 빈값 표기를 모두 빈값으로 본다 */
export function isBlank(v: string | null | undefined): boolean {
  if (v == null) return true;
  const t = v.trim();
  return t === "" || t === "-" || t === "::";
}

/** 값이 있을 때만 그 값을 돌려준다 (없으면 null) */
export function blankToNull(v: string | null | undefined): string | null {
  return isBlank(v) ? null : (v as string).trim();
}

/** 경주 중 이탈 종류. 완주 후 낙차(finishNote)와는 성격이 다르므로 섞지 않는다 */
export type FallType = "낙차" | "사고" | null;

/** 분류에 필요한 최소 필드 — race_results 의 일부 */
export interface FallSourceRow {
  rank: number | null;
  withdrawal: string | null;
  finish: string | null;
  disqualified: string | null;
}

export interface FallClassification {
  /** 경주 중 낙차/사고 (withdrawal 기반). 없으면 null */
  fallType: FallType;
  /** withdrawal 원문 (예: '타선수로낙차'). 없으면 null */
  withdrawalRaw: string | null;
  /**
   * 실격 여부 — 낙차와 **별도 필드**로 둔다.
   * disqualified 는 건수형('1','2')이라 낙차와 동시에 발생할 수 있다.
   */
  isDisqualified: boolean;
  /** disqualified 원문 ('1' | '2' 등). 없으면 null */
  disqualifiedRaw: string | null;
  /**
   * 골인 후 특이사항 (사고입/골인후낙차/낙활입/낙재입/낙휴입/골인후사고).
   * 이 행은 착순이 **있는** 완주 기록이다 — 경주 중 낙차와 합산하면 통계가 틀린다.
   */
  finishNote: string | null;
  /** 완주 실패 (착순 없음). 실격만 있어도 NULL 이 되므로 '낙차'로 단정하면 안 된다 */
  didNotFinish: boolean;
}

export function classifyFall(row: FallSourceRow): FallClassification {
  const withdrawalRaw = blankToNull(row.withdrawal);
  const disqualifiedRaw = blankToNull(row.disqualified);
  const finishNote = blankToNull(row.finish);

  let fallType: FallType = null;
  if (withdrawalRaw) {
    // 실측된 값: 타선수로낙차 / 상호접촉낙차 / 스스로낙차 / 타선수를낙차
    //            타선수로사고 / 상호접촉사고 / 스스로사고 / 타선수를사고
    //            경주기권 / 사고기권
    if (withdrawalRaw.includes("낙차")) fallType = "낙차";
    else if (withdrawalRaw.includes("사고") || withdrawalRaw.includes("기권")) {
      fallType = "사고";
    } else {
      // 처음 보는 표기 — 버리지 말고 '사고'로 모아 눈에 띄게 한다
      fallType = "사고";
    }
  }

  return {
    fallType,
    withdrawalRaw,
    isDisqualified: disqualifiedRaw !== null,
    disqualifiedRaw,
    finishNote,
    didNotFinish: row.rank == null,
  };
}

/**
 * 낙차 대장에 올릴 후보인지.
 * 착순 없음(= 완주 실패) 또는 사고 3개 필드 중 하나라도 값이 있으면 후보다.
 */
export function isFallCandidate(row: FallSourceRow): boolean {
  return (
    row.rank == null ||
    !isBlank(row.withdrawal) ||
    !isBlank(row.finish) ||
    !isBlank(row.disqualified)
  );
}

/**
 * 낙차 이벤트 안정 식별자.
 *
 * ⚠️ 2단계(통장 캡처 → 낙차위로금 지급 건)가 이 키로 낙차 이벤트를 참조한다.
 *    형식을 바꾸면 이미 저장된 지급 건의 연결이 끊긴다. 바꾸지 말 것.
 *
 * racer_id 는 출주표 매칭이 실패하면 없을 수 있어 'unknown' 으로 채운다.
 * (date, venue, race_no, back_no) 만으로도 경주 1건의 선수 1명은 유일하다
 * — race_results UNIQUE(race_id, back_no) + races UNIQUE(year,round,day,race_no,venue)
 */
export function fallEventKey(e: {
  date: string;
  venue: string;
  raceNo: number;
  backNo: number;
  racerId: string | null;
}): string {
  return [e.date, e.venue, e.raceNo, e.backNo, e.racerId ?? "unknown"].join("|");
}
