// ============================================================
// 배당률통계 데이터 수집 스크립트 (전체 연도, 중단 재개 지원)
// 사용법: npm run fetch-dividend-stats
// kcycle.or.kr HTML 스크래핑
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface DividendHighRow {
  poolType: string;       // 승식 (단승식, 연승식, ...)
  amount: string;         // 최고 배당률
  raceDate: string;       // 경주일
  round: string;          // 회차
  day: string;            // 일차
  raceNo: string;         // 경주번호
  combination: string;    // 조합
}

interface DividendDistRow {
  poolType: string;       // 승식
  range1: string;         // 범위별 분포 값
  range2: string;
  range3: string;
  range4: string;
  range5: string;
  range6: string;
  range7: string;
  range8: string;
}

interface YearDividendStats {
  year: number;
  highDividends: DividendHighRow[];
  distribution: DividendDistRow[];
}

// --- 설정 ---
const START_YEAR = 2003;
const END_YEAR = 2025;
const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

const DELAY_MS = 1000;
const MAX_RETRIES = 3;
const YEARLY_DIR = path.join(__dirname, "..", "src", "data", "yearly-dividend-stats");

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
function parseDividendStats(html: string): { highDividends: DividendHighRow[]; distribution: DividendDistRow[] } {
  const highDividends: DividendHighRow[] = [];
  const distribution: DividendDistRow[] = [];

  // 모든 테이블의 tbody 추출
  const tbodies = [...html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)];

  // 테이블 1: 최고배당률 (7행) — 3 cells: 승식(th), 배당률(td), 경주일자/회차(td)
  if (tbodies.length >= 1) {
    const trs = [...tbodies[0][1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    for (const tr of trs) {
      const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
        .map(m => decodeHtml(m[1].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " "));

      if (cells.length < 3) continue;

      highDividends.push({
        poolType: cells[0],
        amount: cells[1],
        raceDate: cells[2],  // "2024년 13회차 3일차 제06경주(04/07)" 통합 텍스트
        round: "",
        day: "",
        raceNo: "",
        combination: "",
      });
    }
  }

  // 테이블 2: 배당률 분포 (7행)
  if (tbodies.length >= 2) {
    const trs = [...tbodies[1][1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    for (const tr of trs) {
      const tds = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
        .map(m => decodeHtml(m[1].replace(/<[^>]*>/g, "").trim()));

      if (tds.length < 2) continue;

      distribution.push({
        poolType: tds[0],
        range1: tds[1] || "",
        range2: tds[2] || "",
        range3: tds[3] || "",
        range4: tds[4] || "",
        range5: tds[5] || "",
        range6: tds[6] || "",
        range7: tds[7] || "",
        range8: tds[8] || "",
      });
    }
  }

  return { highDividends, distribution };
}

// --- Checkpoint ---
function getCheckpointPath(year: number): string {
  return path.join(YEARLY_DIR, `${year}.json`);
}

function isYearDone(year: number): boolean {
  return fs.existsSync(getCheckpointPath(year));
}

function saveCheckpoint(year: number, data: YearDividendStats): void {
  fs.writeFileSync(getCheckpointPath(year), JSON.stringify(data, null, 2), "utf-8");
}

function loadCheckpoint(year: number): YearDividendStats | null {
  const p = getCheckpointPath(year);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// --- 단일 연도 수집 ---
async function fetchYear(year: number): Promise<YearDividendStats> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const url = "https://www.kcycle.or.kr/race/stats/dividendrate";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `stndYear=${year}`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const { highDividends, distribution } = parseDividendStats(html);
      return { year, highDividends, distribution };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        console.log(`  재시도 ${attempt + 1}/${MAX_RETRIES}: ${msg}`);
        await delay((attempt + 1) * 3000);
      } else {
        console.error(`  ERROR ${year}년: ${msg}`);
        return { year, highDividends: [], distribution: [] };
      }
    }
  }
  return { year, highDividends: [], distribution: [] };
}

// --- 병합 ---
function mergeAll(): void {
  console.log("\n=== 전체 병합 ===");
  const all: YearDividendStats[] = [];
  for (const year of YEARS) {
    const data = loadCheckpoint(year);
    if (data && (data.highDividends.length > 0 || data.distribution.length > 0)) {
      all.push(data);
      console.log(`  ${year}년: 최고배당 ${data.highDividends.length}건, 분포 ${data.distribution.length}건`);
    }
  }

  const outPath = path.join(__dirname, "..", "src", "data", "dividend-stats-data.json");
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf-8");
  console.log(`\n${all.length}개 연도 저장: ${outPath}`);
}

// --- 메인 ---
async function main() {
  if (!fs.existsSync(YEARLY_DIR)) {
    fs.mkdirSync(YEARLY_DIR, { recursive: true });
  }

  console.log("배당률통계 데이터 수집 시작...");
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
    console.log(`  ${year}년 완료: 최고배당 ${data.highDividends.length}건, 분포 ${data.distribution.length}건\n`);
    await delay(DELAY_MS);
  }

  mergeAll();
  console.log("\n=== 배당률통계 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
