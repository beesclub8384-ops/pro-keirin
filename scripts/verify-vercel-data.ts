/**
 * Vercel 배포 데이터 정합성 검증 스크립트
 *
 * 실행: npx tsx scripts/verify-vercel-data.ts
 *
 * 검증 항목:
 *   1. DB 데이터 완전성 (테이블별 건수, 연도별, FK 매칭)
 *   2. 원본 JSON ↔ DB 건수 비교
 *   3. API 엔드포인트 동작 확인
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// ── Config ──────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const DATA_DIR = path.join(process.cwd(), "src", "data");
const YEARS = Array.from({ length: 23 }, (_, i) => 2003 + i); // 2003–2025
const PAGE_SIZE = 1000;

// API base: 로컬 dev server 또는 Vercel URL
const API_BASE = process.env.VERIFY_API_BASE || "http://localhost:3000";

// ── Helpers ─────────────────────────────────────────────────

async function fetchAllRows<T = Record<string, unknown>>(
  query: {
    range: (from: number, to: number) => PromiseLike<{
      data: T[] | null;
      error: { message: string } | null;
    }>;
  },
): Promise<T[]> {
  let all: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function countRows(table: string, filters?: Record<string, unknown>): Promise<number> {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filters) {
    for (const [col, val] of Object.entries(filters)) {
      q = q.eq(col, val);
    }
  }
  const { count, error } = await q;
  if (error) throw new Error(`countRows(${table}): ${error.message}`);
  return count ?? 0;
}

function loadJSON<T>(relPath: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, relPath), "utf-8")) as T;
}

// ── Report accumulator ──────────────────────────────────────

interface CheckResult {
  section: string;
  name: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];
let currentSection = "";

function section(name: string) {
  currentSection = name;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${name}`);
  console.log("═".repeat(60));
}

function check(name: string, pass: boolean, detail: string) {
  results.push({ section: currentSection, name, pass, detail });
  const icon = pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  [${icon}] ${name}`);
  if (!pass) console.log(`         ${detail}`);
}

// ── 1. DB 데이터 완전성 ─────────────────────────────────────

async function verifyDBCompleteness() {
  section("1. DB 데이터 완전성 검증");

  // 1-1. 테이블별 총 건수
  const tables: Array<{ name: string; minExpected: number }> = [
    { name: "races", minExpected: 45000 },
    { name: "race_results", minExpected: 300000 },
    { name: "race_odds", minExpected: 45000 },
    { name: "decision_card_pages", minExpected: 3000 },
    { name: "decision_card_races", minExpected: 40000 },
    { name: "decision_card_entries", minExpected: 300000 },
    { name: "entries", minExpected: 300000 },
    { name: "racer_profiles", minExpected: 13000 },
    { name: "rankings", minExpected: 13000 },
    { name: "racer_ids", minExpected: 13000 },
    { name: "statistics_data", minExpected: 50 },
  ];

  console.log("\n  ── 테이블별 총 건수 ──");
  for (const t of tables) {
    const cnt = await countRows(t.name);
    check(
      `${t.name}: ${cnt.toLocaleString()}건`,
      cnt >= t.minExpected,
      `최소 ${t.minExpected.toLocaleString()}건 기대, 실제 ${cnt.toLocaleString()}건`,
    );
  }

  // 1-2. 연도별 건수 확인 (races)
  console.log("\n  ── 연도별 races 건수 ──");
  const missingYears: number[] = [];
  for (const y of YEARS) {
    const cnt = await countRows("races", { year: y });
    if (cnt === 0) missingYears.push(y);
  }
  check(
    `races 연도 범위 (${YEARS[0]}~${YEARS[YEARS.length - 1]})`,
    missingYears.length === 0,
    missingYears.length > 0 ? `누락 연도: ${missingYears.join(", ")}` : "전체 OK",
  );

  // 1-3. races ↔ race_results 매칭
  console.log("\n  ── races ↔ race_results 매칭 ──");
  let totalMissing = 0;
  const missingResultYears: string[] = [];

  for (const y of YEARS) {
    // 해당 연도 race 수
    const raceCnt = await countRows("races", { year: y });
    // 해당 연도 race_id 범위
    const { data: minR } = await supabase
      .from("races").select("id").eq("year", y)
      .order("id", { ascending: true }).limit(1);
    const { data: maxR } = await supabase
      .from("races").select("id").eq("year", y)
      .order("id", { ascending: false }).limit(1);

    if (!minR?.length || !maxR?.length) continue;

    // race_results에서 distinct race_id 수
    const resultRaceIds = await fetchAllRows<{ race_id: number }>(
      supabase
        .from("race_results")
        .select("race_id")
        .gte("race_id", minR[0].id)
        .lte("race_id", maxR[0].id),
    );
    const uniqueIds = new Set(resultRaceIds.map((r) => r.race_id));
    const missing = raceCnt - uniqueIds.size;

    if (missing > 0) {
      missingResultYears.push(`${y}: ${missing}건 누락`);
      totalMissing += missing;
    }
  }

  check(
    `모든 race에 results 존재 (누락: ${totalMissing}건)`,
    totalMissing === 0,
    missingResultYears.length > 0
      ? missingResultYears.join(" / ")
      : "전체 OK",
  );

  // 1-4. races ↔ race_odds 매칭
  console.log("\n  ── races ↔ race_odds 매칭 ──");
  const totalRaces = await countRows("races");
  const linkedOdds = await countRows("race_odds");
  const unlinkedOdds = (
    await supabase.from("race_odds").select("*", { count: "exact", head: true }).is("race_id", null)
  ).count ?? 0;
  const linkedOddsCount = linkedOdds - unlinkedOdds;

  check(
    `race_odds 전체: ${linkedOdds.toLocaleString()}건, 연결됨: ${linkedOddsCount.toLocaleString()}건`,
    unlinkedOdds === 0,
    `race_id NULL: ${unlinkedOdds}건`,
  );

  // race_odds 수 vs race 수 비교 (odds가 race보다 많을 수 있음 — race-data.json 기준)
  check(
    `race_odds(${linkedOdds}) vs races(${totalRaces})`,
    linkedOdds >= totalRaces * 0.99,
    `race_odds가 races보다 현저히 적음: ${linkedOdds} vs ${totalRaces}`,
  );

  // 1-5. entries 연도별 건수
  console.log("\n  ── entries 연도별 건수 ──");
  const missingEntryYears: number[] = [];
  for (const y of YEARS) {
    const dateFrom = `${y}-01-01`;
    const dateTo = `${y}-12-31`;
    const { count, error } = await supabase
      .from("entries")
      .select("*", { count: "exact", head: true })
      .gte("date", dateFrom)
      .lte("date", dateTo);
    if (error) {
      check(`entries ${y}`, false, error.message);
      continue;
    }
    if ((count ?? 0) === 0) missingEntryYears.push(y);
  }
  check(
    `entries 연도 범위 (${YEARS[0]}~${YEARS[YEARS.length - 1]})`,
    missingEntryYears.length === 0,
    missingEntryYears.length > 0 ? `누락 연도: ${missingEntryYears.join(", ")}` : "전체 OK",
  );
}

// ── 2. 원본 JSON ↔ DB 건수 비교 ───────────────────────────

async function verifyJSONvsDB() {
  section("2. 원본 JSON ↔ DB 건수 비교");

  // 2-1. race-data.json vs race_odds
  const raceDataJSON = loadJSON<unknown[]>("race-data.json");
  const raceOddsDB = await countRows("race_odds");
  check(
    `race-data.json(${raceDataJSON.length}) vs race_odds(${raceOddsDB})`,
    Math.abs(raceDataJSON.length - raceOddsDB) <= 50,
    `차이: ${Math.abs(raceDataJSON.length - raceOddsDB)}건`,
  );

  // 2-2. yearly-race-detail → races 건수
  let jsonRaces = 0;
  let jsonResults = 0;
  for (const y of YEARS) {
    const fp = path.join("yearly-race-detail", `${y}.json`);
    if (!fs.existsSync(path.join(DATA_DIR, fp))) continue;
    const d = loadJSON<{ races: Array<{ results: unknown[] }> }>(fp);
    jsonRaces += d.races.length;
    for (const r of d.races) jsonResults += (r.results?.length ?? 0);
  }
  const dbRaces = await countRows("races");
  const dbResults = await countRows("race_results");

  check(
    `races: JSON(${jsonRaces.toLocaleString()}) vs DB(${dbRaces.toLocaleString()})`,
    jsonRaces === dbRaces,
    `차이: ${Math.abs(jsonRaces - dbRaces)}건`,
  );
  check(
    `race_results: JSON(${jsonResults.toLocaleString()}) vs DB(${dbResults.toLocaleString()})`,
    jsonResults === dbResults,
    `차이: ${Math.abs(jsonResults - dbResults)}건`,
  );

  // 2-3. yearly-entry → entries 건수
  let jsonEntries = 0;
  for (const y of YEARS) {
    const fp = path.join("yearly-entry", `${y}.json`);
    if (!fs.existsSync(path.join(DATA_DIR, fp))) continue;
    const d = loadJSON<unknown[]>(fp);
    jsonEntries += d.length;
  }
  const dbEntries = await countRows("entries");
  check(
    `entries: JSON(${jsonEntries.toLocaleString()}) vs DB(${dbEntries.toLocaleString()})`,
    jsonEntries === dbEntries,
    `차이: ${Math.abs(jsonEntries - dbEntries)}건`,
  );

  // 2-4. ranking-data.json → rankings 건수
  const rankJSON = loadJSON<Array<{ rankings: unknown[] }>>("ranking-data.json");
  const jsonRankings = rankJSON.reduce((s, y) => s + y.rankings.length, 0);
  const dbRankings = await countRows("rankings");
  check(
    `rankings: JSON(${jsonRankings.toLocaleString()}) vs DB(${dbRankings.toLocaleString()})`,
    jsonRankings === dbRankings,
    `차이: ${Math.abs(jsonRankings - dbRankings)}건`,
  );

  // 2-5. racer-profile-data.json → racer_profiles 건수
  const profileJSON = loadJSON<unknown[]>("racer-profile-data.json");
  const dbProfiles = await countRows("racer_profiles");
  check(
    `racer_profiles: JSON(${profileJSON.length.toLocaleString()}) vs DB(${dbProfiles.toLocaleString()})`,
    profileJSON.length === dbProfiles,
    `차이: ${Math.abs(profileJSON.length - dbProfiles)}건`,
  );

  // 2-6. yearly-decision-card → decision_card_* 건수
  let jsonDCPages = 0;
  let jsonDCRaces = 0;
  let jsonDCEntries = 0;
  for (const y of YEARS) {
    const fp = path.join("yearly-decision-card", `${y}.json`);
    if (!fs.existsSync(path.join(DATA_DIR, fp))) continue;
    const d = loadJSON<{ pages: Array<{ races: Array<{ entries: unknown[] }> }> }>(fp);
    jsonDCPages += d.pages.length;
    for (const p of d.pages) {
      jsonDCRaces += p.races.length;
      for (const r of p.races) jsonDCEntries += (r.entries?.length ?? 0);
    }
  }
  const dbDCPages = await countRows("decision_card_pages");
  const dbDCRaces = await countRows("decision_card_races");
  const dbDCEntries = await countRows("decision_card_entries");

  check(
    `DC pages: JSON(${jsonDCPages}) vs DB(${dbDCPages})`,
    jsonDCPages === dbDCPages,
    `차이: ${Math.abs(jsonDCPages - dbDCPages)}건`,
  );
  check(
    `DC races: JSON(${jsonDCRaces.toLocaleString()}) vs DB(${dbDCRaces.toLocaleString()})`,
    jsonDCRaces === dbDCRaces,
    `차이: ${Math.abs(jsonDCRaces - dbDCRaces)}건`,
  );
  check(
    `DC entries: JSON(${jsonDCEntries.toLocaleString()}) vs DB(${dbDCEntries.toLocaleString()})`,
    jsonDCEntries === dbDCEntries,
    `차이: ${Math.abs(jsonDCEntries - dbDCEntries)}건`,
  );
}

// ── 3. API 엔드포인트 테스트 ────────────────────────────────

async function fetchAPI(endpoint: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: (e as Error).message } };
  }
}

async function verifyAPIs() {
  section("3. API 엔드포인트 테스트");

  // Check if API is reachable
  const ping = await fetchAPI("/api/data/race-results");
  if (!ping.ok && ping.status === 0) {
    check(
      `API 서버 접근 (${API_BASE})`,
      false,
      `서버에 연결할 수 없습니다. dev server가 실행 중인지 확인하세요. (VERIFY_API_BASE 환경변수로 URL 지정 가능)`,
    );
    return;
  }
  check(`API 서버 접근 (${API_BASE})`, true, "연결 OK");

  // 3-1. /api/data/race-results
  console.log("\n  ── race-results API ──");
  {
    const { ok, data } = await fetchAPI("/api/data/race-results");
    const d = data as { years?: number[] };
    check(
      "race-results: 연도 목록 조회",
      ok && Array.isArray(d.years) && d.years.length >= 20,
      `years=${d.years?.length ?? 0}개`,
    );

    // 연도별 테스트 (5개 샘플)
    const sampleYears = [2003, 2010, 2020, 2024, 2025];
    for (const y of sampleYears) {
      const { ok: ok2, data: d2 } = await fetchAPI(`/api/data/race-results?year=${y}`);
      const dd = d2 as { rounds?: unknown[]; totalRaces?: number };
      check(
        `race-results ${y}: rounds=${dd.rounds?.length ?? 0}, totalRaces=${dd.totalRaces ?? 0}`,
        ok2 && (dd.rounds?.length ?? 0) > 0 && (dd.totalRaces ?? 0) > 0,
        `데이터 없음`,
      );
    }

    // round+day 호출 — 실제 results 배열 확인
    const { data: d2025 } = await fetchAPI("/api/data/race-results?year=2025");
    const rd = d2025 as { rounds?: Array<{ round: number; days: number[] }> };
    if (rd.rounds?.length) {
      const lastRound = rd.rounds[rd.rounds.length - 1];
      const { ok: ok3, data: d3 } = await fetchAPI(
        `/api/data/race-results?year=2025&round=${lastRound.round}&day=${lastRound.days[0]}`,
      );
      const dd3 = d3 as { races?: Array<{ results?: unknown[]; odds?: unknown }> };
      const firstRace = dd3.races?.[0];
      check(
        `race-results 2025 R${lastRound.round}D${lastRound.days[0]}: results 포함 확인`,
        ok3 && (firstRace?.results?.length ?? 0) > 0,
        `results=${firstRace?.results?.length ?? 0}건`,
      );
      check(
        `race-results 2025 R${lastRound.round}D${lastRound.days[0]}: odds 포함 확인`,
        ok3 && firstRace?.odds != null,
        `odds=${firstRace?.odds ? "있음" : "없음"}`,
      );
    }
  }

  // 3-2. /api/data/decision-card
  console.log("\n  ── decision-card API ──");
  {
    const { ok, data } = await fetchAPI("/api/data/decision-card");
    const d = data as { years?: number[] };
    check(
      "decision-card: 연도 목록 조회",
      ok && Array.isArray(d.years) && d.years.length >= 20,
      `years=${d.years?.length ?? 0}개`,
    );

    const sampleYears = [2003, 2015, 2025];
    for (const y of sampleYears) {
      const { ok: ok2, data: d2 } = await fetchAPI(`/api/data/decision-card?year=${y}`);
      const dd = d2 as { rounds?: unknown[]; totalPages?: number };
      check(
        `decision-card ${y}: rounds=${dd.rounds?.length ?? 0}, totalPages=${dd.totalPages ?? 0}`,
        ok2 && (dd.rounds?.length ?? 0) > 0,
        `데이터 없음`,
      );
    }

    // round+day 호출 — entries 확인
    const { data: dc2025 } = await fetchAPI("/api/data/decision-card?year=2025");
    const dcRd = dc2025 as { rounds?: Array<{ round: number; days: number[] }> };
    if (dcRd.rounds?.length) {
      const first = dcRd.rounds[0];
      const { ok: ok3, data: d3 } = await fetchAPI(
        `/api/data/decision-card?year=2025&round=${first.round}&day=${first.days[0]}`,
      );
      const dd3 = d3 as { pages?: Array<{ races?: Array<{ entries?: unknown[] }> }> };
      const firstEntry = dd3.pages?.[0]?.races?.[0]?.entries;
      check(
        `decision-card 2025 R${first.round}D${first.days[0]}: entries 포함 확인`,
        ok3 && (firstEntry?.length ?? 0) > 0,
        `entries=${firstEntry?.length ?? 0}건`,
      );
    }
  }

  // 3-3. /api/data/racer-search
  console.log("\n  ── racer-search API ──");
  {
    const { ok, data } = await fetchAPI("/api/data/racer-search");
    const d = data as { years?: number[] };
    check(
      "racer-search: 연도 목록 조회",
      ok && Array.isArray(d.years) && d.years.length >= 20,
      `years=${d.years?.length ?? 0}개`,
    );

    const queries = ["김", "이", "박"];
    for (const q of queries) {
      const { ok: ok2, data: d2 } = await fetchAPI(
        `/api/data/racer-search?q=${encodeURIComponent(q)}`,
      );
      const dd = d2 as { results?: unknown[] };
      check(
        `racer-search "${q}": ${dd.results?.length ?? 0}건`,
        ok2 && (dd.results?.length ?? 0) > 0,
        `검색 결과 없음`,
      );
    }
  }

  // 3-4. /api/data/statistics
  console.log("\n  ── statistics API ──");
  {
    const { ok, data } = await fetchAPI("/api/data/statistics");
    const d = data as {
      dividendYears?: number[];
      salesYears?: number[];
      highDividendYears?: number[];
    };
    check(
      "statistics: 메타 조회",
      ok
        && (d.dividendYears?.length ?? 0) > 0
        && (d.salesYears?.length ?? 0) > 0
        && (d.highDividendYears?.length ?? 0) > 0,
      `dividend=${d.dividendYears?.length}, sales=${d.salesYears?.length}, highDividend=${d.highDividendYears?.length}`,
    );

    // 각 타입 테스트
    const statTypes: Array<{ type: string; needYear: boolean }> = [
      { type: "dividend", needYear: true },
      { type: "sales", needYear: true },
      { type: "high-dividend", needYear: true },
      { type: "no-hit", needYear: false },
    ];
    for (const st of statTypes) {
      const url = st.needYear
        ? `/api/data/statistics?type=${st.type}&year=2025`
        : `/api/data/statistics?type=${st.type}`;
      const { ok: ok2, data: d2 } = await fetchAPI(url);
      const dd = d2 as { data?: unknown; error?: string };
      check(
        `statistics type=${st.type}${st.needYear ? " year=2025" : ""}`,
        ok2 && dd.data != null,
        dd.error || "데이터 없음",
      );
    }
  }
}

// ── Final Report ────────────────────────────────────────────

function printReport() {
  console.log(`\n${"═".repeat(60)}`);
  console.log("  최종 결과 리포트");
  console.log("═".repeat(60));

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const total = results.length;

  console.log(`\n  총 ${total}개 검증 | \x1b[32mPASS: ${passed}\x1b[0m | \x1b[31mFAIL: ${failed}\x1b[0m\n`);

  if (failed > 0) {
    console.log("  ── 실패 항목 상세 ──\n");
    const bySection = new Map<string, CheckResult[]>();
    for (const r of results.filter((r) => !r.pass)) {
      const arr = bySection.get(r.section) || [];
      arr.push(r);
      bySection.set(r.section, arr);
    }
    for (const [sec, items] of bySection) {
      console.log(`  [${sec}]`);
      for (const item of items) {
        console.log(`    \x1b[31mFAIL\x1b[0m ${item.name}`);
        console.log(`         ${item.detail}`);
      }
      console.log();
    }
  } else {
    console.log("  \x1b[32m모든 검증 통과!\x1b[0m\n");
  }

  // exit code: 0 if all pass, 1 if any fail
  process.exit(failed > 0 ? 1 : 0);
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║     Pro-Keirin 데이터 정합성 검증 스크립트            ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  API Base: ${API_BASE}`);
  console.log(`  검증 연도: ${YEARS[0]}~${YEARS[YEARS.length - 1]} (${YEARS.length}개)`);

  await verifyDBCompleteness();
  await verifyJSONvsDB();
  await verifyAPIs();
  printReport();
}

main().catch((e) => {
  console.error("\n\x1b[31m스크립트 실행 오류:\x1b[0m", e);
  process.exit(2);
});
