/**
 * 낙차 대장 — 조회·집계
 *
 * 1단계는 **전부 파생 조회**다. 새 테이블을 만들지 않으므로 2단계(지급 건 저장)가
 * 어떤 저장 모델을 택해도 충돌하지 않는다.
 *
 * 설계상 반드시 지키는 것 3가지:
 *  1) race_results 에는 racer_id 가 없고 name 뿐이다. 동명이인이 11명 있어
 *     이름으로 집계하면 조용히 틀린다 → decision_card_entries 를
 *     (date, venue, race_no, back_no) 로 매칭해 racer_id 를 붙인다.
 *  2) 매칭 실패 행을 **버리지 않는다** (matched:false 로 표시). INNER JOIN 으로 짜면
 *     출주표가 누락된 날의 사고가 대장에서 사라진다 (실측: 2026-08-23 부산·창원).
 *  3) 사고 0건과 "수집이 안 된 것"은 다르다 → (date,venue) 별 경주수·행수를 함께 낸다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase";
import {
  classifyFall,
  fallEventKey,
  isFallCandidate,
  type FallType,
} from "@/lib/falls";

export const VENUES = ["광명", "창원", "부산"] as const;
export type Venue = (typeof VENUES)[number];

/** 기간 상한 (일). 넓게 열면 함수 타임아웃이 난다 */
export const MAX_RANGE_DAYS = 92;

export interface FallRow {
  /** 2단계 지급 건이 참조할 안정 키 */
  key: string;
  date: string;
  venue: string;
  raceNo: number;
  backNo: number;
  racerId: string | null;
  name: string;
  rank: number | null;
  grade: string | null;
  fallType: FallType;
  withdrawalRaw: string | null;
  isDisqualified: boolean;
  disqualifiedRaw: string | null;
  finishNote: string | null;
  didNotFinish: boolean;
  /** 출주표에서 racer_id 를 찾았는지. false 면 선수 확정 불가 */
  matched: boolean;
}

/** (date, venue) 별 분모 — 사고 0건이 실제 무사고인지 판단하는 근거 */
export interface DayVenueTotals {
  date: string;
  venue: string;
  raceCount: number;
  entryCount: number;
  /** 출주표 엔트리 수 (결과와 비교용) */
  dcEntryCount: number;
  fallCount: number;
}

/** 출주표와 결과가 어긋난 날짜·구장 (건강검진 제안 4번) */
export interface FallWarning {
  date: string;
  venue: string;
  dcEntryCount: number;
  entryCount: number;
  /** 출주표에는 있는데 결과에 없는 행 수 */
  missingResults: number;
  /** 결과에는 있는데 출주표에 없는 행 수 (racer_id 미확정 원인) */
  missingEntries: number;
  kind: "결과 누락" | "출주표 누락" | "부분 누락";
}

export interface FallsReport {
  range: { from: string; to: string; venue: Venue | "all" };
  rows: FallRow[];
  totals: DayVenueTotals[];
  warnings: FallWarning[];
  /** 데이터 최종 일자. "최신"이 아니다 — 수집 실행 시각은 DB에 기록되지 않는다 */
  latestDataDate: string | null;
}

interface RaceRow {
  id: number;
  date: string;
  venue: string | null;
  race_no: number;
  grade: string | null;
}

interface ResultRow {
  id: number;
  race_id: number;
  back_no: number;
  name: string;
  rank: number | null;
  withdrawal: string | null;
  finish: string | null;
  disqualified: string | null;
}

interface DcPageRow {
  id: number;
  date: string;
  venue: string;
}

interface DcRaceRow {
  id: number;
  page_id: number;
  race_no: number;
}

interface DcEntryRow {
  id: number;
  dc_race_id: number;
  back_no: number;
  racer_id: string | null;
}

/** (date, venue, race_no, back_no) → 조인 키 */
function entryKey(
  date: string,
  venue: string,
  raceNo: number,
  backNo: number,
): string {
  return `${date}|${venue}|${raceNo}|${backNo}`;
}

function dayVenueKey(date: string, venue: string): string {
  return `${date}|${venue}`;
}

export function diffDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * 기간·구장별 낙차 대장을 만든다.
 *
 * @param sb service role 클라이언트 (서버 전용)
 */
export async function buildFallsReport(
  sb: SupabaseClient,
  opts: { from: string; to: string; venue: Venue | "all" },
): Promise<FallsReport> {
  const { from, to, venue } = opts;

  // ---------------------------------------------------------------- 1. races
  // .order("id") — fetchAllRows 의 페이지 경계에서 행이 중복·누락되지 않게 고유키 정렬.
  // 헬퍼가 대신 정렬해주지 않으므로 호출자가 직접 걸어야 한다.
  let racesQuery = sb
    .from("races")
    .select("id, date, venue, race_no, grade")
    .gte("date", from)
    .lte("date", to)
    .order("id", { ascending: true });
  if (venue !== "all") racesQuery = racesQuery.eq("venue", venue);

  const races = await fetchAllRows<RaceRow>(racesQuery, { orderedBy: "id" });

  const raceById = new Map<number, RaceRow>();
  for (const r of races) raceById.set(r.id, r);

  // ---------------------------------------------------------------- 2. race_results
  const raceIds = races.map((r) => r.id);
  const results: ResultRow[] = [];
  // .in() 에 수천 개를 한 번에 넣으면 URL 길이 제한에 걸린다 → 500개씩 끊는다
  const ID_CHUNK = 500;
  for (let i = 0; i < raceIds.length; i += ID_CHUNK) {
    const chunk = raceIds.slice(i, i + ID_CHUNK);
    const rows = await fetchAllRows<ResultRow>(
      sb
        .from("race_results")
        .select("id, race_id, back_no, name, rank, withdrawal, finish, disqualified")
        .in("race_id", chunk)
        .order("id", { ascending: true }),
      { orderedBy: "id" },
    );
    results.push(...rows);
  }

  // ---------------------------------------------------------------- 3. 출주표 (racer_id)
  let pagesQuery = sb
    .from("decision_card_pages")
    .select("id, date, venue")
    .gte("date", from)
    .lte("date", to)
    .order("id", { ascending: true });
  if (venue !== "all") pagesQuery = pagesQuery.eq("venue", venue);

  const pages = await fetchAllRows<DcPageRow>(pagesQuery, { orderedBy: "id" });
  const pageById = new Map<number, DcPageRow>();
  for (const p of pages) pageById.set(p.id, p);

  const dcRaces: DcRaceRow[] = [];
  const pageIds = pages.map((p) => p.id);
  for (let i = 0; i < pageIds.length; i += ID_CHUNK) {
    const chunk = pageIds.slice(i, i + ID_CHUNK);
    const rows = await fetchAllRows<DcRaceRow>(
      sb
        .from("decision_card_races")
        .select("id, page_id, race_no")
        .in("page_id", chunk)
        .order("id", { ascending: true }),
      { orderedBy: "id" },
    );
    dcRaces.push(...rows);
  }
  const dcRaceById = new Map<number, DcRaceRow>();
  for (const dr of dcRaces) dcRaceById.set(dr.id, dr);

  const dcEntries: DcEntryRow[] = [];
  const dcRaceIds = dcRaces.map((dr) => dr.id);
  for (let i = 0; i < dcRaceIds.length; i += ID_CHUNK) {
    const chunk = dcRaceIds.slice(i, i + ID_CHUNK);
    const rows = await fetchAllRows<DcEntryRow>(
      sb
        .from("decision_card_entries")
        .select("id, dc_race_id, back_no, racer_id")
        .in("dc_race_id", chunk)
        .order("id", { ascending: true }),
      { orderedBy: "id" },
    );
    dcEntries.push(...rows);
  }

  // 출주표 엔트리를 (date, venue, race_no, back_no) 로 색인
  const racerIdByKey = new Map<string, string | null>();
  const dcCountByDayVenue = new Map<string, number>();
  for (const e of dcEntries) {
    const dr = dcRaceById.get(e.dc_race_id);
    if (!dr) continue;
    const p = pageById.get(dr.page_id);
    if (!p) continue;
    racerIdByKey.set(
      entryKey(p.date, p.venue, dr.race_no, e.back_no),
      e.racer_id,
    );
    const dk = dayVenueKey(p.date, p.venue);
    dcCountByDayVenue.set(dk, (dcCountByDayVenue.get(dk) ?? 0) + 1);
  }

  // ---------------------------------------------------------------- 4. 분모 집계
  const totalsMap = new Map<string, DayVenueTotals>();
  const seenRaceByDayVenue = new Map<string, Set<number>>();

  function ensureTotals(date: string, venueName: string): DayVenueTotals {
    const dk = dayVenueKey(date, venueName);
    let t = totalsMap.get(dk);
    if (!t) {
      t = {
        date,
        venue: venueName,
        raceCount: 0,
        entryCount: 0,
        dcEntryCount: dcCountByDayVenue.get(dk) ?? 0,
        fallCount: 0,
      };
      totalsMap.set(dk, t);
    }
    return t;
  }

  // 출주표만 있는 날짜·구장도 분모에 올려야 "결과 누락"이 드러난다
  for (const p of pages) {
    const t = ensureTotals(p.date, p.venue);
    t.dcEntryCount = dcCountByDayVenue.get(dayVenueKey(p.date, p.venue)) ?? 0;
  }

  for (const r of races) {
    if (!r.venue) continue;
    const t = ensureTotals(r.date, r.venue);
    const dk = dayVenueKey(r.date, r.venue);
    let seen = seenRaceByDayVenue.get(dk);
    if (!seen) {
      seen = new Set<number>();
      seenRaceByDayVenue.set(dk, seen);
    }
    if (!seen.has(r.id)) {
      seen.add(r.id);
      t.raceCount += 1;
    }
  }

  // ---------------------------------------------------------------- 5. 후보 행 + racer_id
  const resultKeys = new Set<string>();
  const rows: FallRow[] = [];

  for (const res of results) {
    const race = raceById.get(res.race_id);
    if (!race || !race.venue) continue;

    const t = ensureTotals(race.date, race.venue);
    t.entryCount += 1;
    resultKeys.add(entryKey(race.date, race.venue, race.race_no, res.back_no));

    if (!isFallCandidate(res)) continue;

    const c = classifyFall(res);
    const key = entryKey(race.date, race.venue, race.race_no, res.back_no);
    const matched = racerIdByKey.has(key);
    const racerId = matched ? (racerIdByKey.get(key) ?? null) : null;

    t.fallCount += 1;
    rows.push({
      key: fallEventKey({
        date: race.date,
        venue: race.venue,
        raceNo: race.race_no,
        backNo: res.back_no,
        racerId,
      }),
      date: race.date,
      venue: race.venue,
      raceNo: race.race_no,
      backNo: res.back_no,
      racerId,
      name: res.name,
      rank: res.rank,
      grade: race.grade,
      fallType: c.fallType,
      withdrawalRaw: c.withdrawalRaw,
      isDisqualified: c.isDisqualified,
      disqualifiedRaw: c.disqualifiedRaw,
      finishNote: c.finishNote,
      didNotFinish: c.didNotFinish,
      matched: matched && racerId !== null,
    });
  }

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.venue.localeCompare(b.venue) ||
      a.raceNo - b.raceNo ||
      a.backNo - b.backNo,
  );

  // ---------------------------------------------------------------- 6. 경고 (제안 4번)
  // 출주표 엔트리 중 결과 행이 없는 것, 그 반대를 (date, venue) 별로 센다.
  const missingResultsByDayVenue = new Map<string, number>();
  for (const e of dcEntries) {
    const dr = dcRaceById.get(e.dc_race_id);
    if (!dr) continue;
    const p = pageById.get(dr.page_id);
    if (!p) continue;
    if (!resultKeys.has(entryKey(p.date, p.venue, dr.race_no, e.back_no))) {
      const dk = dayVenueKey(p.date, p.venue);
      missingResultsByDayVenue.set(dk, (missingResultsByDayVenue.get(dk) ?? 0) + 1);
    }
  }

  const missingEntriesByDayVenue = new Map<string, number>();
  for (const res of results) {
    const race = raceById.get(res.race_id);
    if (!race || !race.venue) continue;
    if (!racerIdByKey.has(entryKey(race.date, race.venue, race.race_no, res.back_no))) {
      const dk = dayVenueKey(race.date, race.venue);
      missingEntriesByDayVenue.set(dk, (missingEntriesByDayVenue.get(dk) ?? 0) + 1);
    }
  }

  const warnings: FallWarning[] = [];
  for (const t of totalsMap.values()) {
    const dk = dayVenueKey(t.date, t.venue);
    const missingResults = missingResultsByDayVenue.get(dk) ?? 0;
    const missingEntries = missingEntriesByDayVenue.get(dk) ?? 0;
    if (missingResults === 0 && missingEntries === 0) continue;

    let kind: FallWarning["kind"];
    if (missingResults > 0 && t.entryCount === 0) kind = "결과 누락";
    else if (missingEntries > 0 && t.dcEntryCount === 0) kind = "출주표 누락";
    else kind = "부분 누락";

    warnings.push({
      date: t.date,
      venue: t.venue,
      dcEntryCount: t.dcEntryCount,
      entryCount: t.entryCount,
      missingResults,
      missingEntries,
      kind,
    });
  }
  warnings.sort(
    (a, b) => a.date.localeCompare(b.date) || a.venue.localeCompare(b.venue),
  );

  const totals = [...totalsMap.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.venue.localeCompare(b.venue),
  );

  // 데이터 최종 일자 — races 에 updated_at 이 없어 "수집이 언제 돌았는지"는 알 수 없다.
  // 그래서 "최신"이라 부르지 않고 "최종 데이터 일자"로만 표기한다.
  const latestDataDate =
    races.length > 0
      ? races.reduce((max, r) => (r.date > max ? r.date : max), races[0].date)
      : null;

  return { range: { from, to, venue }, rows, totals, warnings, latestDataDate };
}
