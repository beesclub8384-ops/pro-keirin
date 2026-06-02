// ============================================================
// 최신 확정출주표 수집 + Supabase 시딩 공유 라이브러리
// - CLI 스크립트 (scripts/fetch-decision-card-latest.ts)
// - Vercel Cron API (src/app/api/cron/fetch-decision-card/route.ts)
// 에서 공통으로 사용
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";

// ========== Types ==========

interface RacerEntry {
  backNo: number;
  racerId: string;
  generation: number;
  age: number;
  photoUrl: string;
  winRateVenue: number;
  top2RateVenue: number;
  top3RateVenue: number;
  winRateTotal: number;
  top2RateTotal: number;
  top3RateTotal: number;
  place1st: number;
  place2nd: number;
  place3rd: number;
  tacticPreemptTotal: string;
  tacticPushTotal: string;
  tacticChaseTotal: string;
  tacticMarkTotal: string;
  tacticPreemptRound: string;
  tacticPushRound: string;
  tacticChaseRound: string;
  tacticMarkRound: string;
  gradeAdjust: string;
  recent3ScoreVenue: string;
  recent3ScoreTotal: string;
  performanceRank: string;
  isAbsent: boolean;
}

interface RecentPerformance {
  backNo: number;
  cells: string[];
}

interface HeadToHead {
  backNo: number;
  vsRecord: string[];
  coPlaceRecord: string[];
  violation2ago: string;
  violation1ago: string;
  violationCurrent: string;
  violationRemain: string;
}

interface RaceDecisionCard {
  raceNo: number;
  startTime: string;
  laps: string;
  raceType: string;
  entries: RacerEntry[];
  recentPerformance: RecentPerformance[];
  headToHead: HeadToHead[];
}

export interface PageDecisionCard {
  year: number;
  round: number;
  day: number;
  date: string;
  races: RaceDecisionCard[];
}

export interface FetchResult {
  success: boolean;
  year?: number;
  round?: number;
  day?: number;
  date?: string;
  racesCount?: number;
  entriesCount?: number;
  message?: string;
}

export interface TargetInfo {
  year: number;
  round: number;
  day: number;
  date: string;
}

// ========== HTML Parsing (from fetch-decision-card.ts) ==========

function decodeHtml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function safeNum(val: string): number {
  const n = parseFloat(val.replace(/,/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 1000) / 1000;
}

function splitRaceSections(html: string): { venue: string; raceNo: number; raceType: string; startTime: string; laps: string; sectionHtml: string }[] {
  const sections: { venue: string; raceNo: number; raceType: string; startTime: string; laps: string; sectionHtml: string }[] = [];

  const headerPattern = /<h[234][^>]*>([\s\S]*?)<\/h[234]>/g;
  const headers: { match: string; index: number; venue: string; raceNo: number; raceType: string; startTime: string }[] = [];

  let m;
  while ((m = headerPattern.exec(html)) !== null) {
    const text = decodeHtml(m[1].replace(/<[^>]*>/g, "").trim());
    const raceMatch = text.match(/(광명|창원|부산)\s+(\d+)\s*경주\s*\(([^\s)]*)\s+(\d{1,2}:\d{2})\)/);
    if (raceMatch) {
      headers.push({
        match: m[0],
        index: m.index!,
        venue: raceMatch[1],
        raceNo: parseInt(raceMatch[2]),
        raceType: raceMatch[3] || "",
        startTime: raceMatch[4] || "",
      });
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i < headers.length - 1 ? headers[i + 1].index : html.length;
    const sectionHtml = html.substring(start, end);

    let laps = "";
    const lapsMatch = sectionHtml.match(/(\d+)\s*주회/);
    if (lapsMatch) laps = lapsMatch[1];

    sections.push({
      venue: headers[i].venue,
      raceNo: headers[i].raceNo,
      raceType: headers[i].raceType,
      startTime: headers[i].startTime,
      laps,
      sectionHtml,
    });
  }

  return sections;
}

function extractTableRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const trs = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

  for (const tr of trs) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map(m => m[1].trim());
    if (cells.length > 0) rows.push(cells);
  }

  return rows;
}

function cellText(cell: string): string {
  return decodeHtml(cell.replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " ");
}

function parseEntryTable(tableHtml: string): RacerEntry[] {
  const entries: RacerEntry[] = [];
  const trs = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

  for (const tr of trs) {
    const trHtml = tr[1];
    const cells = [...trHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)];
    if (cells.length === 0) continue;

    const cell0 = cells[0][1].trim();

    const raceridMatch = cell0.match(/fnRacer\.popup\([^)]*?(\d{8,})/);
    if (!raceridMatch) continue;

    const racerId = raceridMatch[1];
    const backNoMatch = cellText(cell0).match(/^(\d)/);
    const backNo = backNoMatch ? parseInt(backNoMatch[1]) : 0;

    const hasColspan = /colspan\s*=\s*["']\d+["']/.test(trHtml);
    const absentText = cellText(cells.length > 1 ? cells[1][1] : "");
    const isAbsent = hasColspan && cells.length <= 3 && /결\s*장/.test(absentText);

    if (isAbsent) {
      const genAgeMatch = cell0.match(/(\d+)기\s*\/?\s*(\d+)세/);
      const generation = genAgeMatch ? parseInt(genAgeMatch[1]) : 0;
      const age = genAgeMatch ? parseInt(genAgeMatch[2]) : 0;
      const photoMatch = cell0.match(/<img[^>]*src=["']([^"']+)["']/);
      const photoUrl = photoMatch ? photoMatch[1] : "";

      entries.push({
        backNo, racerId, generation, age, photoUrl, isAbsent: true,
        winRateVenue: 0, top2RateVenue: 0, top3RateVenue: 0,
        winRateTotal: 0, top2RateTotal: 0, top3RateTotal: 0,
        place1st: 0, place2nd: 0, place3rd: 0,
        tacticPreemptTotal: "", tacticPushTotal: "", tacticChaseTotal: "", tacticMarkTotal: "",
        tacticPreemptRound: "", tacticPushRound: "", tacticChaseRound: "", tacticMarkRound: "",
        gradeAdjust: "", recent3ScoreVenue: "", recent3ScoreTotal: "", performanceRank: "",
      });
      continue;
    }

    if (cells.length < 10) continue;

    const genAgeMatch = cell0.match(/(\d+)기\s*\/?\s*(\d+)세/);
    const generation = genAgeMatch ? parseInt(genAgeMatch[1]) : 0;
    const age = genAgeMatch ? parseInt(genAgeMatch[2]) : 0;

    const photoMatch = cell0.match(/<img[^>]*src=["']([^"']+)["']/);
    const photoUrl = photoMatch ? photoMatch[1] : "";

    const ct = (idx: number) => cellText(cells[idx]?.[1] || "");

    const winRateVenue = safeNum(ct(4));
    const top2RateVenue = safeNum(ct(5));
    const top3RateVenue = safeNum(ct(6));

    const placeText = ct(7);
    const placeMatch = placeText.match(/(\d+)\D+(\d+)\D+(\d+)/);
    const place1st = placeMatch ? parseInt(placeMatch[1]) : 0;
    const place2nd = placeMatch ? parseInt(placeMatch[2]) : 0;
    const place3rd = placeMatch ? parseInt(placeMatch[3]) : 0;

    const tacticPreemptTotal = ct(8);
    const tacticPushTotal = ct(9);
    const tacticChaseTotal = ct(10);
    const tacticMarkTotal = ct(11);

    const gradeAdjust = ct(12);

    const recent3 = ct(13);
    const r3Parts = recent3.split(/[\/\s]+/);
    const recent3ScoreVenue = r3Parts[0] || recent3;
    const recent3ScoreTotal = r3Parts[1] || "";

    const performanceRank = ct(14);

    entries.push({
      backNo, racerId, generation, age, photoUrl, isAbsent: false,
      winRateVenue, top2RateVenue, top3RateVenue,
      winRateTotal: 0, top2RateTotal: 0, top3RateTotal: 0,
      place1st, place2nd, place3rd,
      tacticPreemptTotal, tacticPushTotal, tacticChaseTotal, tacticMarkTotal,
      tacticPreemptRound: "", tacticPushRound: "", tacticChaseRound: "", tacticMarkRound: "",
      gradeAdjust, recent3ScoreVenue, recent3ScoreTotal, performanceRank,
    });
  }

  return entries;
}

function parseRecentPerformance(tableHtml: string): RecentPerformance[] {
  const results: RecentPerformance[] = [];
  const rows = extractTableRows(tableHtml);

  for (const cells of rows) {
    if (cells.length < 5) continue;
    const text0 = cellText(cells[0]);
    const backNoMatch = text0.match(/^(\d)/);
    if (!backNoMatch) continue;

    results.push({
      backNo: parseInt(backNoMatch[1]),
      cells: cells.map(c => cellText(c)),
    });
  }

  return results;
}

function parseHeadToHead(tableHtml: string): HeadToHead[] {
  const results: HeadToHead[] = [];
  const rows = extractTableRows(tableHtml);

  for (const cells of rows) {
    if (cells.length < 15) continue;
    const text0 = cellText(cells[0]);
    const backNoMatch = text0.match(/^(\d)/);
    if (!backNoMatch) continue;

    results.push({
      backNo: parseInt(backNoMatch[1]),
      vsRecord: cells.slice(1, 8).map(c => cellText(c)),
      coPlaceRecord: cells.slice(8, 15).map(c => cellText(c)),
      violation2ago: cellText(cells[15] || ""),
      violation1ago: cellText(cells[16] || ""),
      violationCurrent: cellText(cells[17] || ""),
      violationRemain: cellText(cells[18] || ""),
    });
  }

  return results;
}

function parseRaceSection(sectionHtml: string, raceNo: number, startTime: string, laps: string, raceType: string): RaceDecisionCard {
  const tables = [...sectionHtml.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];

  let entries: RacerEntry[] = [];
  let recentPerformance: RecentPerformance[] = [];
  let headToHead: HeadToHead[] = [];

  if (tables.length >= 1) {
    entries = parseEntryTable(tables[0][1]);
  }
  if (tables.length >= 3) {
    recentPerformance = parseRecentPerformance(tables[2][1]);
  }
  if (tables.length >= 4) {
    headToHead = parseHeadToHead(tables[3][1]);
  }

  return { raceNo, startTime, laps, raceType, entries, recentPerformance, headToHead };
}

function parsePage(html: string, year: number, round: number, day: number, date: string): PageDecisionCard {
  const sections = splitRaceSections(html);
  const gmSections = sections.filter(s => s.venue === "광명");

  const races: RaceDecisionCard[] = [];
  for (const section of gmSections) {
    races.push(parseRaceSection(
      section.sectionHtml, section.raceNo, section.startTime, section.laps, section.raceType,
    ));
  }

  return { year, round, day, date, races };
}

// ========== Core Logic ==========

/** race_schedule에서 아직 decision_card_pages에 없는 다음 경주일 찾기 */
export async function determineNextTarget(supabase: SupabaseClient): Promise<TargetInfo | null> {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = kstNow.toISOString().slice(0, 10);
  const year = kstNow.getFullYear();

  // 오늘~14일 이내 race_schedule 조회
  const future = new Date(kstNow.getTime() + 14 * 24 * 60 * 60 * 1000);
  const futureStr = future.toISOString().slice(0, 10);

  const { data: schedule, error: schedErr } = await supabase
    .from("race_schedule")
    .select("year, round, day, date")
    .gte("date", today)
    .lte("date", futureStr)
    .order("date", { ascending: true });

  if (schedErr || !schedule || schedule.length === 0) {
    return null;
  }

  // 이미 수집된 decision_card_pages 조회
  const { data: existing } = await supabase
    .from("decision_card_pages")
    .select("round, day")
    .eq("year", year);

  const existingSet = new Set(
    (existing || []).map((p: { round: number; day: number }) => `${p.round}-${p.day}`)
  );

  // 아직 없는 첫 번째 타겟 반환
  for (const s of schedule) {
    const key = `${s.round}-${s.day}`;
    if (!existingSet.has(key)) {
      return { year: s.year, round: s.round, day: s.day, date: s.date };
    }
  }

  return null;
}

/** kcycle.or.kr에서 확정출주표 HTML 가져오기 (SPA — 선수 데이터용) */
export async function fetchDecisionCardHtml(year: number, round: number, day: number): Promise<string> {
  const url = `https://www.kcycle.or.kr/race/card/decision/${year}/${round}/${day}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

/** kcycle popup/txt 페이지에서 실제 회차/일차를 검증 */
export async function verifyRoundDay(year: number, round: number, day: number): Promise<boolean> {
  const url = `https://www.kcycle.or.kr/race/card/decision/popup/txt/${year}/${round}/${day}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const html = await res.text();
    // 패턴: "10회 1일차 확정본"
    const match = html.match(/(\d+)\s*회\s+(\d+)\s*일차\s*확정/);
    if (!match) return false;
    const actualRound = parseInt(match[1], 10);
    const actualDay = parseInt(match[2], 10);
    return actualRound === round && actualDay === day;
  } catch {
    return false;
  }
}

/** 파싱된 페이지를 Supabase에 시딩 */
export async function seedPageToSupabase(
  supabase: SupabaseClient,
  page: PageDecisionCard
): Promise<{ racesCount: number; entriesCount: number }> {
  // 1. decision_card_pages upsert (광명)
  const { error: pageErr } = await supabase
    .from("decision_card_pages")
    .upsert(
      { year: page.year, round: page.round, day: page.day, date: page.date, venue: "광명" },
      { onConflict: "year,round,day,venue" }
    );
  if (pageErr) throw new Error(`Page upsert failed: ${pageErr.message}`);

  // 2. page ID 조회
  const { data: pageRow, error: fetchPageErr } = await supabase
    .from("decision_card_pages")
    .select("id")
    .eq("year", page.year)
    .eq("round", page.round)
    .eq("day", page.day)
    .eq("venue", "광명")
    .single();

  if (fetchPageErr || !pageRow) throw new Error(`Page ID fetch failed: ${fetchPageErr?.message}`);
  const pageId = pageRow.id;

  // 3. decision_card_races upsert
  const raceRows = page.races.map((r) => ({
    page_id: pageId,
    race_no: r.raceNo,
    start_time: r.startTime || null,
    laps: r.laps || null,
    race_type: r.raceType || null,
  }));

  if (raceRows.length > 0) {
    const { error: raceErr } = await supabase
      .from("decision_card_races")
      .upsert(raceRows, { onConflict: "page_id,race_no" });
    if (raceErr) throw new Error(`Race upsert failed: ${raceErr.message}`);
  }

  // 4. race ID 조회
  const { data: raceData, error: fetchRaceErr } = await supabase
    .from("decision_card_races")
    .select("id, race_no")
    .eq("page_id", pageId);

  if (fetchRaceErr || !raceData) throw new Error(`Race ID fetch failed: ${fetchRaceErr?.message}`);

  const raceIdMap = new Map<number, number>();
  for (const r of raceData) {
    raceIdMap.set(r.race_no, r.id);
  }

  // 5. decision_card_entries upsert
  let totalEntries = 0;
  for (const race of page.races) {
    const dcRaceId = raceIdMap.get(race.raceNo);
    if (!dcRaceId) continue;

    const entryRows = race.entries.map((e) => ({
      dc_race_id: dcRaceId,
      back_no: e.backNo,
      racer_id: e.racerId || null,
      generation: e.generation || null,
      age: e.age || null,
      photo_url: e.photoUrl || null,
      win_rate_venue: e.winRateVenue ?? null,
      top2_rate_venue: e.top2RateVenue ?? null,
      top3_rate_venue: e.top3RateVenue ?? null,
      win_rate_total: e.winRateTotal ?? null,
      top2_rate_total: e.top2RateTotal ?? null,
      top3_rate_total: e.top3RateTotal ?? null,
      place_1st: e.place1st ?? null,
      place_2nd: e.place2nd ?? null,
      place_3rd: e.place3rd ?? null,
      tactic_preempt_total: e.tacticPreemptTotal || null,
      tactic_push_total: e.tacticPushTotal || null,
      tactic_chase_total: e.tacticChaseTotal || null,
      tactic_mark_total: e.tacticMarkTotal || null,
      tactic_preempt_round: e.tacticPreemptRound || null,
      tactic_push_round: e.tacticPushRound || null,
      tactic_chase_round: e.tacticChaseRound || null,
      tactic_mark_round: e.tacticMarkRound || null,
      grade_adjust: e.gradeAdjust || null,
      recent3_score_venue: e.recent3ScoreVenue || null,
      recent3_score_total: e.recent3ScoreTotal || null,
      performance_rank: e.performanceRank || null,
      is_absent: e.isAbsent ?? false,
    }));

    if (entryRows.length > 0) {
      const { error: entryErr } = await supabase
        .from("decision_card_entries")
        .upsert(entryRows, { onConflict: "dc_race_id,back_no" });
      if (entryErr) throw new Error(`Entry upsert failed (race ${race.raceNo}): ${entryErr.message}`);
      totalEntries += entryRows.length;
    }
  }

  return { racesCount: raceRows.length, entriesCount: totalEntries };
}

/** 메인: 타겟 결정 → HTML 수집 → 파싱 → Supabase 시딩 */
export async function fetchAndSeedLatest(
  supabase: SupabaseClient,
  options?: { round?: number; day?: number; year?: number }
): Promise<FetchResult> {
  let target: TargetInfo;

  if (options?.round && options?.day) {
    // CLI에서 --round --day 지정한 경우
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const year = options.year || kstNow.getFullYear();

    // race_schedule에서 날짜 조회
    const { data: schedRow } = await supabase
      .from("race_schedule")
      .select("date")
      .eq("year", year)
      .eq("round", options.round)
      .eq("day", options.day)
      .single();

    const date = schedRow?.date || kstNow.toISOString().slice(0, 10);
    target = { year, round: options.round, day: options.day, date };
  } else {
    // 자동 타겟 결정
    const auto = await determineNextTarget(supabase);
    if (!auto) {
      return { success: false, message: "수집할 출주표가 없습니다 (14일 이내 미수집 경주 없음)" };
    }
    target = auto;
  }

  console.log(`타겟: ${target.year}년 ${target.round}회차 ${target.day}일차 (${target.date})`);

  // 회차/일차 검증: popup/txt 페이지에서 실제 게시된 회차 확인
  // kcycle은 미게시 회차 요청 시 가장 최근 데이터를 반환하므로 반드시 검증 필요
  const verified = await verifyRoundDay(target.year, target.round, target.day);
  if (!verified) {
    console.log(`회차 불일치 - 스킵: ${target.round}회 ${target.day}일차 출주표가 아직 게시되지 않음`);
    return {
      success: false,
      year: target.year,
      round: target.round,
      day: target.day,
      date: target.date,
      message: `${target.round}회 ${target.day}일차 출주표가 아직 게시되지 않음 (kcycle 미게시)`,
    };
  }

  // HTML 수집 (SPA URL — 선수 데이터 포함)
  const html = await fetchDecisionCardHtml(target.year, target.round, target.day);

  // 파싱
  const page = parsePage(html, target.year, target.round, target.day, target.date);

  if (page.races.length === 0) {
    return {
      success: false,
      year: target.year,
      round: target.round,
      day: target.day,
      date: target.date,
      message: "광명 경주가 없거나 아직 출주표가 게시되지 않았습니다",
    };
  }

  // Supabase 시딩
  const { racesCount, entriesCount } = await seedPageToSupabase(supabase, page);

  console.log(`완료: ${racesCount}경주, ${entriesCount}명 시딩`);

  return {
    success: true,
    year: target.year,
    round: target.round,
    day: target.day,
    date: target.date,
    racesCount,
    entriesCount,
  };
}
