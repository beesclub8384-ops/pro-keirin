// ============================================================
// races.grade / grade_raw 경량 백필 스크립트 (창원/부산)
// 기존 race_results 는 건드리지 않고 races 의 grade/grade_raw 만 UPDATE.
//
// 사용법:
//   npx tsx scripts/backfill-race-grades.ts --venue changwon --year 2024 [--dry-run]
//   npx tsx scripts/backfill-race-grades.ts --venue busan --year 2022
//   npx tsx scripts/backfill-race-grades.ts --venue changwon --from 20241201 --to 20241207 --dry-run
//
// 설계:
//   - 대상 경주는 DB(races)에서 직접 조회 (venue + year/기간). 취소경주 등 미적재 건은 자연히 제외.
//   - 결과 페이지 fetch → 경주별 등급 라벨 파싱 (창원 cells[0] / 부산 앵커 a[5])
//   - grade_raw = 원본 라벨, grade = normalizeGrade(라벨) (접두사 규칙)
//   - UPDATE 는 grade_raw 값별로 묶어 .in('id', ...) 배치 (효율 + 멱등)
//   - 500ms 레이트리밋, fetch 3회 재시도
//   - --dry-run 이면 DB 미변경, 예상 결과만 리포트
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { normalizeGrade } from "../src/lib/grade-normalizer";

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
const DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().replace(/\s+/g, " ");
}
function ymdOf(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith("--")) {
    console.error(`ERROR: ${name} 값이 필요합니다`);
    process.exit(1);
  }
  return val;
}
const hasFlag = (name: string): boolean => process.argv.includes(name);

// ---------- fetch (재시도) ----------
async function fetchRetry(url: string, tries = 3): Promise<string> {
  let lastErr: unknown;
  for (let t = 0; t < tries; t++) {
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

// ---------- 등급 파싱 (venue별) ----------
// 창원: /race/result/{ymd} 에서 <h3>창원NN 경주</h3> 블록별 요약 tbody cells[0]
function parseChangwonGrades(html: string): Map<number, string> {
  const out = new Map<number, string>();
  const heads = [...html.matchAll(/<h3>\s*([가-힣]+)(\d+)\s*경주[\s\S]*?<\/h3>/g)];
  for (let i = 0; i < heads.length; i++) {
    if (heads[i][1] !== "창원") continue;
    const start = heads[i].index! + heads[i][0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index! : html.length;
    const block = html.slice(start, end);
    const tb = block.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (!tb) continue;
    const cells = [...tb[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripTags(m[1]));
    if (cells.length >= 1 && cells[0]) out.set(parseInt(heads[i][2], 10), cells[0]);
  }
  return out;
}
// 부산: raceResult.do 앵커 부산NNR (등급) HH:MM 에서 a[5]
function parseBusanGrades(html: string, ymd: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /layer_open\('layerWrap4','(\d+)','(\d{8})','(부산)(\d+)R \(([^)]*)\) ([\d:]+)'\)/g;
  for (const m of html.matchAll(re)) {
    if (m[2] !== ymd) continue;
    const raceNo = parseInt(m[4], 10);
    if (!out.has(raceNo)) out.set(raceNo, m[5].trim());
  }
  return out;
}

interface VenueCfg {
  venue: string;
  url: (ymd: string) => string;
  parse: (html: string, ymd: string) => Map<number, string>;
  tls0?: boolean;
}
const CONFIG: Record<string, VenueCfg> = {
  changwon: {
    venue: "창원",
    url: (ymd) => `https://www.lepopark.or.kr/race/result/${ymd}`,
    parse: (html) => parseChangwonGrades(html),
  },
  busan: {
    venue: "부산",
    url: (ymd) => `https://www.spo1.or.kr/race/raceResult.do?RACEYY=${ymd.slice(0, 4)}&RACEDATE=${ymd}&gubun=Y`,
    parse: (html, ymd) => parseBusanGrades(html, ymd),
    tls0: true,
  },
};

// ---------- 대상 races 조회 (DB, 페이지네이션) ----------
interface RaceRow {
  id: number;
  date: string; // YYYY-MM-DD
  race_no: number;
}
async function fetchTargetRaces(
  venue: string,
  year?: number,
  from?: string,
  to?: string,
): Promise<RaceRow[]> {
  const all: RaceRow[] = [];
  let fromIdx = 0;
  while (true) {
    let q = supabase.from("races").select("id, date, race_no").eq("venue", venue);
    if (year) q = q.eq("year", year);
    if (from) q = q.gte("date", `${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6, 8)}`);
    if (to) q = q.lte("date", `${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6, 8)}`);
    const { data, error } = await q.order("date").range(fromIdx, fromIdx + 999);
    if (error) throw new Error(`races 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as RaceRow[]));
    if (data.length < 1000) break;
    fromIdx += 1000;
  }
  return all;
}

// ---------- 메인 ----------
async function main() {
  const venueArg = parseArg("--venue");
  const yearArg = parseArg("--year");
  const fromArg = parseArg("--from");
  const toArg = parseArg("--to");
  const dryRun = hasFlag("--dry-run");

  if (!venueArg || !CONFIG[venueArg]) {
    console.error("ERROR: --venue changwon|busan 필요");
    process.exit(1);
  }
  const cfg = CONFIG[venueArg];
  if (cfg.tls0) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const year = yearArg ? parseInt(yearArg, 10) : undefined;
  console.log(
    `=== ${cfg.venue} 등급 백필 ${dryRun ? "(DRY-RUN)" : ""} ` +
      `${year ? year + "년" : ""}${fromArg ? ` ${fromArg}~${toArg ?? ""}` : ""} ===`,
  );

  const races = await fetchTargetRaces(cfg.venue, year, fromArg, toArg);
  if (races.length === 0) {
    console.log("  대상 races 없음");
    return;
  }
  // 날짜별 그룹 (race_no -> id)
  const byDate = new Map<string, Map<number, number>>();
  for (const r of races) {
    const ymd = ymdOf(r.date);
    if (!byDate.has(ymd)) byDate.set(ymd, new Map());
    byDate.get(ymd)!.set(r.race_no, r.id);
  }
  const dates = [...byDate.keys()].sort();
  console.log(`  대상: ${races.length}경주 / ${dates.length}일`);

  // id -> {gradeRaw, grade}
  const updates: Array<{ id: number; gradeRaw: string; grade: string | null }> = [];
  const rawFreq: Record<string, number> = {};
  const gradeFreq: Record<string, number> = {};
  const failures: Array<{ ymd: string; error: string }> = [];
  let noGradeParsed = 0; // DB엔 있으나 페이지에서 등급 못 찾은 경주

  let done = 0;
  for (const ymd of dates) {
    const raceMap = byDate.get(ymd)!;
    try {
      const html = await fetchRetry(cfg.url(ymd));
      const grades = cfg.parse(html, ymd);
      for (const [raceNo, id] of raceMap) {
        const raw = grades.get(raceNo);
        if (!raw) {
          noGradeParsed++;
          continue;
        }
        const grade = normalizeGrade(raw);
        updates.push({ id, gradeRaw: raw, grade });
        rawFreq[raw] = (rawFreq[raw] || 0) + 1;
        gradeFreq[grade ?? "(null)"] = (gradeFreq[grade ?? "(null)"] || 0) + 1;
      }
    } catch (e) {
      failures.push({ ymd, error: e instanceof Error ? e.message : String(e) });
    }
    done++;
    if (done % 50 === 0 || done === dates.length) {
      console.log(`  진행 ${done}/${dates.length}일 (업데이트 대상 ${updates.length})`);
    }
    await delay(DELAY_MS);
  }

  // 리포트
  console.log(`\n--- ${cfg.venue} 파싱 결과 ---`);
  console.log(`  업데이트 대상: ${updates.length}경주`);
  console.log(`  페이지에서 등급 못찾음: ${noGradeParsed}경주`);
  console.log(`  실패 페이지: ${failures.length}일`);
  console.log(`  grade_raw 분포:`);
  for (const [k, v] of Object.entries(rawFreq).sort((a, b) => b[1] - a[1])) {
    const norm = normalizeGrade(k);
    console.log(`    ${v}\t${k}${norm ? "" : "  <<< 접두사 미매칭(NULL)"}`);
  }
  console.log(`  grade(정규화) 분포:`);
  for (const [k, v] of Object.entries(gradeFreq).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${v}\t${k}`);
  }
  if (failures.length) {
    console.log(`  실패 목록: ${failures.map((f) => f.ymd).join(", ")}`);
  }

  if (dryRun) {
    console.log(`\n[DRY-RUN] DB 변경 없음. 위 ${updates.length}건이 UPDATE 될 예정.`);
    return;
  }

  // grade_raw 값별로 묶어 배치 UPDATE (.in id)
  console.log(`\n--- UPDATE 실행 ---`);
  const byRaw = new Map<string, number[]>();
  for (const u of updates) {
    if (!byRaw.has(u.gradeRaw)) byRaw.set(u.gradeRaw, []);
    byRaw.get(u.gradeRaw)!.push(u.id);
  }
  let updated = 0;
  for (const [raw, ids] of byRaw) {
    const grade = normalizeGrade(raw);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { error } = await supabase
        .from("races")
        .update({ grade, grade_raw: raw })
        .in("id", chunk);
      if (error) {
        console.error(`  UPDATE 에러 (${raw}, ${chunk.length}건):`, error.message);
      } else {
        updated += chunk.length;
      }
    }
    console.log(`  ${raw} → grade=${grade ?? "NULL"}: ${ids.length}건`);
  }
  console.log(`\n=== 완료: ${updated}/${updates.length}건 UPDATE (실패 페이지 ${failures.length}일) ===`);
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
