// ============================================================
// 경주별 승식별 매출액 수집 스크립트 (1994~2002 레거시)
// 사용법:
//   npx ts-node scripts/fetch-race-sales-legacy.ts --year 2000
//   npx ts-node scripts/fetch-race-sales-legacy.ts --all
// 소스: kcycle.or.kr 최종배당률 페이지
// 경주 목록: select#tmsDayOrd 드롭다운에서 파싱
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
  grade: string | null;
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
const DELAY_MS = 1000;
const MAX_RETRIES = 3;
const FETCH_TIMEOUT_MS = 15000;
const MEET_CD = "001"; // 광명
const LEGACY_YEARS = [1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002];
const OUT_DIR = path.join(__dirname, "..", "src", "data", "yearly-race-sales");

// --- 유틸 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAmount(str: string): number {
  const n = parseInt(str.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

async function fetchWithTimeout(url: string): Promise<string | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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

// --- 드롭다운에서 회차/일차 목록 파싱 ---
async function fetchRoundDayList(year: number): Promise<{ round: number; day: number }[]> {
  const url = `https://www.kcycle.or.kr/race/dividendrate/final/${year}/1/1/${MEET_CD}/1`;
  const html = await fetchWithTimeout(url);
  if (!html) throw new Error(`Failed to fetch dropdown for ${year}`);

  const selMatch = html.match(/<select[^>]*id="tmsDayOrd"[^>]*>([\s\S]*?)<\/select>/);
  if (!selMatch) throw new Error(`select#tmsDayOrd not found for ${year}`);

  const opts = [...selMatch[1].matchAll(/<option[^>]*value="(\d+)-(\d+)"[^>]*>/g)];
  const list = opts.map((m) => ({ round: parseInt(m[1], 10), day: parseInt(m[2], 10) }));

  // 드롭다운은 최신 순이므로 오름차순 정렬
  list.sort((a, b) => a.round - b.round || a.day - b.day);
  return list;
}

// --- 매출액 파싱 (기존 fetch-race-sales.ts와 동일) ---
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
    const html = await fetchWithTimeout(url);
    if (html === null) {
      if (attempt < MAX_RETRIES - 1) {
        await delay((attempt + 1) * 2000);
        continue;
      }
      console.error(`  ERROR ${rr}-${day}-${rn}: timeout/fetch failed`);
      return null;
    }
    const sales = parseSales(html);
    if (!sales) return null;
    return { year, round, day, raceNo, grade: null, sales };
  }
  return null;
}

// --- 체크포인트 ---
function getProgressPath(year: number): string {
  return path.join(OUT_DIR, `${year}.legacy.progress.json`);
}

function getOutPath(year: number): string {
  return path.join(OUT_DIR, `${year}.json`);
}

interface ProgressData {
  roundDayIdx: number;
  raceNo: number;
}

function saveProgress(year: number, progress: ProgressData, results: RaceSales[]): void {
  fs.writeFileSync(getProgressPath(year), JSON.stringify(progress), "utf-8");
  fs.writeFileSync(getOutPath(year), JSON.stringify(results, null, 2), "utf-8");
}

function loadProgress(year: number): { progress: ProgressData | null; results: RaceSales[] } {
  const progressPath = getProgressPath(year);
  const outPath = getOutPath(year);
  let progress: ProgressData | null = null;
  let results: RaceSales[] = [];
  if (fs.existsSync(progressPath)) {
    progress = JSON.parse(fs.readFileSync(progressPath, "utf-8"));
  }
  if (fs.existsSync(outPath) && progress) {
    results = JSON.parse(fs.readFileSync(outPath, "utf-8"));
  }
  return { progress, results };
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
  console.log(`\n${year}년 회차/일차 목록 조회 중...`);
  const roundDays = await fetchRoundDayList(year);
  if (roundDays.length === 0) {
    console.log(`  ${year}년: 회차 데이터 없음, 건너뜀`);
    return;
  }
  console.log(`${year}년 매출액 수집 시작 (${roundDays.length}개 일차)`);

  const { progress, results } = loadProgress(year);
  let startRdIdx = 0;
  let startRaceNo = 1;
  if (progress) {
    startRdIdx = progress.roundDayIdx;
    startRaceNo = progress.raceNo;
    console.log(`  이전 진행 재개: ${startRdIdx + 1}/${roundDays.length}일차, 경주 ${startRaceNo}번 (수집: ${results.length}건)`);
  }

  const startTime = Date.now();

  for (let rdIdx = startRdIdx; rdIdx < roundDays.length; rdIdx++) {
    const { round, day } = roundDays[rdIdx];
    let raceNo = rdIdx === startRdIdx ? startRaceNo : 1;
    let consecutiveFails = 0;

    while (true) {
      const data = await fetchOne(year, round, day, raceNo);
      if (!data) {
        // 매출액 섹션 없음 → 해당 일차 경주 끝
        break;
      }

      results.push(data);
      consecutiveFails = 0;
      raceNo++;

      await delay(DELAY_MS);
    }

    // 일차 완료 로그
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const pct = (((rdIdx + 1) / roundDays.length) * 100).toFixed(1);
    const racesInDay = raceNo - (rdIdx === startRdIdx ? startRaceNo : 1);
    console.log(
      `  ${rdIdx + 1}/${roundDays.length} (${pct}%) ${round}회 ${day}일차: ${racesInDay}경주 [총 ${results.length}건, ${elapsed}s]`
    );
    saveProgress(year, { roundDayIdx: rdIdx + 1, raceNo: 1 }, results);

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
    const doneYears = LEGACY_YEARS.filter(isYearDone);
    const todoYears = LEGACY_YEARS.filter((y) => !isYearDone(y));

    console.log(`레거시 매출액 수집 (1994~2002)`);
    if (doneYears.length > 0) {
      console.log(`수집 완료 (${doneYears.length}개): ${doneYears.join(", ")}`);
    }
    console.log(`수집 대상 (${todoYears.length}개): ${todoYears.join(", ")}\n`);

    for (const year of todoYears) {
      await fetchYear(year);
    }

    console.log("=== 전체 수집 완료 ===");
  } else if (yearIdx >= 0) {
    const year = parseInt(args[yearIdx + 1], 10);
    if (!LEGACY_YEARS.includes(year)) {
      console.error(`${year}년은 레거시 범위(1994~2002)가 아닙니다.`);
      process.exit(1);
    }
    await fetchYear(year);
  } else {
    console.error("사용법: --year <연도> 또는 --all");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
