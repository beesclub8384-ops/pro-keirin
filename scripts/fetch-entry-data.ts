// ============================================================
// 출주표(확정출주표) 데이터 수집 스크립트 (전체 연도, 중단 재개 지원)
// 사용법: npm run fetch-entry
// data.go.kr "경륜-출주표" API (SRVC_OD_API_CRA_RACE_ORGAN)
// ============================================================

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface ApiEntryItem {
  row_num: number;
  stnd_yr: string;
  race_ymd: string;       // "2024.01.05"
  meet_nm: string;        // "광명  "
  week_tcnt: string;
  day_tcnt: string;
  race_no: string;
  back_no: string;         // 등번호
  color_nm: string;        // 색상
  racer_nm: string;        // 선수명
  racer_age: string;       // 나이
  racer_grd_cd: string;    // 등급 (선발, 우수, 특선)
  racer_grd_cur_cd: string; // 현재 등급코드 (B1 등)
  racer_grd_bef_cd: string; // 이전 등급코드
  trng_plc_nm: string;     // 훈련장
  gear_rate: string;       // 기어비
  race_len: string;        // 경주거리
  dptre_tm: string;        // 출발시간
  round_cnt: string;       // 회차
  period_no: string;       // 기간번호
  run_day_tcnt: string;    // 출주일수
  win_tot_tcnt: string;    // 우승총횟수
  win_rate: string;        // 우승률
  high_rate: string;       // 연대율
  high_3_rate: string;     // 3연대율
  tot_tms_avg_scr: string; // 통산 평균득점
  area_tms3_avg_scr: string; // 지역 최근3회 평균득점
  rec_200m_scr: string;    // 200m 기록
  pre_win_cnt: string;     // 선행 우승횟수
  mrk_win_cnt: string;     // 먹뻗 우승횟수
  brk_win_cnt: string;     // 역전 우승횟수
  pas_win_cnt: string;     // 추입 우승횟수
  // 최근 3경기 성적
  bf1_meet_nm_nm: string;  // 전 경기장
  bf1_day1_ymd: string;
  bf1_day1_rank: string;
  bf1_day2_rank: string;
  bf1_day3_rank: string;
  bf2_meet_nm: string;     // 전전 경기장
  bf2_day1_ymd: string;
  bf2_day1_rank: string;
  bf2_day2_rank: string;
  bf2_day3_rank: string;
  bf3_meet_nm: string;     // 전전전 경기장
  bf3_day1_ymd: string;
  bf3_day1_rank: string;
  bf3_day2_rank: string;
  bf3_day3_rank: string;
}

interface EntryRecord {
  date: string;           // YYYY-MM-DD
  venue: string;
  week: number;
  day: number;
  raceNo: number;
  backNo: number;         // 등번호
  color: string;
  racerName: string;
  racerAge: number;
  grade: string;          // 선발, 우수, 특선
  gradeCode: string;      // B1, A3 등
  gradePrev: string;      // 이전 등급
  training: string;       // 훈련장
  gearRate: number;
  raceLen: number;
  round: number;          // 회차
  runDays: number;        // 출주일수
  totalWins: number;
  winRate: number;
  top2Rate: number;
  top3Rate: number;
  avgScore: number;       // 통산 평균득점
  recentAvgScore: number; // 최근3회 평균득점
  rec200m: string;        // 200m 기록
  preWins: number;        // 선행
  mrkWins: number;        // 먹뻗
  brkWins: number;        // 역전
  pasWins: number;        // 추입
  recent: {
    meet1: string; date1: string; ranks1: string[];
    meet2: string; date2: string; ranks2: string[];
    meet3: string; date3: string; ranks3: string[];
  };
}

// --- 설정 ---
const SERVICE_KEY = process.env.DATA_GO_KR_API_KEY;
if (!SERVICE_KEY) {
  console.error("ERROR: DATA_GO_KR_API_KEY가 .env.local에 설정되지 않았습니다.");
  process.exit(1);
}

const API_BASE =
  "https://apis.data.go.kr/B551014/SRVC_OD_API_CRA_RACE_ORGAN/TODZ_API_CRA_RACE_ORGAN_I";

const START_YEAR = 2003;
const END_YEAR = 2026;
const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => String(START_YEAR + i));

const PAGE_SIZE = 100;
const DELAY_MS = 500;
const MAX_RETRIES = 3;
const YEARLY_DIR = path.join(__dirname, "..", "src", "data", "yearly-entry");

// --- 유틸 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeInt(val: string | undefined): number {
  if (!val) return 0;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

function safeFloat(val: string | undefined): number {
  if (!val) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : Math.round(n * 1000) / 1000;
}

function formatDate(ymd: string): string {
  // "2024.01.05" → "2024-01-05"
  return ymd.replace(/\./g, "-");
}

// --- 변환 ---
function toEntryRecord(item: ApiEntryItem): EntryRecord | null {
  const venue = (item.meet_nm || "").trim();
  if (venue !== "광명") return null;

  return {
    date: formatDate(item.race_ymd),
    venue,
    week: safeInt(item.week_tcnt),
    day: safeInt(item.day_tcnt),
    raceNo: safeInt(item.race_no),
    backNo: safeInt(item.back_no),
    color: (item.color_nm || "").trim(),
    racerName: (item.racer_nm || "").trim(),
    racerAge: safeInt(item.racer_age),
    grade: (item.racer_grd_cd || "").trim(),
    gradeCode: (item.racer_grd_cur_cd || "").trim(),
    gradePrev: (item.racer_grd_bef_cd || "").trim(),
    training: (item.trng_plc_nm || "").trim(),
    gearRate: safeFloat(item.gear_rate),
    raceLen: safeInt(item.race_len),
    round: safeInt(item.round_cnt),
    runDays: safeInt(item.run_day_tcnt),
    totalWins: safeInt(item.win_tot_tcnt),
    winRate: safeFloat(item.win_rate),
    top2Rate: safeFloat(item.high_rate),
    top3Rate: safeFloat(item.high_3_rate),
    avgScore: safeFloat(item.tot_tms_avg_scr),
    recentAvgScore: safeFloat(item.area_tms3_avg_scr),
    rec200m: (item.rec_200m_scr || "").trim(),
    preWins: safeInt(item.pre_win_cnt),
    mrkWins: safeInt(item.mrk_win_cnt),
    brkWins: safeInt(item.brk_win_cnt),
    pasWins: safeInt(item.pas_win_cnt),
    recent: {
      meet1: (item.bf1_meet_nm_nm || "").trim(),
      date1: (item.bf1_day1_ymd || "").trim(),
      ranks1: [item.bf1_day1_rank, item.bf1_day2_rank, item.bf1_day3_rank].map(s => (s || "").trim()),
      meet2: (item.bf2_meet_nm || "").trim(),
      date2: (item.bf2_day1_ymd || "").trim(),
      ranks2: [item.bf2_day1_rank, item.bf2_day2_rank, item.bf2_day3_rank].map(s => (s || "").trim()),
      meet3: (item.bf3_meet_nm || "").trim(),
      date3: (item.bf3_day1_ymd || "").trim(),
      ranks3: [item.bf3_day1_rank, item.bf3_day2_rank, item.bf3_day3_rank].map(s => (s || "").trim()),
    },
  };
}

// --- Checkpoint ---
function getCheckpointPath(year: string): string {
  return path.join(YEARLY_DIR, `${year}.json`);
}

function isYearDone(year: string): boolean {
  return fs.existsSync(getCheckpointPath(year));
}

function saveCheckpoint(year: string, records: EntryRecord[]): void {
  fs.writeFileSync(getCheckpointPath(year), JSON.stringify(records, null, 2), "utf-8");
}

function loadCheckpoint(year: string): EntryRecord[] {
  const p = getCheckpointPath(year);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// --- API 호출 ---
interface ApiResponse {
  response: {
    header: { resultCode: string; resultMsg: string };
    body: {
      items: { item: ApiEntryItem | ApiEntryItem[] };
      totalCount: number;
      pageNo: number;
      numOfRows: number;
    };
  };
}

async function fetchPage(year: string, pageNo: number): Promise<{ items: ApiEntryItem[]; totalCount: number }> {
  const url = `${API_BASE}?serviceKey=${SERVICE_KEY}&resultType=json&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&stnd_yr=${year}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: ApiResponse = await res.json();
  if (data.response.header.resultCode !== "00") {
    return { items: [], totalCount: 0 };
  }
  const items = data.response.body?.items?.item;
  if (!items) return { items: [], totalCount: data.response.body.totalCount };
  const arr = Array.isArray(items) ? items : [items];
  return { items: arr, totalCount: data.response.body.totalCount };
}

// --- 단일 연도 수집 ---
async function fetchYear(year: string): Promise<EntryRecord[]> {
  const records: EntryRecord[] = [];
  let pageNo = 1;
  let totalCount = 0;
  let fetched = 0;

  while (true) {
    let success = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        const result = await fetchPage(year, pageNo);
        success = true;

        if (pageNo === 1) {
          totalCount = result.totalCount;
          if (totalCount === 0) {
            console.log(`  ${year}년: 데이터 없음`);
            return [];
          }
          console.log(`  API 총 ${totalCount}건`);
        }

        if (result.items.length === 0) break;

        for (const item of result.items) {
          const record = toEntryRecord(item);
          if (record) records.push(record);
        }

        fetched += result.items.length;
        if (pageNo % 10 === 0 || fetched >= totalCount) {
          console.log(`  페이지 ${pageNo}: ${fetched}/${totalCount}, 광명 ${records.length}건`);
        }

        if (fetched >= totalCount) break;
        pageNo++;
        await delay(DELAY_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("429") && attempt < MAX_RETRIES - 1) {
          const backoff = (attempt + 1) * 5000;
          console.log(`  429 rate limit, ${backoff}ms 대기...`);
          await delay(backoff);
        } else {
          console.error(`  ERROR 페이지 ${pageNo}: ${msg}`);
          success = true;
          pageNo++;
          await delay(2000);
        }
      }
    }
    if (fetched >= totalCount || !success) break;
  }

  return records;
}

// --- 병합 ---
function mergeAll(): void {
  console.log("\n=== 전체 병합 ===");
  const all: EntryRecord[] = [];
  for (const year of YEARS) {
    const records = loadCheckpoint(year);
    if (records.length > 0) {
      all.push(...records);
      console.log(`  ${year}년: ${records.length}건`);
    }
  }
  all.sort((a, b) => a.date.localeCompare(b.date) || a.raceNo - b.raceNo || a.backNo - b.backNo);

  const outPath = path.join(__dirname, "..", "src", "data", "entry-data.json");
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf-8");
  console.log(`\n총 ${all.length}건 저장: ${outPath}`);
}

// --- 메인 ---
async function main() {
  if (!fs.existsSync(YEARLY_DIR)) {
    fs.mkdirSync(YEARLY_DIR, { recursive: true });
  }

  console.log("출주표 데이터 수집 시작...");
  console.log(`수집 범위: ${START_YEAR}~${END_YEAR}년, 대상: 광명\n`);

  const doneYears = YEARS.filter(isYearDone);
  const todoYears = YEARS.filter((y) => !isYearDone(y));

  if (doneYears.length > 0) {
    console.log(`수집 완료 (${doneYears.length}개): ${doneYears.join(", ")}`);
    console.log(`남은 연도 (${todoYears.length}개): ${todoYears.join(", ")}\n`);
  }

  for (const year of todoYears) {
    console.log(`=== ${year}년 ===`);
    const records = await fetchYear(year);
    saveCheckpoint(year, records);
    console.log(`  ${year}년 완료: ${records.length}건\n`);
  }

  mergeAll();
  console.log("\n=== 출주표 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
