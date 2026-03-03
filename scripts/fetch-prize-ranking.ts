// ============================================================
// 상금순위 데이터 수집 스크립트 (전체 연도, 중단 재개 지원)
// 사용법: npm run fetch-prize-ranking
// kcycle.or.kr HTML 스크래핑
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface PrizeRankingRecord {
  rank: number;
  racerName: string;
  grade: string;          // 등급
  birthYear: string;      // 출생년도
  origin: string;         // 출신
  runDays: number;        // 출주일수
  totalPrize: string;     // 총 상금 (원문 유지)
}

interface YearPrizeRanking {
  year: number;
  totalRecords: number;
  records: PrizeRankingRecord[];
}

// --- 설정 ---
const START_YEAR = 2003;
const END_YEAR = 2025;
const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

const DELAY_MS = 1000;
const MAX_RETRIES = 3;
const YEARLY_DIR = path.join(__dirname, "..", "src", "data", "yearly-prize-ranking");

// --- 유틸 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- HTML 파싱 ---
function parsePrizeRankingPage(html: string): { records: PrizeRankingRecord[]; lastPage: number } {
  const records: PrizeRankingRecord[] = [];

  // 마지막 페이지 번호 추출
  const pageNums = [...html.matchAll(/fnSearch\((\d+)\)/g)].map(m => parseInt(m[1]));
  const lastPage = pageNums.length > 0 ? Math.max(...pageNums) : 1;

  // tbody 파싱
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return { records, lastPage };

  const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

  for (const tr of trs) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => m[1].replace(/<[^>]*>/g, "").trim());

    if (tds.length < 6) continue;

    const rank = parseInt(tds[0]);
    if (isNaN(rank)) continue;

    records.push({
      rank,
      racerName: tds[1],
      grade: tds[2],
      birthYear: tds[3],
      origin: tds[4],
      runDays: parseInt(tds[5]) || 0,
      totalPrize: (tds[6] || "").replace(/\s+/g, ""),
    });
  }

  return { records, lastPage };
}

// --- 페이지 fetch ---
async function fetchPrizeRankingPage(year: number, page: number): Promise<string> {
  const url = "https://www.kcycle.or.kr/racer/prize/ranking";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `stndYear=${year}&pagination.currentPage=${page}`,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// --- Checkpoint ---
function getCheckpointPath(year: number): string {
  return path.join(YEARLY_DIR, `${year}.json`);
}

function isYearDone(year: number): boolean {
  return fs.existsSync(getCheckpointPath(year));
}

function saveCheckpoint(year: number, data: YearPrizeRanking): void {
  fs.writeFileSync(getCheckpointPath(year), JSON.stringify(data, null, 2), "utf-8");
}

function loadCheckpoint(year: number): YearPrizeRanking | null {
  const p = getCheckpointPath(year);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// --- 단일 연도 수집 ---
async function fetchYear(year: number): Promise<YearPrizeRanking> {
  const allRecords: PrizeRankingRecord[] = [];
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    let success = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        const html = await fetchPrizeRankingPage(year, page);
        const result = parsePrizeRankingPage(html);
        success = true;

        if (page === 1) {
          lastPage = result.lastPage;
          if (result.records.length === 0) {
            console.log(`  ${year}년: 데이터 없음`);
            return { year, totalRecords: 0, records: [] };
          }
          if (lastPage > 1) console.log(`  총 ${lastPage} 페이지`);
        }

        allRecords.push(...result.records);

        if (page % 5 === 0 || page === lastPage) {
          console.log(`  페이지 ${page}/${lastPage}: 누적 ${allRecords.length}명`);
        }

        page++;
        if (page <= lastPage) await delay(DELAY_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_RETRIES - 1) {
          console.log(`  재시도 ${attempt + 1}/${MAX_RETRIES}: ${msg}`);
          await delay((attempt + 1) * 3000);
        } else {
          console.error(`  ERROR 페이지 ${page}: ${msg}`);
          page++;
          await delay(2000);
        }
      }
    }
  }

  return { year, totalRecords: allRecords.length, records: allRecords };
}

// --- 병합 ---
function mergeAll(): void {
  console.log("\n=== 전체 병합 ===");
  const all: YearPrizeRanking[] = [];
  for (const year of YEARS) {
    const data = loadCheckpoint(year);
    if (data && data.totalRecords > 0) {
      all.push(data);
      console.log(`  ${year}년: ${data.totalRecords}명`);
    }
  }

  const outPath = path.join(__dirname, "..", "src", "data", "prize-ranking-data.json");
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf-8");
  console.log(`\n${all.length}개 연도 저장: ${outPath}`);
}

// --- 메인 ---
async function main() {
  if (!fs.existsSync(YEARLY_DIR)) {
    fs.mkdirSync(YEARLY_DIR, { recursive: true });
  }

  console.log("상금순위 데이터 수집 시작...");
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
  }

  mergeAll();
  console.log("\n=== 상금순위 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
