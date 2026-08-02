// ============================================================
// 출주표 수집 누락 검증 스크립트
// DB(decision_card_*)에 저장된 광명 출주표의 하루 경주 수를,
// kcycle 실제 페이지의 경주 수와 대조해 "수집 누락 vs 코로나 축소"를 판정한다.
//
// 사용법:
//   # [기본] in-day 모드 — 하루 안 경주가 잘렸는지 대조
//   npx tsx scripts/verify-decision-card-coverage.ts --year 2021
//   npx tsx scripts/verify-decision-card-coverage.ts --year 2021 --out verify-output-2021.csv
//   # missing-days 모드 — DB에 통째로 빠진 날이 kcycle엔 있는지 역방향 검증
//   npx tsx scripts/verify-decision-card-coverage.ts --mode missing-days --year 2021
//   npx tsx scripts/verify-decision-card-coverage.ts --mode missing-days --year 2020
//
// [in-day 모드] (기본)
//   1. decision_card_pages 에서 대상연도 광명 페이지를 date 순 조회
//   2. 각 날짜의 DB 경주 수(decision_card_races) / 선수 수(decision_card_entries) 집계
//   3. 같은 회차/일차로 kcycle popup/txt 페이지 요청 (1초 간격)
//   4. HTML 을 경주 헤더로 분할 → "선수 명단(배번/선수명) 행이 실제로 있는" 광명 경주만 카운트
//      (⚠️ 단순 'N경주' 텍스트 존재로 판단하지 않는다)
//   5. DB 경주 수 ≠ kcycle 경주 수인 날짜를 전부 출력하고 CSV 저장
//   판정: 불일치 0일 → 코로나 축소 운영 확정 / 불일치 존재 → 수집 누락
//
// [missing-days 모드] --mode missing-days
//   1. round 1~60 × day 1~4 (240건)을 전수 probe
//   2. ⚠️ kcycle 은 없는 회차 요청 시 404 대신 최신본을 반환 → <h2>에서
//      연도·회차·일차를 파싱해 요청값과 모두 일치할 때만 "실존"으로 판정
//   3. 실존인 경우에만 광명 경주 수(+선수 명단 행)까지 확인
//   4. decision_card_pages 에 같은 year/round/day/venue='광명' 존재 여부 조회
//   5. kcycle엔 있으나 DB엔 없는 날짜를 전부 출력하고 CSV 저장
//   판정: K(누락)=0 → 코로나 휴장 확정 / K>0 → 누락 확정, 해당 회차 재수집
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
const MODE = parseArg("--mode", "in-day"); // "in-day" | "missing-days"
const OUT = parseArg(
  "--out",
  MODE === "missing-days" ? `verify-missing-${YEAR}.csv` : `verify-output-${YEAR}.csv`,
);

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
// popup/txt 페이지의 <h2> "YYYY년 MM월 DD일 ... N회 M일차" 에서 연도·회차·일차 추출
function parseH2(html: string): { year: number; round: number; day: number } | null {
  const m = html.match(/(\d+)년\s*\d+월\s*\d+일[\s\S]*?(\d+)회\s*(\d+)일차/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), round: parseInt(m[2], 10), day: parseInt(m[3], 10) };
}

// kcycle 은 없는 회차 요청 시 404 대신 최신본을 반환한다.
// 연도까지 대조해 (다른 연도의 우연한 회차 일치까지) 폴백을 걸러낸다.
function validateRoundDay(html: string, year: number, round: number, day: number): boolean {
  const h2 = parseH2(html);
  return !!h2 && h2.year === year && h2.round === round && h2.day === day;
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

async function runInDay() {
  console.log(`=== ${YEAR} ${VENUE} 출주표 수집 검증 (in-day) 시작 ===`);

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
      if (!validateRoundDay(html, YEAR, p.round, p.day)) {
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

// ---------- missing-days 모드 (역방향 검증) ----------
interface MissingRow {
  year: number;
  round: number;
  day: number;
  kcycleExists: boolean;
  kcycleRaces: number | null;
  dbExists: boolean;
  verdict: string;
}

const ROUND_MAX = 60;
const DAY_MAX = 4;

async function runMissingDays() {
  console.log(`=== ${YEAR} ${VENUE} 누락일(missing-days) 검증 시작 ===`);

  // DB에 존재하는 (round-day) 집합
  const dbPages = await fetchTargetPages();
  const dbSet = new Set(dbPages.map((p) => `${p.round}-${p.day}`));
  console.log(`DB 광명 페이지: ${dbPages.length}일`);

  const rows: MissingRow[] = [];
  let probe = 0;
  const totalProbe = ROUND_MAX * DAY_MAX;

  for (let round = 1; round <= ROUND_MAX; round++) {
    for (let day = 1; day <= DAY_MAX; day++) {
      probe++;

      let kcycleExists = false;
      let kcycleRaces: number | null = null;
      try {
        const url = `https://www.kcycle.or.kr/race/card/decision/popup/txt/${YEAR}/${round}/${day}`;
        const html = await fetchRetry(url);
        // 연도·회차·일차가 모두 일치할 때만 실존으로 인정 (폴백 차단)
        if (validateRoundDay(html, YEAR, round, day)) {
          const races = countVenueRaces(html, VENUE);
          // 헤더만 있고 명단이 비어있으면 실존 아님 (races=0)
          if (races >= 1) {
            kcycleExists = true;
            kcycleRaces = races;
          }
        }
      } catch {
        // 요청 실패 → 실존 판정 불가(보수적으로 미실존 처리). DB 유무는 아래서 기록.
      }

      const dbExists = dbSet.has(`${round}-${day}`);
      let verdict: string;
      if (kcycleExists) {
        verdict = dbExists ? "정상(양쪽 존재)" : "누락(kcycle有 DB無)";
      } else {
        verdict = dbExists ? "이상(DB有 kcycle無)" : "kcycle없음";
      }

      rows.push({ year: YEAR, round, day, kcycleExists, kcycleRaces, dbExists, verdict });

      if (kcycleExists && !dbExists) {
        console.log(`  🚨 ${YEAR}년 ${round}회 ${day}일차: kcycle ${kcycleRaces}경주 존재 / DB 없음`);
      } else if (!kcycleExists && dbExists) {
        console.log(`  ❓ ${YEAR}년 ${round}회 ${day}일차: DB엔 있으나 kcycle 미실존 (확인 필요)`);
      }

      if (probe % 40 === 0 || probe === totalProbe) {
        console.log(`  진행 ${probe}/${totalProbe}`);
      }
      await delay(DELAY_MS);
    }
  }

  // CSV 저장
  const header = "year,round,day,kcycle_exists,kcycle_races,db_exists,판정";
  const lines = rows.map((r) =>
    [
      r.year,
      r.round,
      r.day,
      r.kcycleExists,
      r.kcycleRaces ?? "",
      r.dbExists,
      r.verdict,
    ].join(","),
  );
  const outPath = path.resolve(process.cwd(), OUT);
  fs.writeFileSync(outPath, [header, ...lines].join("\n") + "\n", "utf-8");

  // 요약
  const exists = rows.filter((r) => r.kcycleExists);
  const existsInDb = exists.filter((r) => r.dbExists);
  const missing = exists.filter((r) => !r.dbExists);
  const anomaly = rows.filter((r) => !r.kcycleExists && r.dbExists);

  console.log(`\n[${YEAR} ${VENUE} 누락일 검증]`);
  console.log(`probe 총 시도: ${rows.length}건 (round 1~${ROUND_MAX} × day 1~${DAY_MAX})`);
  console.log(`kcycle에 실존: ${exists.length}건`);
  console.log(`그중 DB에 있음: ${existsInDb.length}건`);
  console.log(`그중 DB에 없음: ${missing.length}건  ← 이게 0이 아니면 수집 누락 확정`);
  if (anomaly.length) console.log(`(참고) DB엔 있으나 kcycle 미실존: ${anomaly.length}건`);

  console.log(`\n[DB에 없는 날짜 목록]`);
  if (missing.length === 0) {
    console.log(`  없음`);
  } else {
    for (const r of missing) {
      console.log(`${r.year}년 ${r.round}회 ${r.day}일차 (${VENUE} ${r.kcycleRaces}경주)`);
    }
  }

  console.log(`\nCSV 저장: ${outPath}`);
  if (missing.length === 0) {
    console.log(`\n✅ 판정: 누락 0건 → 코로나 휴장 확정. ${YEAR} 데이터 그대로 사용`);
  } else {
    console.log(`\n🚨 판정: 누락 ${missing.length}건 → 수집 누락 확정. 해당 회차 재수집 필요`);
  }
}

// ---------- 디스패처 ----------
async function main() {
  if (MODE === "missing-days") {
    await runMissingDays();
  } else if (MODE === "in-day") {
    await runInDay();
  } else {
    console.error(`ERROR: 알 수 없는 --mode: ${MODE} (in-day | missing-days)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
