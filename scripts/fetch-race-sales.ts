// ============================================================
// 경주별 승식별 매출액 수집 스크립트 (중단 재개 지원)
// 사용법:
//   npx ts-node scripts/fetch-race-sales.ts --year 2024
//   npx ts-node scripts/fetch-race-sales.ts --all
// 소스: kcycle.or.kr 최종배당률 페이지
// URL: /race/dividendrate/final/{year}/{round}/{day}/001/{raceNo}
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 타입 ---
interface RaceSales {
  year: number;
  round: number;
  day: number;
  raceNo: number;
  sales: {
    단승: number;
    연승: number;
    쌍승: number;
    복승: number;
    삼복승: number;
    쌍복승: number;
    삼쌍승: number;
    합계: number;
  };
}

// --- 설정 ---
const DELAY_MS = 500;
const MAX_RETRIES = 3;
const MEET_CD = "001"; // 광명
const OUT_DIR = path.join(__dirname, "..", "src", "data", "yearly-race-sales");

// --- 유틸 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAmount(str: string): number {
  const n = parseInt(str.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
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

// --- race-detail-data.json에서 경주 목록 추출 ---
function loadRaceList(year: number): { round: number; day: number; raceNo: number }[] {
  const dataPath = path.join(__dirname, "..", "src", "data", "race-detail-data.json");
  if (!fs.existsSync(dataPath)) {
    console.error("race-detail-data.json not found. Run fetch-race-detail first.");
    process.exit(1);
  }
  const all = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  return all
    .filter((r: { year: number }) => r.year === year)
    .map((r: { round: number; day: number; raceNo: number }) => ({
      round: r.round,
      day: r.day,
      raceNo: r.raceNo,
    }))
    .sort(
      (a: { round: number; day: number; raceNo: number }, b: { round: number; day: number; raceNo: number }) =>
        a.round - b.round || a.day - b.day || a.raceNo - b.raceNo
    );
}

// --- HTML 파싱 ---
// <th> 헤더명 → sales 키 매핑
const HEADER_MAP: Record<string, keyof RaceSales["sales"]> = {
  "단승식": "단승",
  "연승식": "연승",
  "쌍승식": "쌍승",
  "복승식": "복승",
  "삼복승식": "삼복승",
  "쌍복승식": "쌍복승",
  "삼쌍승식": "삼쌍승",
  "합계": "합계",
};

function parseSales(html: string): RaceSales["sales"] | null {
  const decoded = decodeHtml(html);
  const salesIdx = decoded.indexOf("매출액</h2>");
  if (salesIdx < 0) return null;

  // thead에서 컬럼 헤더 추출
  const theadStart = decoded.indexOf("<thead>", salesIdx);
  const theadEnd = decoded.indexOf("</thead>", theadStart);
  const tbodyStart = decoded.indexOf("<tbody>", salesIdx);
  const tbodyEnd = decoded.indexOf("</tbody>", tbodyStart);
  if (theadStart < 0 || tbodyStart < 0 || tbodyEnd < 0) return null;

  const thead = decoded.substring(theadStart, theadEnd);
  const headers = [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/<[^>]*>/g, "").trim()
  );

  const tbody = decoded.substring(tbodyStart, tbodyEnd);
  const tds = [...tbody.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
    m[1].replace(/<[^>]*>/g, "").trim()
  );

  if (headers.length < 3 || tds.length < 3) return null;

  // 헤더명으로 매핑 (연도별 컬럼 수가 달라도 정확히 매핑)
  const sales: RaceSales["sales"] = {
    단승: 0, 연승: 0, 쌍승: 0, 복승: 0,
    삼복승: 0, 쌍복승: 0, 삼쌍승: 0, 합계: 0,
  };
  for (let i = 0; i < headers.length && i < tds.length; i++) {
    const key = HEADER_MAP[headers[i]];
    if (key) sales[key] = parseAmount(tds[i]);
  }

  return sales.합계 > 0 ? sales : null;
}

// --- 단일 경주 요청 ---
async function fetchOne(
  year: number,
  round: number,
  day: number,
  raceNo: number
): Promise<RaceSales | null> {
  const rr = String(round).padStart(2, "0");
  const rn = String(raceNo).padStart(2, "0");
  const url = `https://www.kcycle.or.kr/race/dividendrate/final/${year}/${rr}/${day}/${MEET_CD}/${rn}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const sales = parseSales(html);
      if (!sales) return null;
      return { year, round, day, raceNo, sales };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        await delay((attempt + 1) * 2000);
      } else {
        console.error(`  ERROR ${rr}-${day}-${rn}: ${msg}`);
        return null;
      }
    }
  }
  return null;
}

// --- 체크포인트 ---
function getProgressPath(year: number): string {
  return path.join(OUT_DIR, `${year}.progress.json`);
}

function getOutPath(year: number): string {
  return path.join(OUT_DIR, `${year}.json`);
}

function saveProgress(year: number, lastIdx: number, results: RaceSales[]): void {
  fs.writeFileSync(getProgressPath(year), JSON.stringify({ lastIdx }), "utf-8");
  fs.writeFileSync(getOutPath(year), JSON.stringify(results, null, 2), "utf-8");
}

function loadProgress(year: number): { lastIdx: number; results: RaceSales[] } {
  let lastIdx = -1;
  let results: RaceSales[] = [];
  const progressPath = getProgressPath(year);
  const outPath = getOutPath(year);
  if (fs.existsSync(progressPath)) {
    lastIdx = JSON.parse(fs.readFileSync(progressPath, "utf-8")).lastIdx;
  }
  if (fs.existsSync(outPath) && lastIdx >= 0) {
    results = JSON.parse(fs.readFileSync(outPath, "utf-8"));
  }
  return { lastIdx, results };
}

function clearProgress(year: number): void {
  const p = getProgressPath(year);
  try { fs.unlinkSync(p); } catch { /* already deleted */ }
}

function isYearDone(year: number): boolean {
  return fs.existsSync(getOutPath(year)) && !fs.existsSync(getProgressPath(year));
}

// --- 단일 연도 수집 ---
async function fetchYear(year: number): Promise<void> {
  const raceList = loadRaceList(year);
  if (raceList.length === 0) {
    console.log(`  ${year}년: 경주 데이터 없음, 건너뜀`);
    return;
  }

  console.log(`${year}년 경주별 매출액 수집 시작 (${raceList.length}건)`);

  const { lastIdx, results } = loadProgress(year);
  const startIdx = lastIdx + 1;
  if (startIdx > 0) {
    console.log(`  이전 진행 재개: ${startIdx}/${raceList.length} (수집: ${results.length}건)`);
  }

  let failCount = 0;
  const startTime = Date.now();

  for (let i = startIdx; i < raceList.length; i++) {
    const { round, day, raceNo } = raceList[i];
    const data = await fetchOne(year, round, day, raceNo);

    if (data) {
      results.push(data);
      failCount = 0;
    } else {
      failCount++;
      if (failCount >= 20) {
        console.error(`  연속 ${failCount}회 실패, ${year}년 중단`);
        saveProgress(year, i, results);
        return;
      }
    }

    if ((i + 1) % 50 === 0 || i === raceList.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const pct = (((i + 1) / raceList.length) * 100).toFixed(1);
      console.log(
        `  ${i + 1}/${raceList.length} (${pct}%) 수집: ${results.length}건 [${elapsed}s]`
      );
      saveProgress(year, i, results);
    }

    await delay(DELAY_MS);
  }

  clearProgress(year);
  fs.writeFileSync(getOutPath(year), JSON.stringify(results, null, 2), "utf-8");

  let totalSales = 0;
  for (const r of results) totalSales += r.sales.합계;
  console.log(`  === ${year}년 완료: ${results.length}건, 매출 ${totalSales.toLocaleString()}원 ===\n`);
}

// --- 메인 ---
async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const args = process.argv.slice(2);
  const isAll = args.includes("--all");
  const yearIdx = args.indexOf("--year");

  if (isAll) {
    // race-detail-data.json에서 사용 가능한 연도 추출
    const dataPath = path.join(__dirname, "..", "src", "data", "race-detail-data.json");
    const all = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
    const years = [...new Set(all.map((r: { year: number }) => r.year))]
      .sort((a, b) => (a as number) - (b as number)) as number[];

    const doneYears = years.filter(isYearDone);
    const todoYears = years.filter((y) => !isYearDone(y));

    console.log(`전체 연도 매출액 수집 (${years[0]}~${years[years.length - 1]})`);
    if (doneYears.length > 0) {
      console.log(`수집 완료 (${doneYears.length}개): ${doneYears.join(", ")}`);
    }
    console.log(`수집 대상 (${todoYears.length}개): ${todoYears.join(", ")}\n`);

    for (const year of todoYears) {
      await fetchYear(year);
    }

    console.log("=== 전체 수집 완료 ===");
  } else {
    const year = yearIdx >= 0 ? parseInt(args[yearIdx + 1], 10) : new Date().getFullYear();
    await fetchYear(year);
  }
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
