// ============================================================
// 창원/부산 확정출주표 수집 + Supabase 시딩 CLI 스크립트
// 데이터 소스: lepopark.or.kr (창원 자체 사이트, 한 페이지에 광명/창원/부산 모두 표시)
//
// 사용법:
//   npx tsx scripts/fetch-changwon-busan-entrant.ts            → 오늘 (자동 수집용)
//   npx tsx scripts/fetch-changwon-busan-entrant.ts --date 20260515
//   npx tsx scripts/fetch-changwon-busan-entrant.ts --year 2020
//
// 설계 메모:
//   - 회차/일차 목록: GET /api/race/{year}/rcdate (trackcd 002 = 창원)
//     부산 경주일은 창원 경주일과 동일하므로 (창원 트랙 데이터 = 부산 트랙 데이터) 같은 페이지에 함께 노출됨.
//   - 출주표 페이지: GET /race/entrant/{YYYYMMDD}
//     h3 "광명/창원/부산 NN 경주 [등급] 출발 HH:MM" 헤더로 venue 식별
//   - 광명은 기존 kcycle 스크립트가 담당. 본 스크립트는 창원/부산만 적재.
//   - DB unique: decision_card_pages (year,round,day,venue), decision_card_races (page_id,race_no),
//     decision_card_entries (dc_race_id,back_no)
//   - round/day는 lepopark 창원 기준 (페이지 h2에서 파싱). 부산도 같은 인덱스 사용.
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(또는 ANON_KEY)가 필요합니다.");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const TRACK_CD = "002";
const TARGET_VENUES = ["창원", "부산"] as const;
type Venue = (typeof TARGET_VENUES)[number];
const DELAY_MS = 500;

// ---------- 유틸 ----------
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeHtml(s.replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " ");
}

function toIsoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function todayKstYmd(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, "");
}

function parseIntOrNull(s: string): number | null {
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function parseFloatOrNull(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ---------- 타입 ----------
interface RcDateEntry {
  trackcd: string;
  rcyear: string;
  rctimes: string;
  rcdays: string;
  rcdate: string;
  canceled: string | null;
}

interface Entry {
  backNo: number;
  racerId: string;
  generation: number | null;
  age: number | null;
  trainingSite: string | null;
  winRateVenue: number | null;
  top2RateVenue: number | null;
  top3RateVenue: number | null;
  winRateTotal: number | null;
  top2RateTotal: number | null;
  top3RateTotal: number | null;
  tacticPreemptTotal: string | null;
  tacticPushTotal: string | null;
  tacticChaseTotal: string | null;
  tacticMarkTotal: string | null;
  tacticPreemptRound: string | null;
  tacticPushRound: string | null;
  tacticChaseRound: string | null;
  tacticMarkRound: string | null;
  gradeAdjust: string | null;
  recent3ScoreVenue: string | null;
  recent3ScoreTotal: string | null;
  performanceRank: string | null;
}

interface RaceCard {
  venue: Venue;
  raceNo: number;
  startTime: string | null;
  raceType: string | null;
  entries: Entry[];
}

interface PageCard {
  year: number;
  round: number;
  day: number;
  date: string; // YYYY-MM-DD
  races: RaceCard[];
}

// ---------- API: 회차/일차 ----------
async function fetchRcDates(year: number): Promise<RcDateEntry[]> {
  const url = `https://www.lepopark.or.kr/api/race/${year}/rcdate`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`rcdate API HTTP ${res.status} (${year})`);
  const json = (await res.json()) as RcDateEntry[];
  return json.filter((e) => e.trackcd === TRACK_CD);
}

// ---------- HTML 파싱 ----------
// 한 경주의 첫 td에서 (back_no, racer_id, 기수, 나이) 분리
function parseFirstCell(html: string): {
  backNo: number | null;
  racerId: string | null;
  generation: number | null;
  age: number | null;
} {
  const backMatch = html.match(/racer_color_(\d+)/);
  const idMatch = html.match(/\/racer\/(\d+)/);
  // "15기" "45세" 형태에서 숫자 추출
  const genMatch = html.match(/>(\d+)기</) || html.match(/(\d+)\s*기/);
  const ageMatch = html.match(/>(\d+)세</) || html.match(/(\d+)\s*세/);
  return {
    backNo: backMatch ? parseInt(backMatch[1], 10) : null,
    racerId: idMatch ? idMatch[1] : null,
    generation: genMatch ? parseInt(genMatch[1], 10) : null,
    age: ageMatch ? parseInt(ageMatch[1], 10) : null,
  };
}

// td 내부에 "값 (값)" 패턴: 첫 줄=총합/당지, 괄호=회차/구분
// 예: <div>5</div><div>(0)</div>  → total="5", round="0"
// 단순 단일: <div>4</div>  → total="4", round=null
function splitTotalAndRound(cellHtml: string): { total: string | null; round: string | null } {
  const divs = [...cellHtml.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/g)].map((m) =>
    stripTags(m[1])
  );
  const flat = divs.filter((d) => d !== "");
  if (flat.length === 0) {
    const txt = stripTags(cellHtml);
    return { total: txt || null, round: null };
  }
  const first = flat[0];
  // "5 (0)" 같이 한 줄에 같이 있는 경우도 처리
  const inline = first.match(/^([^()\s]+)\s*\(([^)]+)\)$/);
  if (inline) return { total: inline[1], round: inline[2] };
  const second = flat[1];
  let round: string | null = null;
  if (second) {
    const m = second.match(/\(([^)]+)\)/);
    round = m ? m[1] : second || null;
  }
  return { total: first || null, round };
}

// 한 경주 tbody의 한 tr → Entry
function parseEntryRow(tr: string): Entry | null {
  const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  if (tds.length < 17) return null;

  const first = parseFirstCell(tds[0]);
  if (first.backNo === null || !first.racerId) return null;

  // td index (창원/부산 동일 17컬럼):
  // 0: 번호+선수명+(기수/나이)  1: 기어배수  2: 200m  3: 훈련지
  // 4: 승률  5: 연대율  6: 삼연대율  7: 입상/출전일수
  // 8~11: 입상전법 선행/젖히기/추입/마크
  // 12: 등급조정 현재  13: 등급조정 이전
  // 14: 최근3회 평균득점 당지  15: 최근3회 평균득점 종합
  // 16: 최근3회 종합순위
  const wr = splitTotalAndRound(tds[4]);
  const top2 = splitTotalAndRound(tds[5]);
  const top3 = splitTotalAndRound(tds[6]);
  const tPre = splitTotalAndRound(tds[8]);
  const tPush = splitTotalAndRound(tds[9]);
  const tChase = splitTotalAndRound(tds[10]);
  const tMark = splitTotalAndRound(tds[11]);

  return {
    backNo: first.backNo,
    racerId: first.racerId,
    generation: first.generation,
    age: first.age,
    trainingSite: stripTags(tds[3]) || null,
    winRateVenue: wr.total ? parseFloatOrNull(wr.total) : null,
    top2RateVenue: top2.total ? parseFloatOrNull(top2.total) : null,
    top3RateVenue: top3.total ? parseFloatOrNull(top3.total) : null,
    winRateTotal: wr.round ? parseFloatOrNull(wr.round) : null,
    top2RateTotal: top2.round ? parseFloatOrNull(top2.round) : null,
    top3RateTotal: top3.round ? parseFloatOrNull(top3.round) : null,
    tacticPreemptTotal: tPre.total,
    tacticPushTotal: tPush.total,
    tacticChaseTotal: tChase.total,
    tacticMarkTotal: tMark.total,
    tacticPreemptRound: tPre.round,
    tacticPushRound: tPush.round,
    tacticChaseRound: tChase.round,
    tacticMarkRound: tMark.round,
    gradeAdjust: stripTags(tds[12]) || null,
    recent3ScoreVenue: stripTags(tds[14]) || null,
    recent3ScoreTotal: stripTags(tds[15]) || null,
    performanceRank: stripTags(tds[16]) || null,
  };
}

// 한 경주 블록(h3 ~ 다음 h3) 안에서 entries 테이블 파싱
function parseRaceBlock(block: string): Entry[] {
  // 출주표 본표: thead에 "선수명" 또는 "(기수/나이)" 포함
  const tableMatch = block.match(
    /<table[^>]*class="[^"]*blue[^"]*"[^>]*>([\s\S]*?)<\/table>/
  );
  if (!tableMatch) return [];
  const table = tableMatch[1];
  const tbodyMatch = table.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return [];
  const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const entries: Entry[] = [];
  for (const tr of trs) {
    const e = parseEntryRow(tr);
    if (e) entries.push(e);
  }
  return entries;
}

// 페이지 전체에서 venue별 경주 모두 파싱
function parsePage(html: string, entry: RcDateEntry): PageCard | null {
  const year = parseInt(entry.rcyear, 10);
  const round = parseInt(entry.rctimes, 10);
  const day = parseInt(entry.rcdays, 10);
  if (isNaN(year) || isNaN(round) || isNaN(day)) {
    console.warn(`  ⚠️ rcdate 파싱 실패: ${entry.rcdate}`);
    return null;
  }
  const isoDate = toIsoDate(entry.rcdate);

  // h2 검증: 페이지의 "2026년 19회 1일차 (2026년 05월 15일)" 와 rcdate 일치 여부
  const h2 = html.match(
    /<h2>\s*(\d{4})년\s*(\d+)회\s*(\d+)일차\s*<span>\(\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*\)<\/span><\/h2>/
  );
  if (h2) {
    const pageYmd = `${h2[4]}${h2[5].padStart(2, "0")}${h2[6].padStart(2, "0")}`;
    if (pageYmd !== entry.rcdate) {
      console.warn(`  ⚠️ 날짜 불일치: 요청 ${entry.rcdate} / 페이지 ${pageYmd} → 저장 안 함`);
      return null;
    }
  } else {
    console.warn(`  ⚠️ 페이지 h2 파싱 실패 (${entry.rcdate}) → 저장 안 함`);
    return null;
  }

  // h3 경주 헤더로 블록 분리: "광명 07 경주 [우수] 출발 15:15"
  // venue, race_no, 등급, 시간 추출
  const h3Re =
    /<h3>\s*(광명|창원|부산)\s*(\d+)\s*경주\s*(?:\[([^\]]+)\])?\s*(?:출발\s*(\d{1,2}:\d{2}))?/g;
  const heads = [...html.matchAll(h3Re)];
  const races: RaceCard[] = [];
  for (let i = 0; i < heads.length; i++) {
    const venueName = heads[i][1] as Venue | "광명";
    if (!TARGET_VENUES.includes(venueName as Venue)) continue;
    const raceNo = parseInt(heads[i][2], 10);
    const raceType = heads[i][3] || null;
    const startTime = heads[i][4] || null;
    const start = heads[i].index! + heads[i][0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index! : html.length;
    const block = html.substring(start, end);
    const entries = parseRaceBlock(block);
    if (entries.length === 0) continue;
    races.push({
      venue: venueName as Venue,
      raceNo,
      startTime,
      raceType,
      entries,
    });
  }

  return { year, round, day, date: isoDate, races };
}

async function fetchEntrantPage(rcdate: string): Promise<string> {
  const url = `https://www.lepopark.or.kr/race/entrant/${rcdate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`entrant HTTP ${res.status} (${rcdate})`);
  return res.text();
}

// ---------- Supabase 적재 ----------
async function seedToSupabase(page: PageCard): Promise<{ pages: number; races: number; entries: number }> {
  // venue별로 그룹핑
  const byVenue = new Map<Venue, RaceCard[]>();
  for (const r of page.races) {
    if (!byVenue.has(r.venue)) byVenue.set(r.venue, []);
    byVenue.get(r.venue)!.push(r);
  }

  let totalPages = 0;
  let totalRaces = 0;
  let totalEntries = 0;

  for (const [venue, races] of byVenue.entries()) {
    // 1) pages upsert
    const { error: pageErr } = await supabase
      .from("decision_card_pages")
      .upsert(
        { year: page.year, round: page.round, day: page.day, date: page.date, venue },
        { onConflict: "year,round,day,venue" }
      );
    if (pageErr) {
      console.error(`  pages upsert 에러 (${venue}):`, pageErr.message);
      continue;
    }

    // 2) page id 조회
    const { data: pageRow, error: pageFetchErr } = await supabase
      .from("decision_card_pages")
      .select("id")
      .eq("year", page.year)
      .eq("round", page.round)
      .eq("day", page.day)
      .eq("venue", venue)
      .single();
    if (pageFetchErr || !pageRow) {
      console.error(`  page id 조회 실패 (${venue}):`, pageFetchErr?.message);
      continue;
    }
    const pageId = pageRow.id;
    totalPages += 1;

    // 3) races upsert
    const raceRows = races.map((r) => ({
      page_id: pageId,
      race_no: r.raceNo,
      start_time: r.startTime,
      laps: null, // 페이지에 명시 없음
      race_type: r.raceType,
    }));
    const { error: raceErr } = await supabase
      .from("decision_card_races")
      .upsert(raceRows, { onConflict: "page_id,race_no" });
    if (raceErr) {
      console.error(`  races upsert 에러 (${venue}):`, raceErr.message);
      continue;
    }

    // 4) race id 조회
    const { data: raceRowsDb, error: raceFetchErr } = await supabase
      .from("decision_card_races")
      .select("id, race_no")
      .eq("page_id", pageId);
    if (raceFetchErr || !raceRowsDb) {
      console.error(`  race id 조회 실패 (${venue}):`, raceFetchErr?.message);
      continue;
    }
    const raceIdMap = new Map<number, number>();
    for (const r of raceRowsDb) raceIdMap.set(r.race_no, r.id);

    // 5) entries upsert
    let venueEntries = 0;
    for (const race of races) {
      const dcRaceId = raceIdMap.get(race.raceNo);
      if (!dcRaceId) continue;
      const entryRows = race.entries.map((e) => ({
        dc_race_id: dcRaceId,
        back_no: e.backNo,
        racer_id: e.racerId,
        generation: e.generation,
        age: e.age,
        photo_url: e.racerId ? `https://kcycle.or.kr/player/${e.racerId}.jpg` : null,
        win_rate_venue: e.winRateVenue,
        top2_rate_venue: e.top2RateVenue,
        top3_rate_venue: e.top3RateVenue,
        win_rate_total: e.winRateTotal,
        top2_rate_total: e.top2RateTotal,
        top3_rate_total: e.top3RateTotal,
        place_1st: null, // 본 사이트는 합계만 제공 (15/51) → 분리 불가
        place_2nd: null,
        place_3rd: null,
        tactic_preempt_total: e.tacticPreemptTotal,
        tactic_push_total: e.tacticPushTotal,
        tactic_chase_total: e.tacticChaseTotal,
        tactic_mark_total: e.tacticMarkTotal,
        tactic_preempt_round: e.tacticPreemptRound,
        tactic_push_round: e.tacticPushRound,
        tactic_chase_round: e.tacticChaseRound,
        tactic_mark_round: e.tacticMarkRound,
        grade_adjust: e.gradeAdjust,
        recent3_score_venue: e.recent3ScoreVenue,
        recent3_score_total: e.recent3ScoreTotal,
        performance_rank: e.performanceRank,
        is_absent: false,
        training_site: e.trainingSite,
      }));
      if (entryRows.length === 0) continue;
      const { error: entryErr } = await supabase
        .from("decision_card_entries")
        .upsert(entryRows, { onConflict: "dc_race_id,back_no" });
      if (entryErr) {
        console.error(`  entries upsert 에러 (${venue} ${race.raceNo}R):`, entryErr.message);
        continue;
      }
      venueEntries += entryRows.length;
    }
    totalRaces += raceRows.length;
    totalEntries += venueEntries;
    console.log(`  → ${venue}: ${raceRows.length}경주 / ${venueEntries}선수`);
  }

  return { pages: totalPages, races: totalRaces, entries: totalEntries };
}

// ---------- 단일 rcdate 수집 ----------
async function collectOne(entry: RcDateEntry): Promise<number> {
  if (entry.canceled) {
    console.log(`  ${entry.rcdate}: canceled → 스킵`);
    return 0;
  }
  const html = await fetchEntrantPage(entry.rcdate);
  const page = parsePage(html, entry);
  if (!page || page.races.length === 0) {
    console.log(`  ${entry.rcdate}: 창원/부산 확정 출주표 없음`);
    return 0;
  }
  console.log(`${entry.rcdate} (${entry.rctimes}회 ${entry.rcdays}일차): 창원/부산 ${page.races.length}경주`);
  const r = await seedToSupabase(page);
  return r.races;
}

// ---------- 기 수집 날짜 (--year 모드 스킵 판정) ----------
async function existingDates(year: number): Promise<Set<string>> {
  const dates = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("decision_card_pages")
      .select("date, venue")
      .eq("year", year)
      .in("venue", ["창원", "부산"])
      .range(from, from + 999);
    if (error) {
      console.error("  기존 pages 조회 에러:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    // 창원 AND 부산 둘 다 적재된 날짜만 스킵 — 일부만 들어있는 날짜는 재처리
    const byDate = new Map<string, Set<string>>();
    for (const r of data) {
      if (!r.date) continue;
      if (!byDate.has(r.date)) byDate.set(r.date, new Set());
      byDate.get(r.date)!.add(r.venue);
    }
    for (const [d, venues] of byDate.entries()) {
      if (venues.has("창원") && venues.has("부산")) dates.add(d);
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return dates;
}

// ---------- CLI ----------
function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  const val = process.argv[idx + 1];
  if (!val) {
    console.error(`ERROR: ${name} 값이 필요합니다`);
    process.exit(1);
  }
  return val;
}

async function main() {
  const yearArg = parseArg("--year");
  const dateArg = parseArg("--date");

  if (yearArg) {
    const year = parseInt(yearArg, 10);
    if (!/^\d{4}$/.test(yearArg)) {
      console.error("ERROR: --year 형식 오류 (YYYY):", yearArg);
      process.exit(1);
    }
    console.log(`=== 창원/부산 ${year}년 전체 수집 ===`);
    const entries = await fetchRcDates(year);
    if (entries.length === 0) {
      console.log(`  ${year}년 경주일 없음`);
      return;
    }
    entries.sort((a, b) => a.rcdate.localeCompare(b.rcdate));
    const skipDates = await existingDates(year);
    console.log(`  경주일 ${entries.length}개 / DB 기존 (창원+부산 모두 적재) ${skipDates.size}개 스킵\n`);

    let total = 0;
    for (const e of entries) {
      if (skipDates.has(toIsoDate(e.rcdate))) {
        console.log(`  ${e.rcdate}: 기존 → 스킵`);
        continue;
      }
      try {
        total += await collectOne(e);
      } catch (err) {
        console.error(`  ERROR ${e.rcdate}:`, err instanceof Error ? err.message : String(err));
      }
      await delay(DELAY_MS);
    }
    console.log(`\n=== ${year}년 완료: 총 ${total}경주 적재 ===`);
    return;
  }

  const targetYmd = dateArg ?? todayKstYmd();
  if (!/^\d{8}$/.test(targetYmd)) {
    console.error("ERROR: --date 형식 오류 (YYYYMMDD):", targetYmd);
    process.exit(1);
  }
  const year = parseInt(targetYmd.slice(0, 4), 10);
  console.log(dateArg ? `=== 단일 날짜 수집: ${targetYmd} ===` : `=== 오늘 자동 수집: ${targetYmd} ===`);

  const entries = await fetchRcDates(year);
  const found = entries.find((e) => e.rcdate === targetYmd);
  if (!found) {
    console.log(`  ${targetYmd}: 경주일 아님 (rcdate 목록에 없음)`);
    return;
  }
  try {
    const n = await collectOne(found);
    console.log(`\n=== 완료: ${targetYmd} 창원/부산 ${n}경주 ===`);
  } catch (err) {
    console.error("치명적 에러:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
