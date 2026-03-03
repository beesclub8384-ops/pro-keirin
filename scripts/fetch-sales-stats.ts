// ============================================================
// 매출액통계 데이터 수집 스크립트 (전체 연도, 중단 재개 지원)
// 사용법: npm run fetch-sales-stats
// kcycle.or.kr HTML 스크래핑
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface SalesTopRow {
  rank: number;
  amount: string;         // 매출액
  raceDate: string;       // 경주일
  round: string;          // 회차
  day: string;            // 일차
  raceNo: string;         // 경주번호 (경주별인 경우)
}

interface YearSalesStats {
  year: number;
  byRound: SalesTopRow[];   // 회차별 최고매출
  byDay: SalesTopRow[];     // 일차별 최고매출
  byRace: SalesTopRow[];    // 경주별 최고매출
}

// --- 설정 ---
const START_YEAR = 2003;
const END_YEAR = 2025;
const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

const DELAY_MS = 1000;
const MAX_RETRIES = 3;
const YEARLY_DIR = path.join(__dirname, "..", "src", "data", "yearly-sales-stats");

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
function parseSalesStats(html: string): { byRound: SalesTopRow[]; byDay: SalesTopRow[]; byRace: SalesTopRow[] } {
  const byRound: SalesTopRow[] = [];
  const byDay: SalesTopRow[] = [];
  const byRace: SalesTopRow[] = [];

  // 서버가 일부 연도(2018, 2020)에서 </tbody> 없이 응답을 잘라내는 버그 존재.
  // h3 헤더 기반으로 섹션을 분할하여 각 테이블을 독립적으로 파싱.
  const sections = [
    { key: "byRound", header: "회차별" },
    { key: "byDay", header: "일차별" },
    { key: "byRace", header: "경주별" },
  ];

  // 첫 번째 렌더링만 사용 (서버가 DOCTYPE을 중복 출력하는 경우 대비)
  const firstDocEnd = html.indexOf("<!DOCTYPE", 1);
  const cleanHtml = firstDocEnd > 0 ? html.substring(0, firstDocEnd) : html;

  function parseTable(content: string): SalesTopRow[] {
    const rows: SalesTopRow[] = [];
    const trs = [...content.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    for (const tr of trs) {
      const tds = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
        .map(m => decodeHtml(m[1].replace(/<[^>]*>/g, "").trim()));

      if (tds.length < 3) continue;

      const rank = parseInt(tds[0]);
      if (isNaN(rank)) continue;

      const info = tds[1].replace(/\s+/g, " ").trim();
      rows.push({
        rank,
        amount: tds[2].replace(/\s+/g, ""),
        raceDate: info,
        round: "",
        day: "",
        raceNo: "",
      });
    }
    return rows;
  }

  // 방법 1: 정상 응답 — </tbody> 기반
  const tbodies = [...cleanHtml.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)];
  if (tbodies.length >= 3) {
    byRound.push(...parseTable(tbodies[0][1]));
    byDay.push(...parseTable(tbodies[1][1]));
    byRace.push(...parseTable(tbodies[2][1]));
    return { byRound, byDay, byRace };
  }

  // 방법 2: 깨진 응답 — h3 헤더 위치 기반 섹션 분할
  const targets = [byRound, byDay, byRace];
  for (let i = 0; i < sections.length; i++) {
    const headerIdx = cleanHtml.indexOf(`${sections[i].header}`);
    if (headerIdx < 0) continue;
    const tbodyStart = cleanHtml.indexOf("<tbody", headerIdx);
    if (tbodyStart < 0) continue;
    const tbodyClose = cleanHtml.indexOf("</tbody>", tbodyStart);
    const nextHeader = i < sections.length - 1
      ? cleanHtml.indexOf(`${sections[i + 1].header}`, headerIdx + 10)
      : -1;
    const end = tbodyClose > 0 ? tbodyClose
      : nextHeader > 0 ? nextHeader
      : cleanHtml.length;
    targets[i].push(...parseTable(cleanHtml.substring(tbodyStart, end)));
  }

  return { byRound, byDay, byRace };
}

// --- Checkpoint ---
function getCheckpointPath(year: number): string {
  return path.join(YEARLY_DIR, `${year}.json`);
}

function isYearDone(year: number): boolean {
  return fs.existsSync(getCheckpointPath(year));
}

function saveCheckpoint(year: number, data: YearSalesStats): void {
  fs.writeFileSync(getCheckpointPath(year), JSON.stringify(data, null, 2), "utf-8");
}

function loadCheckpoint(year: number): YearSalesStats | null {
  const p = getCheckpointPath(year);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// --- 단일 연도 수집 ---
async function fetchYear(year: number): Promise<YearSalesStats> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const url = "https://www.kcycle.or.kr/race/stats/sales";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `stndYear=${year}`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const { byRound, byDay, byRace } = parseSalesStats(html);
      return { year, byRound, byDay, byRace };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        console.log(`  재시도 ${attempt + 1}/${MAX_RETRIES}: ${msg}`);
        await delay((attempt + 1) * 3000);
      } else {
        console.error(`  ERROR ${year}년: ${msg}`);
        return { year, byRound: [], byDay: [], byRace: [] };
      }
    }
  }
  return { year, byRound: [], byDay: [], byRace: [] };
}

// --- 병합 ---
function mergeAll(): void {
  console.log("\n=== 전체 병합 ===");
  const all: YearSalesStats[] = [];
  for (const year of YEARS) {
    const data = loadCheckpoint(year);
    if (data && (data.byRound.length > 0 || data.byDay.length > 0 || data.byRace.length > 0)) {
      all.push(data);
      console.log(`  ${year}년: 회차별 ${data.byRound.length}, 일차별 ${data.byDay.length}, 경주별 ${data.byRace.length}`);
    }
  }

  const outPath = path.join(__dirname, "..", "src", "data", "sales-stats-data.json");
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf-8");
  console.log(`\n${all.length}개 연도 저장: ${outPath}`);
}

// --- 메인 ---
async function main() {
  if (!fs.existsSync(YEARLY_DIR)) {
    fs.mkdirSync(YEARLY_DIR, { recursive: true });
  }

  console.log("매출액통계 데이터 수집 시작...");
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
    console.log(`  ${year}년 완료\n`);
    await delay(DELAY_MS);
  }

  mergeAll();
  console.log("\n=== 매출액통계 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
