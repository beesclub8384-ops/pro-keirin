// racer_profiles 기반 등급·지부 변환 유틸
//
// racer_profiles.grade 는 "클래스등급"(SS / S1~S3 / A1~A3 / B1~B3)이고,
// 인터뷰 기사 뱃지에 쓰는 값은 "경주등급"(특선 / 우수 / 선발)이다.
// 실측(2026-09-07, racer_profiles 13,765행): grade 값은
//   A2 168 / A3 167 / A1 165 / B3 151 / B1 149 / B2 148 / S2 55 / S3 55 / S1 55 / SS 10,
//   나머지 12,642행은 null (grade 수집은 2025년부터. 2003~2024년 행은 전부 null).
// racer_profiles.training 은 "청주 / 양승원"(지부 / 코치) 형태. 전 행이 "/" 를 포함한다.

/** 클래스등급(SS/S1~S3/A1~A3/B1~B3) → 경주등급(특선/우수/선발). 모르는 값은 추측하지 않고 null. */
export function toDisplayGrade(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const s = String(detail).trim().toUpperCase();
  if (s === "SS" || s === "S1" || s === "S2" || s === "S3") return "특선";
  if (s === "A1" || s === "A2" || s === "A3") return "우수";
  if (s === "B1" || s === "B2" || s === "B3") return "선발";
  return null;
}

/** "청주 / 양승원" → "청주". "/" 가 없으면 전체를 trim. 빈 값이면 null. */
export function extractRegion(training: string | null | undefined): string | null {
  if (!training) return null;
  const head = String(training).split("/")[0].trim();
  return head || null;
}

export type RacerGradeLookup = {
  grade: string | null;
  region: string | null;
  racerId: string | null;
  /** 같은 이름이 복수 racer_id 로 존재 → 자동 채움 포기(잘못된 등급보다 빈 값이 낫다) */
  duplicateName: boolean;
};

type ProfileRow = {
  racer_id: string | number | null;
  grade: string | null;
  training: string | null;
  year: number | null;
};

type MinimalClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => {
          limit: (n: number) => PromiseLike<{ data: ProfileRow[] | null; error: unknown }>;
        };
      };
    };
  };
};

/**
 * 선수명으로 racer_profiles 를 조회해 경주등급·지부를 구한다.
 * - 최신 year 행 기준.
 * - 동명이인(이름 1개 ↔ racer_id 2개 이상, 2026-09-07 기준 11쌍)이면 자동 채움을 포기하고
 *   duplicateName=true 만 돌려준다.
 * - 조회 실패/예외 시 전부 null (호출자의 요청 생성은 막지 않는다).
 */
export async function lookupRacerGradeRegion(
  sb: unknown,
  name: string,
): Promise<RacerGradeLookup> {
  const empty: RacerGradeLookup = {
    grade: null,
    region: null,
    racerId: null,
    duplicateName: false,
  };
  const target = name.trim();
  if (!target) return empty;

  try {
    const { data, error } = await (sb as MinimalClient)
      .from("racer_profiles")
      .select("racer_id, grade, training, year")
      .eq("name", target)
      .order("year", { ascending: false })
      .limit(200);

    if (error || !data || data.length === 0) return empty;

    const ids = new Set(
      data
        .map((r) => (r.racer_id == null ? "" : String(r.racer_id)))
        .filter((v) => v !== ""),
    );
    if (ids.size > 1) return { ...empty, duplicateName: true };

    // 최신 year 우선. grade 는 2025년부터만 수집되므로 최신 행이 null 이면
    // grade 가 있는 가장 최신 행으로 한 번 더 내려간다.
    const latest = data[0];
    const gradeRow = data.find((r) => toDisplayGrade(r.grade) !== null) ?? latest;
    const regionRow = data.find((r) => extractRegion(r.training) !== null) ?? latest;

    return {
      grade: toDisplayGrade(gradeRow.grade),
      region: extractRegion(regionRow.training),
      racerId: latest.racer_id == null ? null : String(latest.racer_id),
      duplicateName: false,
    };
  } catch {
    return empty;
  }
}
