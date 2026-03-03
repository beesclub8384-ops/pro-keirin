// ============================================================
// 제재 기록 데이터 수집 스크립트 (전체 연도, 중단 재개 지원)
// 사용법: npm run fetch-sanction
// kcycle.or.kr HTML 스크래핑
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface SanctionRecord {
  racerName: string;      // 선수명
  generation: string;     // 기수
  racerId: string;        // 선수 ID
  result: string;         // 처리결과 (출전정지 1회 1일 등)
  reason: string;         // 제재사유
  effectiveDate: string;  // 시행일 (YYYY.MM.DD)
}

interface YearSanction {
  year: number;
  totalRecords: number;
  sanctions: SanctionRecord[];
}

// --- 설정 ---
const START_YEAR = 2003;
const END_YEAR = 2025;
const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

const DELAY_MS = 1000;
const MAX_RETRIES = 3;
const YEARLY_DIR = path.join(__dirname, "..", "src", "data", "yearly-sanction");

// --- 유틸 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- HTML 파싱 ---
function parseSanctionPage(html: string): { records: SanctionRecord[]; lastPage: number } {
  const records: SanctionRecord[] = [];

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

    if (tds.length < 4) continue;

    // 첫 번째 셀: "양승용 / 10기\n20030011" 형태
    const nameCell = tds[0];
    const nameMatch = nameCell.match(/^(.+?)\s*\/\s*(\d+)기\s+(\d+)/);
    if (!nameMatch) continue;

    records.push({
      racerName: nameMatch[1].trim(),
      generation: nameMatch[2],
      racerId: nameMatch[3],
      result: tds[1].trim(),
      reason: tds[2].replace(/\s+/g, " ").trim(),
      effectiveDate: tds[3].trim(),
    });
  }

  return { records, lastPage };
}

// --- Checkpoint ---
function getCheckpointPath(year: number): string {
  return path.join(YEARLY_DIR, `${year}.json`);
}

function isYearDone(year: number): boolean {
  return fs.existsSync(getCheckpointPath(year));
}

function saveCheckpoint(year: number, data: YearSanction): void {
  fs.writeFileSync(getCheckpointPath(year), JSON.stringify(data, null, 2), "utf-8");
}

function loadCheckpoint(year: number): YearSanction | null {
  const p = getCheckpointPath(year);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// --- 페이지 fetch (POST로 페이지네이션) ---
async function fetchSanctionPage(year: number, page: number): Promise<string> {
  const url = `https://www.kcycle.or.kr/racer/state/sanction`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `stndYear=${year}&pagination.currentPage=${page}`,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// --- 단일 연도 수집 ---
async function fetchYear(year: number): Promise<YearSanction> {
  const allRecords: SanctionRecord[] = [];
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    let success = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        const html = page === 1
          ? await fetch(`https://www.kcycle.or.kr/racer/state/sanction?stndYear=${year}`).then(r => r.text())
          : await fetchSanctionPage(year, page);
        const result = parseSanctionPage(html);
        success = true;

        if (page === 1) {
          lastPage = result.lastPage;
          if (result.records.length === 0) {
            return { year, totalRecords: 0, sanctions: [] };
          }
          if (lastPage > 1) console.log(`  총 ${lastPage} 페이지`);
        }

        allRecords.push(...result.records);
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
        }
      }
    }
  }

  return { year, totalRecords: allRecords.length, sanctions: allRecords };
}

// --- 병합 ---
function mergeAll(): void {
  console.log("\n=== 전체 병합 ===");
  const all: YearSanction[] = [];
  for (const year of YEARS) {
    const data = loadCheckpoint(year);
    if (data && data.totalRecords > 0) {
      all.push(data);
      console.log(`  ${year}년: ${data.totalRecords}건`);
    }
  }

  const outPath = path.join(__dirname, "..", "src", "data", "sanction-data.json");
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf-8");
  console.log(`\n${all.length}개 연도 저장: ${outPath}`);
}

// --- 메인 ---
async function main() {
  if (!fs.existsSync(YEARLY_DIR)) {
    fs.mkdirSync(YEARLY_DIR, { recursive: true });
  }

  console.log("제재 기록 데이터 수집 시작...");
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
    console.log(`  ${year}년 완료: ${data.totalRecords}건\n`);
    await delay(DELAY_MS);
  }

  mergeAll();
  console.log("\n=== 제재 기록 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
