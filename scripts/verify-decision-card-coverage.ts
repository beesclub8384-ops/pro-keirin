// ============================================================
// 출주표 수집 누락 검증 스크립트
// DB(decision_card_*)에 저장된 광명 출주표의 하루 경주 수를,
// kcycle 실제 페이지의 경주 수와 대조해 "수집 누락 vs 코로나 축소"를 판정한다.
//
// 사용법:
//   npx tsx scripts/verify-decision-card-coverage.ts                       # 2021 광명
//   npx tsx scripts/verify-decision-card-coverage.ts --year 2020
//   npx tsx scripts/verify-decision-card-coverage.ts --year 2021 --out verify-output-2021.csv
//
// 동작:
//   1. decision_card_pages 에서 대상연도 광명 페이지를 date 순 조회
//   2. 각 날짜의 DB 경주 수(decision_card_races) / 선수 수(decision_card_entries) 집계
//   3. 같은 회차/일차로 kcycle popup/txt 페이지 요청 (1초 간격)
//   4. HTML 을 경주 헤더로 분할 → "선수 명단(배번/선수명) 행이 실제로 있는" 광명 경주만 카운트
//      (⚠️ 단순 'N경주' 텍스트 존재로 판단하지 않는다)
//   5. DB 경주 수 ≠ kcycle 경주 수인 날짜를 전부 출력하고 CSV 저장
//
// 판정:
//   불일치 0일  → 코로나 축소 운영 확정, 데이터 정상
//   불일치 존재 → 수집 누락 (CSV 의 누락 날짜 목록 확인)
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(또는 ANON_KEY)가 필요합니다.");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DELAY_MS = 1000; // kcycle 부하 방지 (요청 간격 1초)
const MAX_RETRIES = 3;
const MIN_ENTRIES = 2; // 이 수 이상 선수(배번+한글이름) 행이 있어야 "실제 경주"로 카운트

// ---------- 유틸 ----------
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function strip(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}
function parseArg(name: string, def: string): string {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return def;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith("--")) {
    console.error(`ERROR: ${name} 값이 필요합니다`);
    process.exit(1);
  }
  return val;
}

const YEAR = parseInt(parseArg("--year", "2021"), 10);
const VENUE = parseArg("--venue", "광명");
const OUT = parseArg("--out", `verify-output-${YEAR}.csv`);

// ---------- kcycle fetch (재시도) ----------
async function fetchRetry(url: string): Promise<string> {
  let lastErr: unknown;
  for (let t = 0; t < MAX_RETRIES; t++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await delay(1000 * (t + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------- kcycle 파싱 ----------
// popup/txt 페이지의 <h2> 에서 회차/일차 검증 (kcycle 은 없는 회차 요청 시 최신을 반환)
function validateRoundDay(html: string, round: number, day: number): boolean {
  const m = html.match(/(\d+)회\s*(\d+)일차/);
  if (!m) return false;
  return parseInt(m[1], 10) === round && parseInt(m[2], 10) === day;
}

// 경주 섹션 내 "배번(1-9) + 한글 선수명" 행 수를 센다
function countEntryRows(section: string): number {
  const trs = [...section.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  let c = 0;
  for (const tr of trs) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => strip(x[1]));
    if (tds.length < 2) continue;
    if (/^[1-9]$/.test(tds[0]) && /[가-힣]{2,}/.test(tds[1])) c++;
  }
  return c;
}

// 해당 venue 의 "실제 선수 명단이 있는" 경주 수를 센다
function countVenueRaces(html: string, venue: string): number {
  const headerRe = /(광명|창원|부산)\s*제\s*【\s*(\d+)\s*】\s*경주/g;
  const heads = [...html.matchAll(headerRe)].map((m) => ({
    venue: m[1],
    no: parseInt(m[2], 10),
    idx: m.index ?? 0,
  }));
  let count = 0;
  for (let i = 0; i < heads.length; i++) {
    if (heads[i].venue !== venue) continue;
    const start = heads[i].idx;
    const end = i + 1 < heads.length ? heads[i + 1].idx : html.length;
    if (countEntryRows(html.slice(start, end)) >= MIN_ENTRIES) count++;
  }
  return count;
}

// ---------- DB 조회 ----------
interface PageRow {
  id: number;
  round: number;
  day: number;
  date: string;
}

async function fetchTargetPages(): Promise<PageRow[]> {
  const all: PageRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("decision_card_pages")
      .select("id, round, day, date")
      .eq("year", YEAR)
      .eq("venue", VENUE)
      .order("date")
      .range(from, from + 999);
    if (error) throw new Error(`pages 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as PageRow[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

// page_id -> [race_id...] (페이지네이션 + .in 청크)
async function fetchRacesByPage(pageIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  const CH = 100;
  for (let i = 0; i < pageIds.length; i += CH) {
    const chunk = pageIds.slice(i, i + CH);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("decision_card_races")
        .select("id, page_id")
        .in("page_id", chunk)
        .range(from, from + 999);
      if (error) throw new Error(`races 조회 실패: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const r of data as { id: number; page_id: number }[]) {
        if (!map.has(r.page_id)) map.set(r.page_id, []);
        map.get(r.page_id)!.push(r.id);
      }
      if (data.length < 1000) break;
      from += 1000;
    }
  }
  return map;
}

// race_id -> 선수 수 (페이지네이션 + .in 청크)
async function fetchEntryCounts(raceIds: number[]): Promise<Map<number, number>> {
  const cnt = new Map<number, number>();
  const CH = 200;
  for (let i = 0; i < raceIds.length; i += CH) {
    const chunk = raceIds.slice(i, i + CH);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("decision_card_entries")
        .select("dc_race_id")
        .in("dc_race_id", chunk)
        .range(from, from + 999);
      if (error) throw new Error(`entries 조회 실패: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const r of data as { dc_race_id: number }[]) {
        cnt.set(r.dc_race_id, (cnt.get(r.dc_race_id) ?? 0) + 1);
      }
      if (data.length < 1000) break;
      from += 1000;
    }
  }
  return cnt;
}

// ---------- 메인 ----------
interface ResultRow {
  date: string;
  round: number;
  day: number;
  dbRaces: number;
  kcycleRaces: number | null; // null = 검증/요청 실패
  dbEntries: number;
  verdict: string;
}

async function main() {
  console.log(`=== ${YEAR} ${VENUE} 출주표 수집 검증 시작 ===`);

  const pages = await fetchTargetPages();
  if (pages.length === 0) {
    console.log("대상 페이지 없음");
    return;
  }
  console.log(`대상: ${pages.length}일`);

  // DB 집계 (배치)
  const pageIds = pages.map((p) => p.id);
  const racesByPage = await fetchRacesByPage(pageIds);
  const allRaceIds = [...racesByPage.values()].flat();
  const entryCounts = await fetchEntryCounts(allRaceIds);

  const results: ResultRow[] = [];

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const raceIds = racesByPage.get(p.id) ?? [];
    const dbRaces = raceIds.length;
    const dbEntries = raceIds.reduce((s, rid) => s + (entryCounts.get(rid) ?? 0), 0);

    let kcycleRaces: number | null = null;
    let verdict: string;
    try {
      const url = `https://www.kcycle.or.kr/race/card/decision/popup/txt/${YEAR}/${p.round}/${p.day}`;
      const html = await fetchRetry(url);
      if (!validateRoundDay(html, p.round, p.day)) {
        verdict = "검증실패(회차불일치)";
      } else {
        kcycleRaces = countVenueRaces(html, VENUE);
        verdict = dbRaces === kcycleRaces ? "일치" : "불일치";
      }
    } catch (e) {
      verdict = `요청실패(${e instanceof Error ? e.message : String(e)})`;
    }

    results.push({
      date: p.date,
      round: p.round,
      day: p.day,
      dbRaces,
      kcycleRaces,
      dbEntries,
      verdict,
    });

    if (verdict.startsWith("불일치") || verdict.startsWith("검증실패") || verdict.startsWith("요청실패")) {
      console.log(
        `  ⚠️ ${p.date} (${p.round}회 ${p.day}일차): DB ${dbRaces}경주 / kcycle ${kcycleRaces ?? "?"}경주 → ${verdict}`,
      );
    }

    if ((i + 1) % 20 === 0 || i === pages.length - 1) {
      console.log(`  진행 ${i + 1}/${pages.length}일`);
    }
    await delay(DELAY_MS);
  }

  // CSV 저장
  const header = "date,round,day,db_races,kcycle_races,db_entries,판정";
  const lines = results.map((r) =>
    [r.date, r.round, r.day, r.dbRaces, r.kcycleRaces ?? "", r.dbEntries, r.verdict].join(","),
  );
  const outPath = path.resolve(process.cwd(), OUT);
  fs.writeFileSync(outPath, [header, ...lines].join("\n") + "\n", "utf-8");

  // 요약
  const matched = results.filter((r) => r.verdict === "일치");
  const mismatched = results.filter((r) => r.verdict === "불일치");
  const failed = results.filter(
    (r) => r.verdict.startsWith("검증실패") || r.verdict.startsWith("요청실패"),
  );
  const valid = results.filter((r) => r.kcycleRaces !== null);
  const avg = (arr: number[]) =>
    arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : "0";

  console.log(`\n[${YEAR} ${VENUE} 검증 결과]`);
  console.log(`총 검사일: ${results.length}일`);
  console.log(`일치: ${matched.length}일`);
  console.log(`불일치: ${mismatched.length}일  ← 이게 0이 아니면 수집 누락`);
  if (failed.length) console.log(`검증/요청 실패: ${failed.length}일`);
  console.log(`평균 DB 경주 수: ${avg(valid.map((r) => r.dbRaces))}`);
  console.log(`평균 kcycle 경주 수: ${avg(valid.map((r) => r.kcycleRaces as number))}`);
  console.log(`평균 DB 선수 수: ${avg(results.map((r) => r.dbEntries))}`);
  console.log(`\nCSV 저장: ${outPath}`);

  if (mismatched.length === 0 && failed.length === 0) {
    console.log(`\n✅ 판정: 불일치 0일 → 코로나 축소 운영 확정, 데이터 정상`);
  } else if (mismatched.length > 0) {
    console.log(`\n🚨 판정: 불일치 ${mismatched.length}일 → 수집 누락. CSV 의 '불일치' 행 확인`);
  } else {
    console.log(`\n⚠️ 판정: 불일치는 없으나 검증/요청 실패 ${failed.length}일 → 재실행 필요`);
  }
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
