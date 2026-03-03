// ============================================================
// 고배당순위 데이터 수집 스크립트 (전체 연도, 중단 재개 지원)
// 사용법: npm run fetch-high-dividend
// kcycle.or.kr HTML 스크래핑
// 7개 승식별 top 5
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface HighDividendRow {
  rank: number;
  amount: string;         // 배당률
  raceDate: string;       // 경주일
  round: string;          // 회차
  day: string;            // 일차
  raceNo: string;         // 경주번호
  combination: string;    // 조합
}

interface HighDividendTable {
  poolType: string;       // 승식명 (단승식, 연승식, ...)
  rows: HighDividendRow[];
}

interface YearHighDividend {
  year: number;
  tables: HighDividendTable[];
}

// --- 설정 ---
const START_YEAR = 2003;
const END_YEAR = 2025;
const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

const DELAY_MS = 1000;
const MAX_RETRIES = 3;
const YEARLY_DIR = path.join(__dirname, "..", "src", "data", "yearly-high-dividend");

const POOL_TYPES = ["단승식", "연승식", "쌍승식", "복승식", "삼복승식", "삼쌍승식", "쌍복승식"];

// --- 유틸 ---
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

// --- HTML 파싱 ---
function parseHighDividend(html: string): HighDividendTable[] {
  const tables: HighDividendTable[] = [];

  const tbodies = [...html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)];

  for (let ti = 0; ti < tbodies.length; ti++) {
    const rows: HighDividendRow[] = [];
    const trs = [...tbodies[ti][1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

    for (const tr of trs) {
      const tds = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
        .map(m => decodeHtml(m[1].replace(/<[^>]*>/g, "").trim()));

      if (tds.length < 3) continue;

      const rank = parseInt(tds[0]);
      if (isNaN(rank)) continue;

      // 4 cells: 순위(th), 배당률%(td), 경주회차(td), 경주동영상(td-skip)
      const raceInfo = tds[2].replace(/\s+/g, " ").trim();
      rows.push({
        rank,
        amount: tds[1].replace(/\s+/g, ""),
        raceDate: raceInfo,
        round: "",
        day: "",
        raceNo: "",
        combination: "",
      });
    }

    if (rows.length > 0) {
      tables.push({
        poolType: POOL_TYPES[ti] || `승식 ${ti + 1}`,
        rows,
      });
    }
  }

  return tables;
}

// --- Checkpoint ---
function getCheckpointPath(year: number): string {
  return path.join(YEARLY_DIR, `${year}.json`);
}

function isYearDone(year: number): boolean {
  return fs.existsSync(getCheckpointPath(year));
}

function saveCheckpoint(year: number, data: YearHighDividend): void {
  fs.writeFileSync(getCheckpointPath(year), JSON.stringify(data, null, 2), "utf-8");
}

function loadCheckpoint(year: number): YearHighDividend | null {
  const p = getCheckpointPath(year);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// --- 단일 연도 수집 ---
async function fetchYear(year: number): Promise<YearHighDividend> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const url = "https://www.kcycle.or.kr/race/stats/highdividend";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `stndYear=${year}`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const tables = parseHighDividend(html);
      return { year, tables };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        console.log(`  재시도 ${attempt + 1}/${MAX_RETRIES}: ${msg}`);
        await delay((attempt + 1) * 3000);
      } else {
        console.error(`  ERROR ${year}년: ${msg}`);
        return { year, tables: [] };
      }
    }
  }
  return { year, tables: [] };
}

// --- 병합 ---
function mergeAll(): void {
  console.log("\n=== 전체 병합 ===");
  const all: YearHighDividend[] = [];
  for (const year of YEARS) {
    const data = loadCheckpoint(year);
    if (data && data.tables.length > 0) {
      all.push(data);
      const totalRows = data.tables.reduce((sum, t) => sum + t.rows.length, 0);
      console.log(`  ${year}년: ${data.tables.length}개 승식, ${totalRows}건`);
    }
  }

  const outPath = path.join(__dirname, "..", "src", "data", "high-dividend-data.json");
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf-8");
  console.log(`\n${all.length}개 연도 저장: ${outPath}`);
}

// --- 메인 ---
async function main() {
  if (!fs.existsSync(YEARLY_DIR)) {
    fs.mkdirSync(YEARLY_DIR, { recursive: true });
  }

  console.log("고배당순위 데이터 수집 시작...");
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
    console.log(`  ${year}년 완료: ${data.tables.length}개 승식\n`);
    await delay(DELAY_MS);
  }

  mergeAll();
  console.log("\n=== 고배당순위 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
