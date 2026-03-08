// ============================================================
// 경주결과 상세 데이터 수집 스크립트 (전체 연도, 중단 재개 지원)
// 사용법: npm run fetch-race-detail
//         npm run fetch-race-detail -- --date 2026-03-07
//         npm run fetch-race-detail -- --date today
// kcycle.or.kr HTML 스크래핑
// 환경(날씨/풍향/풍속), 선수별(착차/주행시간/승부수), 위반 데이터
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

// --- CLI: --date 옵션 파싱 ---
function parseDateArg(): string | null {
  const idx = process.argv.indexOf("--date");
  if (idx === -1) return null;
  const val = process.argv[idx + 1];
  if (!val) { console.error("ERROR: --date 값이 필요합니다 (YYYY-MM-DD 또는 today)"); process.exit(1); }
  if (val === "today") {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    return kst.toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) { console.error("ERROR: 날짜 형식이 잘못됨:", val); process.exit(1); }
  return val;
}

const TARGET_DATE = parseDateArg();

// --- 타입 ---
interface RaceEnvironment {
  time: string;        // 경주 시간 (12:54)
  weather: string;     // 날씨
  windDir: string;     // 풍향
  windSpeed: string;   // 풍속
  temp: string;        // 기온 (17℃)
  humidity: string;    // 습도 (35%)
  rainfall: string;    // 우량
  record200m: string;  // 200M (12"16)
  lastLap: string;     // 최종주회 (19"97)
}

interface RacerResult {
  backNo: number;      // 등번호
  name: string;        // 선수명
  rank: number;        // 순위
  gap: string;         // 착차 (-, 1/2B, 9B 등)
  raceTime: string;    // 주행시간 (2:31:6220)
  tactic: string;      // 승부수 (선행, 마크, 추입 등)
  disqualified: string; // 실격
  warning: string;     // 경고
  caution: string;     // 주의
  withdrawal: string;  // 기권구분
  finish: string;      // 골인구분
  record200m: string;  // 200M 기록
  speed200m: number;   // 200M 평균시속
}

interface Violation {
  backNo: number;
  name: string;
  timing: string;      // 위반시기
  location: string;    // 위반장소
  article: string;     // 저촉조
  paragraph: string;   // 저촉항
  clause: string;      // 저촉호
  judgment: string;    // 판정구분
}

interface RaceDetail {
  year: number;
  round: number;       // 회차 (kcycle)
  day: number;         // 일차
  raceNo: number;      // 경주번호
  date: string;        // YYYY-MM-DD (entry data에서)
  environment: RaceEnvironment;
  results: RacerResult[];
  violations: Violation[];
}

interface YearRaceDetail {
  year: number;
  totalRaces: number;
  races: RaceDetail[];
}

// --- 설정 ---
const START_YEAR = 2003;
const END_YEAR = 2026;
const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

const DELAY_MS = 500;
const MAX_RETRIES = 3;
const YEARLY_DIR = path.join(__dirname, "..", "src", "data", "yearly-race-detail");
const ENTRY_DIR = path.join(__dirname, "..", "src", "data", "yearly-entry");

// --- 유틸 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// --- Entry 데이터에서 경주 목록 추출 ---
interface RaceTarget {
  round: number;  // week from entry = kcycle round
  day: number;
  raceNo: number;
  date: string;
}

function loadRaceTargets(year: number, filterDate?: string | null): RaceTarget[] {
  const entryPath = path.join(ENTRY_DIR, `${year}.json`);
  if (!fs.existsSync(entryPath)) {
    console.log(`  WARNING: ${entryPath} 없음`);
    return [];
  }

  const entries = JSON.parse(fs.readFileSync(entryPath, "utf-8"));
  const seen = new Map<string, RaceTarget>();

  for (const e of entries) {
    if (filterDate && e.date !== filterDate) continue;
    const key = `${e.week}-${e.day}-${e.raceNo}`;
    if (!seen.has(key)) {
      seen.set(key, {
        round: e.week,
        day: e.day,
        raceNo: e.raceNo,
        date: e.date,
      });
    }
  }

  const targets = [...seen.values()];
  targets.sort((a, b) =>
    a.round - b.round || a.day - b.day || a.raceNo - b.raceNo
  );

  return targets;
}

// --- HTML 파싱 ---
function parseRaceDetail(html: string, year: number, round: number, dayNum: number, raceNo: number, date: string): RaceDetail | null {
  // 환경 데이터 파싱
  const envMatch = html.match(
    /시간[\s\S]*?날씨[\s\S]*?풍향[\s\S]*?풍속[\s\S]*?기온[\s\S]*?습도[\s\S]*?우량[\s\S]*?200M[\s\S]*?최종주회([\s\S]{0,800})/
  );

  let environment: RaceEnvironment = {
    time: "", weather: "", windDir: "", windSpeed: "",
    temp: "", humidity: "", rainfall: "", record200m: "", lastLap: "",
  };

  if (envMatch) {
    const cells = [...envMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map(m => decodeHtmlEntities(m[1].replace(/<[^>]*>/g, "").trim()));

    if (cells.length >= 9) {
      environment = {
        time: cells[0],
        weather: cells[1],
        windDir: cells[2],
        windSpeed: cells[3],
        temp: cells[4],
        humidity: cells[5],
        rainfall: cells[6],
        record200m: cells[7],
        lastLap: cells[8],
      };
    }
  }

  // 선수 결과 파싱 - 선수명 헤더 이후 tbody 찾기
  const results: RacerResult[] = [];
  const racerIdx = html.indexOf("선수명");
  if (racerIdx > -1) {
    const afterRacer = html.substring(racerIdx);
    const tbodyMatch = afterRacer.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (tbodyMatch) {
      const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      for (const tr of trs) {
        const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
          .map(m => decodeHtmlEntities(m[1].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " "));

        if (cells.length < 12) continue;

        // Cell 0: "1 김영석" or "1\n김영석"
        const nameCell = cells[0];
        const nameMatch = nameCell.match(/^(\d+)\s+(.+)/);
        if (!nameMatch) continue;

        results.push({
          backNo: parseInt(nameMatch[1]),
          name: nameMatch[2].trim(),
          rank: parseInt(cells[1]) || 0,
          gap: cells[2] || "-",
          raceTime: cells[3] || "",
          tactic: cells[4] || "",
          disqualified: cells[5] || "-",
          warning: cells[6] || "-",
          caution: cells[7] || "-",
          withdrawal: cells[8] || "-",
          finish: cells[9] || "-",
          record200m: cells[10] || "",
          speed200m: parseFloat(cells[11]) || 0,
        });
      }
    }
  }

  // 위반 데이터 파싱
  const violations: Violation[] = [];
  const violationIdx = html.indexOf("위반시기");
  if (violationIdx > -1) {
    const afterViolation = html.substring(violationIdx);
    const tbodyMatch = afterViolation.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (tbodyMatch) {
      const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      for (const tr of trs) {
        const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
          .map(m => decodeHtmlEntities(m[1].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " "));

        if (cells.length < 7) continue;

        // Cell 0: "6 허남열"
        const vNameMatch = cells[0].match(/^(\d+)\s+(.+)/);
        if (!vNameMatch) continue;

        violations.push({
          backNo: parseInt(vNameMatch[1]),
          name: vNameMatch[2].trim(),
          timing: cells[1] || "",
          location: cells[2] || "",
          article: cells[3] || "",
          paragraph: cells[4] || "",
          clause: cells[5] || "",
          judgment: cells[6] || "",
        });
      }
    }
  }

  // 데이터가 아예 없으면 null (해당 경주가 없는 경우)
  if (results.length === 0 && !envMatch) return null;

  return {
    year,
    round,
    day: dayNum,
    raceNo,
    date,
    environment,
    results,
    violations,
  };
}

// --- Fetch ---
async function fetchRaceDetailPage(year: number, round: number, day: number, raceNo: number): Promise<string> {
  const paddedRaceNo = String(raceNo).padStart(2, "0");
  const url = `https://www.kcycle.or.kr/race/result/general/${year}/${round}/${day}/001/${paddedRaceNo}`;
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
  const cp = getCheckpointPath(year);
  const prog = getProgressPath(year);
  // 완료 파일이 있고, progress 파일이 없으면 완료
  return fs.existsSync(cp) && !fs.existsSync(prog);
}

function saveCheckpoint(year: number, data: YearRaceDetail): void {
  fs.writeFileSync(getCheckpointPath(year), JSON.stringify(data, null, 2), "utf-8");
}

function loadCheckpoint(year: number): YearRaceDetail | null {
  const p = getCheckpointPath(year);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// Progress: 수집 중간 상태 저장 (마지막으로 처리한 인덱스)
function saveProgress(year: number, lastIdx: number, races: RaceDetail[]): void {
  fs.writeFileSync(
    getProgressPath(year),
    JSON.stringify({ lastIdx, racesCount: races.length }),
    "utf-8"
  );
  // 중간 결과도 checkpoint에 저장
  saveCheckpoint(year, { year, totalRaces: races.length, races });
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
async function fetchYear(year: number, filterDate?: string | null, preloadedTargets?: RaceTarget[]): Promise<YearRaceDetail> {
  const targets = preloadedTargets || loadRaceTargets(year, filterDate);
  if (targets.length === 0) {
    console.log(`  ${year}년: entry 데이터 없음`);
    return { year, totalRaces: 0, races: [] };
  }

  console.log(`  총 ${targets.length}개 경주 대상`);

  // 이전 진행 상태 확인
  let startIdx = 0;
  let races: RaceDetail[] = [];

  const progress = loadProgress(year);
  if (progress) {
    startIdx = progress.lastIdx + 1;
    const existing = loadCheckpoint(year);
    if (existing) {
      races = existing.races;
    }
    console.log(`  이전 진행 재개: ${startIdx}/${targets.length} (수집됨: ${races.length}건)`);
  }

  let failCount = 0;

  for (let i = startIdx; i < targets.length; i++) {
    const target = targets[i];
    let success = false;

    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        const html = await fetchRaceDetailPage(year, target.round, target.day, target.raceNo);
        const detail = parseRaceDetail(html, year, target.round, target.day, target.raceNo, target.date);
        success = true;
        failCount = 0;

        if (detail) {
          races.push(detail);
        }

        // 진행 상태 로그
        if ((i + 1) % 50 === 0 || i === targets.length - 1) {
          console.log(`  ${i + 1}/${targets.length}: 수집 ${races.length}건`);
          saveProgress(year, i, races);
        }

        await delay(DELAY_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_RETRIES - 1) {
          console.log(`  재시도 ${attempt + 1}/${MAX_RETRIES} (${target.round}회${target.day}일 ${target.raceNo}R): ${msg}`);
          await delay((attempt + 1) * 3000);
        } else {
          console.error(`  ERROR ${target.round}회${target.day}일 ${target.raceNo}R: ${msg}`);
          failCount++;
          // 연속 10회 실패 시 중단
          if (failCount >= 10) {
            console.error(`  연속 ${failCount}회 실패, ${year}년 중단`);
            saveProgress(year, i, races);
            return { year, totalRaces: races.length, races };
          }
        }
      }
    }
  }

  return { year, totalRaces: races.length, races };
}

// --- 병합 ---
function mergeAll(): void {
  console.log("\n=== 전체 병합 ===");
  const all: RaceDetail[] = [];
  for (const year of YEARS) {
    const data = loadCheckpoint(year);
    if (data && data.totalRaces > 0) {
      all.push(...data.races);
      console.log(`  ${year}년: ${data.totalRaces}건`);
    }
  }

  all.sort((a, b) =>
    a.date.localeCompare(b.date) || a.raceNo - b.raceNo
  );

  const outPath = path.join(__dirname, "..", "src", "data", "race-detail-data.json");
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf-8");
  console.log(`\n총 ${all.length}건 저장: ${outPath}`);
}

// --- 메인 ---
async function main() {
  if (!fs.existsSync(YEARLY_DIR)) {
    fs.mkdirSync(YEARLY_DIR, { recursive: true });
  }

  // --date 모드: 특정 날짜만 수집
  if (TARGET_DATE) {
    const year = parseInt(TARGET_DATE.slice(0, 4), 10);
    console.log(`경주결과 상세 수집 (단일 날짜): ${TARGET_DATE}`);

    // 1. 로컬 entry 파일에서 round/day 조회 시도
    let targets = loadRaceTargets(year, TARGET_DATE);

    // 2. 로컬에 없으면 Supabase decision_card_pages에서 조회
    if (targets.length === 0) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        console.log(`  로컬 entry 없음 → Supabase에서 round/day 조회`);
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: dcPage } = await supabase
          .from("decision_card_pages")
          .select("round, day")
          .eq("date", TARGET_DATE)
          .single();

        if (dcPage) {
          const { round, day: dayNum } = dcPage;
          console.log(`  ${year}년 ${round}회차 ${dayNum}일차`);

          // kcycle 요약 페이지에서 경주 수 파악
          let totalRaces = 16;
          try {
            const summaryUrl = `https://www.kcycle.or.kr/race/result/general/popup/txt/${year}/${round}/${dayNum}`;
            const summaryRes = await fetch(summaryUrl);
            if (summaryRes.ok) {
              const summaryHtml = await summaryRes.text();
              const matches = summaryHtml.match(/(광명)\s+(\d+)\s*경주/g);
              if (matches && matches.length > 0) totalRaces = matches.length;
            }
          } catch { /* 실패 시 기본 16 */ }
          console.log(`  경주 수: ${totalRaces}`);

          for (let raceNo = 1; raceNo <= totalRaces; raceNo++) {
            targets.push({ round, day: dayNum, raceNo, date: TARGET_DATE });
          }
        }
      }
    }

    if (targets.length === 0) {
      console.log(`  ${TARGET_DATE}: 해당 날짜에 경주 없음 (entry/Supabase 데이터 미존재)`);
      return;
    }
    console.log(`  ${targets.length}개 경주 대상\n`);

    // 기존 연도 데이터 로드 후 해당 날짜 데이터 교체
    const existing = loadCheckpoint(year);
    const prevRaces = existing ? existing.races.filter(r => r.date !== TARGET_DATE) : [];

    const newData = await fetchYear(year, TARGET_DATE, targets);
    const merged = [...prevRaces, ...newData.races];
    merged.sort((a, b) => a.date.localeCompare(b.date) || a.raceNo - b.raceNo);

    saveCheckpoint(year, { year, totalRaces: merged.length, races: merged });
    console.log(`\n  ${TARGET_DATE}: ${newData.totalRaces}건 수집, 연도 합계: ${merged.length}건`);

    mergeAll();
    console.log("\n=== 단일 날짜 수집 완료 ===");
    return;
  }

  // 전체 모드
  console.log("경주결과 상세 데이터 수집 시작...");
  console.log(`수집 범위: ${START_YEAR}~${END_YEAR}년, 대상: 광명\n`);

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
    clearProgress(year);
    console.log(`  ${year}년 완료: ${data.totalRaces}건\n`);
    await delay(DELAY_MS);
  }

  mergeAll();
  console.log("\n=== 경주결과 상세 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
