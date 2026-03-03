// ============================================================
// 다승30 데이터 수집 스크립트 (전체 연도, 중단 재개 지원)
// 사용법: npm run fetch-win-top30
// kcycle.or.kr HTML 스크래핑
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface WinTop30Record {
  rank: number;
  racerName: string;
  generation: number;     // 기수
  training: string;       // 훈련지
  win1st: number;         // 1착
  win2nd: number;         // 2착
  win3rd: number;         // 3착
  runDays: number;        // 출주일수
  winRate: number;        // 승률
  top2Rate: number;       // 연대율
  top3Rate: number;       // 삼연대율
}

interface YearWinTop30 {
  year: number;
  totalRecords: number;
  records: WinTop30Record[];
}

// --- 설정 ---
const START_YEAR = 1997;
const END_YEAR = 2026;
const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

const DELAY_MS = 1000;
const MAX_RETRIES = 3;
const YEARLY_DIR = path.join(__dirname, "..", "src", "data", "yearly-win-top30");

// --- 유틸 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeNum(val: string): number {
  const n = parseFloat(val.replace(/,/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 1000) / 1000;
}

// --- HTML 파싱 ---
function parseWinTop30(html: string): WinTop30Record[] {
  const records: WinTop30Record[] = [];

  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return records;

  const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

  for (const tr of trs) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => m[1].replace(/<[^>]*>/g, "").trim());

    if (tds.length < 11) continue;

    const rank = parseInt(tds[0]);
    if (isNaN(rank)) continue;

    records.push({
      rank,
      racerName: tds[1],
      generation: safeNum(tds[2]),
      training: tds[3],
      win1st: safeNum(tds[4]),
      win2nd: safeNum(tds[5]),
      win3rd: safeNum(tds[6]),
      runDays: safeNum(tds[7]),
      winRate: safeNum(tds[8]),
      top2Rate: safeNum(tds[9]),
      top3Rate: safeNum(tds[10]),
    });
  }

  return records;
}

// --- Checkpoint ---
function getCheckpointPath(year: number): string {
  return path.join(YEARLY_DIR, `${year}.json`);
}

function isYearDone(year: number): boolean {
  return fs.existsSync(getCheckpointPath(year));
}

function saveCheckpoint(year: number, data: YearWinTop30): void {
  fs.writeFileSync(getCheckpointPath(year), JSON.stringify(data, null, 2), "utf-8");
}

function loadCheckpoint(year: number): YearWinTop30 | null {
  const p = getCheckpointPath(year);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// --- 단일 연도 수집 ---
async function fetchYear(year: number): Promise<YearWinTop30> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const url = "https://www.kcycle.or.kr/racer/ranking/wintop30";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `stndYear=${year}`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const records = parseWinTop30(html);
      return { year, totalRecords: records.length, records };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        console.log(`  재시도 ${attempt + 1}/${MAX_RETRIES}: ${msg}`);
        await delay((attempt + 1) * 3000);
      } else {
        console.error(`  ERROR ${year}년: ${msg}`);
        return { year, totalRecords: 0, records: [] };
      }
    }
  }
  return { year, totalRecords: 0, records: [] };
}

// --- 병합 ---
function mergeAll(): void {
  console.log("\n=== 전체 병합 ===");
  const all: YearWinTop30[] = [];
  for (const year of YEARS) {
    const data = loadCheckpoint(year);
    if (data && data.totalRecords > 0) {
      all.push(data);
      console.log(`  ${year}년: ${data.totalRecords}명`);
    }
  }

  const outPath = path.join(__dirname, "..", "src", "data", "win-top30-data.json");
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf-8");
  console.log(`\n${all.length}개 연도 저장: ${outPath}`);
}

// --- 메인 ---
async function main() {
  if (!fs.existsSync(YEARLY_DIR)) {
    fs.mkdirSync(YEARLY_DIR, { recursive: true });
  }

  console.log("다승30 데이터 수집 시작...");
  console.log(`수집 범위: ${START_YEAR}~${END_YEAR}년\n`);

  const doneYears = YEARS.filter(isYearDone);
  const todoYears = YEARS.filter((y) => !isYearDone(y));

  if (doneYears.length > 0) {
    console.log(`수집 완료 (${doneYears.length}개): ${doneYears.join(", ")}`);
    console.log(`남은 연도 (${todoYears.length}개): ${todoYears.join(", ")}\n`);
  }

  for (const year of todoYears) {
    console.log(`=== ${year}년 ===`);
    const data = await fetchYear(year);
    saveCheckpoint(year, data);
    console.log(`  ${year}년 완료: ${data.totalRecords}명\n`);
    await delay(DELAY_MS);
  }

  mergeAll();
  console.log("\n=== 다승30 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
