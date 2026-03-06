// ============================================================
// 확정출주표 HTML 스크래핑 스크립트 (전체 연도, 중단 재개 지원)
// 사용법: npm run fetch-decision-card
// kcycle.or.kr 확정출주표 페이지에서 ~31개 필드 수집
// URL: /race/card/decision/{year}/{round}/{day}
// 한 페이지에 해당 일차 전체 경주 포함 (광명만 필터)
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface RacerEntry {
  backNo: number;
  racerId: string;
  generation: number;     // 기수
  age: number;
  photoUrl: string;
  // 경주장별 승률
  winRateVenue: number;   // 광명 승률
  top2RateVenue: number;  // 광명 연대율
  top3RateVenue: number;  // 광명 삼연대율
  winRateTotal: number;   // 종합 승률
  top2RateTotal: number;  // 종합 연대율
  top3RateTotal: number;  // 종합 삼연대율
  // 입상횟수
  place1st: number;       // 1착
  place2nd: number;       // 2착
  place3rd: number;       // 3착
  // 전법별 성적 (종합)
  tacticPreemptTotal: string;   // 선행 종합
  tacticPushTotal: string;      // 젖히기 종합
  tacticChaseTotal: string;     // 추입 종합
  tacticMarkTotal: string;      // 마크 종합
  // 전법별 성적 (당회)
  tacticPreemptRound: string;   // 선행 당회
  tacticPushRound: string;      // 젖히기 당회
  tacticChaseRound: string;     // 추입 당회
  tacticMarkRound: string;      // 마크 당회
  // 등급조정
  gradeAdjust: string;
  // 최근3회 득점
  recent3ScoreVenue: string;    // 광명
  recent3ScoreTotal: string;    // 종합
  // 성적순위
  performanceRank: string;
  // 결장 여부
  isAbsent: boolean;
}

interface RecentPerformance {
  backNo: number;
  cells: string[];          // 원문 14 cells 그대로
}

interface HeadToHead {
  backNo: number;
  // 상대전적 7명 (승/횟수)
  vsRecord: string[];       // 7 entries: "2/5" 형태
  // 동반입상전적 7명 (입상/횟수)
  coPlaceRecord: string[];  // 7 entries
  // 위반점
  violation2ago: string;    // 최근2회
  violation1ago: string;    // 최근1회
  violationCurrent: string; // 금회
  violationRemain: string;  // 잔여
}

interface RaceDecisionCard {
  raceNo: number;
  startTime: string;
  laps: string;            // 주회수
  raceType: string;        // 경주방식
  entries: RacerEntry[];
  recentPerformance: RecentPerformance[];
  headToHead: HeadToHead[];
}

interface PageDecisionCard {
  year: number;
  round: number;           // 회차
  day: number;             // 일차
  date: string;            // entry data에서 추출한 날짜
  races: RaceDecisionCard[];
}

// --- 설정 ---
const START_YEAR = 2003;
const END_YEAR = 2026;
const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

const DELAY_MS = 500;
const MAX_RETRIES = 3;
const YEARLY_DIR = path.join(__dirname, "..", "src", "data", "yearly-decision-card");
const ENTRY_DIR = path.join(__dirname, "..", "src", "data", "yearly-entry");

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

function safeNum(val: string): number {
  const n = parseFloat(val.replace(/,/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 1000) / 1000;
}

// --- Entry 데이터에서 대상 페이지 목록 ---
interface PageTarget {
  round: number;
  day: number;
  date: string;
}

function loadPageTargets(year: number): PageTarget[] {
  const entryPath = path.join(ENTRY_DIR, `${year}.json`);
  if (!fs.existsSync(entryPath)) {
    console.log(`  WARNING: ${entryPath} 없음`);
    return [];
  }

  const entries = JSON.parse(fs.readFileSync(entryPath, "utf-8"));
  const seen = new Map<string, PageTarget>();

  for (const e of entries) {
    const key = `${e.week}-${e.day}`;
    if (!seen.has(key)) {
      seen.set(key, {
        round: e.week,
        day: e.day,
        date: e.date,
      });
    }
  }

  const targets = [...seen.values()];
  targets.sort((a, b) => a.round - b.round || a.day - b.day);
  return targets;
}

// --- HTML 파싱 ---

// 경주 섹션 분할: <h2> 태그로 구분
function splitRaceSections(html: string): { venue: string; raceNo: number; raceType: string; startTime: string; laps: string; sectionHtml: string }[] {
  const sections: { venue: string; raceNo: number; raceType: string; startTime: string; laps: string; sectionHtml: string }[] = [];

  // 헤더 패턴: "광명 01경주 (선발 12:52)"
  const headerPattern = /<h[234][^>]*>([\s\S]*?)<\/h[234]>/g;
  const headers: { match: string; index: number; venue: string; raceNo: number; raceType: string; startTime: string }[] = [];

  let m;
  while ((m = headerPattern.exec(html)) !== null) {
    const text = decodeHtml(m[1].replace(/<[^>]*>/g, "").trim());
    // "광명 01경주 (선발 12:52)" 패턴
    const raceMatch = text.match(/(광명|창원|부산)\s+(\d+)\s*경주\s*\(([^\s)]*)\s+(\d{1,2}:\d{2})\)/);
    if (raceMatch) {
      headers.push({
        match: m[0],
        index: m.index!,
        venue: raceMatch[1],
        raceNo: parseInt(raceMatch[2]),
        raceType: raceMatch[3] || "",
        startTime: raceMatch[4] || "",
      });
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i < headers.length - 1 ? headers[i + 1].index : html.length;
    const sectionHtml = html.substring(start, end);

    // 주회수 추출 (섹션 내에서)
    let laps = "";
    const lapsMatch = sectionHtml.match(/(\d+)\s*주회/);
    if (lapsMatch) laps = lapsMatch[1];

    sections.push({
      venue: headers[i].venue,
      raceNo: headers[i].raceNo,
      raceType: headers[i].raceType,
      startTime: headers[i].startTime,
      laps,
      sectionHtml,
    });
  }

  return sections;
}

// 테이블에서 행 추출
function extractTableRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const trs = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

  for (const tr of trs) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map(m => m[1].trim());
    if (cells.length > 0) rows.push(cells);
  }

  return rows;
}

// 셀 텍스트 정제 (HTML 태그 제거)
function cellText(cell: string): string {
  return decodeHtml(cell.replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " ");
}

// Table 0: 선수정보 파싱
function parseEntryTable(tableHtml: string): RacerEntry[] {
  const entries: RacerEntry[] = [];
  const rows = extractTableRows(tableHtml);

  // 데이터 행 (헤더 행 스킵 - th 포함 행)
  // 결장 행 감지를 위해 원본 <tr> 태그도 참조
  const trs = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

  for (const tr of trs) {
    const trHtml = tr[1];
    const cells = [...trHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)];
    if (cells.length === 0) continue;

    const cell0 = cells[0][1].trim();

    // racerId 추출 (헤더 행이면 skip)
    const raceridMatch = cell0.match(/fnRacer\.popup\([^)]*?(\d{8,})/);
    if (!raceridMatch) continue;

    const racerId = raceridMatch[1];

    // 등번호
    const backNoMatch = cellText(cell0).match(/^(\d)/);
    const backNo = backNoMatch ? parseInt(backNoMatch[1]) : 0;

    // 결장 감지: colspan이 있는 td에 "결" + "장" 텍스트
    const hasColspan = /colspan\s*=\s*["']\d+["']/.test(trHtml);
    const absentText = cellText(cells.length > 1 ? cells[1][1] : "");
    const isAbsent = hasColspan && cells.length <= 3 && /결\s*장/.test(absentText);

    if (isAbsent) {
      // 결장 선수: 기수/나이, 사진만 파싱하고 나머지는 빈 값
      const genAgeMatch = cell0.match(/(\d+)기\s*\/?\s*(\d+)세/);
      const generation = genAgeMatch ? parseInt(genAgeMatch[1]) : 0;
      const age = genAgeMatch ? parseInt(genAgeMatch[2]) : 0;
      const photoMatch = cell0.match(/<img[^>]*src=["']([^"']+)["']/);
      const photoUrl = photoMatch ? photoMatch[1] : "";

      entries.push({
        backNo, racerId, generation, age, photoUrl, isAbsent: true,
        winRateVenue: 0, top2RateVenue: 0, top3RateVenue: 0,
        winRateTotal: 0, top2RateTotal: 0, top3RateTotal: 0,
        place1st: 0, place2nd: 0, place3rd: 0,
        tacticPreemptTotal: "", tacticPushTotal: "", tacticChaseTotal: "", tacticMarkTotal: "",
        tacticPreemptRound: "", tacticPushRound: "", tacticChaseRound: "", tacticMarkRound: "",
        gradeAdjust: "", recent3ScoreVenue: "", recent3ScoreTotal: "", performanceRank: "",
      });
      continue;
    }

    // 정상 출전 선수: 기존 파싱 로직
    if (cells.length < 10) continue;

    // 기수/나이: "10기/32세"
    const genAgeMatch = cell0.match(/(\d+)기\s*\/?\s*(\d+)세/);
    const generation = genAgeMatch ? parseInt(genAgeMatch[1]) : 0;
    const age = genAgeMatch ? parseInt(genAgeMatch[2]) : 0;

    // 사진 URL
    const photoMatch = cell0.match(/<img[^>]*src=["']([^"']+)["']/);
    const photoUrl = photoMatch ? photoMatch[1] : "";

    // Cell 4-6: 승률/연대율/삼연대율 (광명/종합 구분)
    // 셀 구조에 따라 위치가 다를 수 있으므로 유연하게 처리
    const ct = (idx: number) => cellText(cells[idx]?.[1] || "");

    // 셀들의 숫자 값 추출
    const winRateVenue = safeNum(ct(4));
    const top2RateVenue = safeNum(ct(5));
    const top3RateVenue = safeNum(ct(6));

    // Cell 7: 입상횟수 "1-2-3" 형태
    const placeText = ct(7);
    const placeMatch = placeText.match(/(\d+)\D+(\d+)\D+(\d+)/);
    const place1st = placeMatch ? parseInt(placeMatch[1]) : 0;
    const place2nd = placeMatch ? parseInt(placeMatch[2]) : 0;
    const place3rd = placeMatch ? parseInt(placeMatch[3]) : 0;

    // Cell 8-11: 전법별 성적 (종합/당회)
    const tacticPreemptTotal = ct(8);
    const tacticPushTotal = ct(9);
    const tacticChaseTotal = ct(10);
    const tacticMarkTotal = ct(11);

    // 당회 전법 (동일 셀 내에 종합/당회 구분 또는 별도 컬럼)
    // 일단 원문 텍스트로 저장
    const tacticPreemptRound = "";
    const tacticPushRound = "";
    const tacticChaseRound = "";
    const tacticMarkRound = "";

    // Cell 12: 등급조정
    const gradeAdjust = ct(12);

    // Cell 13: 최근3회 득점
    const recent3 = ct(13);
    // 광명/종합 구분 시도
    const r3Parts = recent3.split(/[\/\s]+/);
    const recent3ScoreVenue = r3Parts[0] || recent3;
    const recent3ScoreTotal = r3Parts[1] || "";

    // Cell 14: 성적순위
    const performanceRank = ct(14);

    // 종합 승률 (별도 행이 있을 수 있음)
    const winRateTotal = 0;
    const top2RateTotal = 0;
    const top3RateTotal = 0;

    entries.push({
      backNo,
      racerId,
      generation,
      age,
      photoUrl,
      isAbsent: false,
      winRateVenue,
      top2RateVenue,
      top3RateVenue,
      winRateTotal,
      top2RateTotal,
      top3RateTotal,
      place1st,
      place2nd,
      place3rd,
      tacticPreemptTotal,
      tacticPushTotal,
      tacticChaseTotal,
      tacticMarkTotal,
      tacticPreemptRound,
      tacticPushRound,
      tacticChaseRound,
      tacticMarkRound,
      gradeAdjust,
      recent3ScoreVenue,
      recent3ScoreTotal,
      performanceRank,
    });
  }

  return entries;
}

// Table 2: 최근성적 파싱
function parseRecentPerformance(tableHtml: string): RecentPerformance[] {
  const results: RecentPerformance[] = [];
  const rows = extractTableRows(tableHtml);

  for (const cells of rows) {
    if (cells.length < 5) continue;
    const text0 = cellText(cells[0]);
    const backNoMatch = text0.match(/^(\d)/);
    if (!backNoMatch) continue;

    results.push({
      backNo: parseInt(backNoMatch[1]),
      cells: cells.map(c => cellText(c)),
    });
  }

  return results;
}

// Table 3: 상대전적 파싱
function parseHeadToHead(tableHtml: string): HeadToHead[] {
  const results: HeadToHead[] = [];
  const rows = extractTableRows(tableHtml);

  for (const cells of rows) {
    if (cells.length < 15) continue;
    const text0 = cellText(cells[0]);
    const backNoMatch = text0.match(/^(\d)/);
    if (!backNoMatch) continue;

    results.push({
      backNo: parseInt(backNoMatch[1]),
      vsRecord: cells.slice(1, 8).map(c => cellText(c)),
      coPlaceRecord: cells.slice(8, 15).map(c => cellText(c)),
      violation2ago: cellText(cells[15] || ""),
      violation1ago: cellText(cells[16] || ""),
      violationCurrent: cellText(cells[17] || ""),
      violationRemain: cellText(cells[18] || ""),
    });
  }

  return results;
}

// 경주 섹션 내 모든 테이블 파싱
function parseRaceSection(sectionHtml: string, raceNo: number, startTime: string, laps: string, raceType: string): RaceDecisionCard {
  const tables = [...sectionHtml.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];

  let entries: RacerEntry[] = [];
  let recentPerformance: RecentPerformance[] = [];
  let headToHead: HeadToHead[] = [];

  // 테이블 순서: [0]선수정보, [1]상담(skip), [2]최근성적, [3]상대전적
  if (tables.length >= 1) {
    entries = parseEntryTable(tables[0][1]);
  }
  if (tables.length >= 3) {
    recentPerformance = parseRecentPerformance(tables[2][1]);
  }
  if (tables.length >= 4) {
    headToHead = parseHeadToHead(tables[3][1]);
  }

  return {
    raceNo,
    startTime,
    laps,
    raceType,
    entries,
    recentPerformance,
    headToHead,
  };
}

// 전체 페이지 파싱
function parsePage(html: string, year: number, round: number, day: number, date: string): PageDecisionCard {
  const sections = splitRaceSections(html);

  // 광명 경주만 필터
  const gmSections = sections.filter(s => s.venue === "광명");

  const races: RaceDecisionCard[] = [];
  for (const section of gmSections) {
    const race = parseRaceSection(
      section.sectionHtml,
      section.raceNo,
      section.startTime,
      section.laps,
      section.raceType,
    );
    races.push(race);
  }

  return { year, round, day, date, races };
}

// --- 페이지 검증: <select> 값 확인 ---
function validatePage(html: string, expectedRound: number, expectedDay: number): boolean {
  // <select> 에서 선택된 회차/일차 확인
  const roundSelect = html.match(/name="round"[\s\S]*?<option[^>]*selected[^>]*>(\d+)/);
  const daySelect = html.match(/name="day"[\s\S]*?<option[^>]*selected[^>]*>(\d+)/);

  if (roundSelect && parseInt(roundSelect[1]) !== expectedRound) return false;
  if (daySelect && parseInt(daySelect[1]) !== expectedDay) return false;
  return true;
}

// --- Fetch ---
async function fetchDecisionPage(year: number, round: number, day: number): Promise<string> {
  const url = `https://www.kcycle.or.kr/race/card/decision/${year}/${round}/${day}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// --- Checkpoint ---
function getCheckpointPath(year: number): string {
  return path.join(YEARLY_DIR, `${year}.json`);
}

function getProgressPath(year: number): string {
  return path.join(YEARLY_DIR, `${year}.progress.json`);
}

function isYearDone(year: number): boolean {
  return fs.existsSync(getCheckpointPath(year)) && !fs.existsSync(getProgressPath(year));
}

function saveCheckpoint(year: number, pages: PageDecisionCard[]): void {
  fs.writeFileSync(getCheckpointPath(year), JSON.stringify({ year, totalPages: pages.length, pages }, null, 2), "utf-8");
}

function loadCheckpoint(year: number): { year: number; totalPages: number; pages: PageDecisionCard[] } | null {
  const p = getCheckpointPath(year);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function saveProgress(year: number, lastIdx: number, pages: PageDecisionCard[]): void {
  fs.writeFileSync(
    getProgressPath(year),
    JSON.stringify({ lastIdx, pagesCount: pages.length }),
    "utf-8"
  );
  saveCheckpoint(year, pages);
}

function loadProgress(year: number): { lastIdx: number } | null {
  const p = getProgressPath(year);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function clearProgress(year: number): void {
  const p = getProgressPath(year);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// --- 단일 연도 수집 ---
async function fetchYear(year: number): Promise<PageDecisionCard[]> {
  const targets = loadPageTargets(year);
  if (targets.length === 0) {
    console.log(`  ${year}년: entry 데이터 없음`);
    return [];
  }

  console.log(`  총 ${targets.length}개 페이지 대상`);

  let startIdx = 0;
  let pages: PageDecisionCard[] = [];

  const progress = loadProgress(year);
  if (progress) {
    startIdx = progress.lastIdx + 1;
    const existing = loadCheckpoint(year);
    if (existing) pages = existing.pages;
    console.log(`  이전 진행 재개: ${startIdx}/${targets.length} (수집: ${pages.length}페이지)`);
  }

  let failCount = 0;

  for (let i = startIdx; i < targets.length; i++) {
    const target = targets[i];
    let success = false;

    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        const html = await fetchDecisionPage(year, target.round, target.day);

        // 검증: 잘못된 round/day는 최신 데이터를 반환하므로
        // 광명 경주가 있는지 확인
        const page = parsePage(html, year, target.round, target.day, target.date);
        success = true;
        failCount = 0;

        if (page.races.length > 0) {
          pages.push(page);
        }

        if ((i + 1) % 50 === 0 || i === targets.length - 1) {
          console.log(`  ${i + 1}/${targets.length}: 수집 ${pages.length}페이지`);
          saveProgress(year, i, pages);
        }

        await delay(DELAY_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_RETRIES - 1) {
          console.log(`  재시도 ${attempt + 1}/${MAX_RETRIES} (${target.round}회${target.day}일): ${msg}`);
          await delay((attempt + 1) * 3000);
        } else {
          console.error(`  ERROR ${target.round}회${target.day}일: ${msg}`);
          failCount++;
          if (failCount >= 10) {
            console.error(`  연속 ${failCount}회 실패, ${year}년 중단`);
            saveProgress(year, i, pages);
            return pages;
          }
        }
      }
    }
  }

  return pages;
}

// --- 병합 ---
function mergeAll(): void {
  console.log("\n=== 전체 병합 ===");
  const all: PageDecisionCard[] = [];
  for (const year of YEARS) {
    const data = loadCheckpoint(year);
    if (data && data.totalPages > 0) {
      all.push(...data.pages);
      console.log(`  ${year}년: ${data.totalPages}페이지`);
    }
  }

  all.sort((a, b) =>
    a.date.localeCompare(b.date) || a.round - b.round || a.day - b.day
  );

  const outPath = path.join(__dirname, "..", "src", "data", "decision-card-data.json");
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf-8");
  console.log(`\n총 ${all.length}페이지 저장: ${outPath}`);
}

// --- 메인 ---
async function main() {
  if (!fs.existsSync(YEARLY_DIR)) {
    fs.mkdirSync(YEARLY_DIR, { recursive: true });
  }

  // SEED_YEAR 환경변수: 특정 연도만 재수집 (기존 파일 삭제 후 재수집)
  const seedYear = parseInt(process.env.SEED_YEAR || "0", 10);

  if (seedYear > 0) {
    console.log(`확정출주표 ${seedYear}년 재수집 시작...\n`);
    // 기존 checkpoint 삭제하여 강제 재수집
    const cpPath = getCheckpointPath(seedYear);
    if (fs.existsSync(cpPath)) fs.unlinkSync(cpPath);
    const progPath = getProgressPath(seedYear);
    if (fs.existsSync(progPath)) fs.unlinkSync(progPath);

    console.log(`=== ${seedYear}년 ===`);
    const pages = await fetchYear(seedYear);
    saveCheckpoint(seedYear, pages);
    clearProgress(seedYear);
    console.log(`  ${seedYear}년 완료: ${pages.length}페이지\n`);
    console.log("\n=== 확정출주표 수집 완료 ===");
    return;
  }

  console.log("확정출주표 데이터 수집 시작...");
  console.log(`수집 범위: ${START_YEAR}~${END_YEAR}년, 대상: 광명\n`);

  const doneYears = YEARS.filter(isYearDone);
  const todoYears = YEARS.filter((y) => !isYearDone(y));

  if (doneYears.length > 0) {
    console.log(`수집 완료 (${doneYears.length}개): ${doneYears.join(", ")}`);
    console.log(`남은 연도 (${todoYears.length}개): ${todoYears.join(", ")}\n`);
  }

  for (const year of todoYears) {
    console.log(`=== ${year}년 ===`);
    const pages = await fetchYear(year);
    saveCheckpoint(year, pages);
    clearProgress(year);
    console.log(`  ${year}년 완료: ${pages.length}페이지\n`);
    await delay(DELAY_MS);
  }

  mergeAll();
  console.log("\n=== 확정출주표 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
