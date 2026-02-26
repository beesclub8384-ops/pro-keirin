// ============================================================
// 경륜 경주결과 데이터 수집 스크립트
// 사용법: npm run fetch-data
// ============================================================
// 페이지네이션으로 연도별 전체 데이터를 가져옵니다.
// ============================================================

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { fetchRaceResultsPage, type ApiRaceResult } from "../src/lib/keirin-api";

// --- 타입 (odds-data.ts의 RaceOddsRecord와 동일) ---
type GradeGroup = "특선" | "우수" | "선발";
type Venue = "광명" | "부산" | "창원";

interface RaceOddsRecord {
  id: number;
  date: string;
  venue: Venue;
  gradeGroup: GradeGroup;
  grade: string;
  raceNo: number;
  odds: {
    단승: number;
    연승: number;
    쌍승: number;
    복승: number;
    삼쌍승: number;
  };
}

// --- 설정 ---
const SERVICE_KEY = process.env.DATA_GO_KR_API_KEY;
if (!SERVICE_KEY) {
  console.error("ERROR: DATA_GO_KR_API_KEY가 .env.local에 설정되지 않았습니다.");
  process.exit(1);
}

const YEARS = ["2024"];
const PAGE_SIZE = 100;
const DELAY_MS = 500;
const MAX_RETRIES = 3;
const VALID_VENUES: Venue[] = ["광명", "부산", "창원"];

// --- 등급 추론 (경주번호 기반) ---
function inferGrade(raceNo: number): { gradeGroup: GradeGroup; grade: string } {
  if (raceNo >= 10) {
    const grades = ["SS", "S1", "S2", "S3"];
    return { gradeGroup: "특선", grade: grades[raceNo - 10] || "S1" };
  }
  if (raceNo >= 5) {
    const grades = ["A1", "A2", "A3"];
    return { gradeGroup: "우수", grade: grades[raceNo - 5] || "A1" };
  }
  const grades = ["B1", "B2", "B3"];
  return { gradeGroup: "선발", grade: grades[raceNo - 1] || "B1" };
}

// --- 배당 파싱: "(번호)배당값" → 숫자만 추출 ---
function parsePoolVal(val: string | undefined): number {
  if (!val || val.trim() === "") return 0;
  // "(1)1.4" → "1.4", "(1-3)19.3" → "19.3"
  // 연승은 "(1)1.1 (3)6.0" 형식 → 첫 번째 값만
  const match = val.match(/\)\s*([\d.]+)/);
  if (!match) return 0;
  const n = parseFloat(match[1]);
  return isNaN(n) ? 0 : Math.round(n * 10) / 10;
}

// --- 날짜 변환: 연도 + MMDD → YYYY-MM-DD ---
function formatDate(year: string, mmdd: string): string {
  const padded = mmdd.padStart(4, "0");
  return `${year}-${padded.substring(0, 2)}-${padded.substring(2, 4)}`;
}

// --- API 결과 → RaceOddsRecord 변환 ---
function toRaceRecord(
  item: ApiRaceResult,
  id: number
): RaceOddsRecord | null {
  const raceNo = parseInt(item.race_no, 10);
  if (isNaN(raceNo)) return null;

  const venue = item.meet_nm as Venue;
  if (!VALID_VENUES.includes(venue)) return null;

  const { gradeGroup, grade } = inferGrade(raceNo);

  const odds = {
    단승: parsePoolVal(item.pool1_val),
    연승: parsePoolVal(item.pool2_val),
    쌍승: parsePoolVal(item.pool4_val),
    복승: parsePoolVal(item.pool5_val),
    삼쌍승: parsePoolVal(item.pool8_val),
  };

  // 모든 배당이 0이면 취소된 경주
  if (Object.values(odds).every((v) => v === 0)) return null;

  return {
    id,
    date: formatDate(item.stnd_yr || "2024", item.race_ymd),
    venue,
    gradeGroup,
    grade,
    raceNo,
    odds,
  };
}

// --- 딜레이 유틸 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- 메인 ---
async function main() {
  const records: RaceOddsRecord[] = [];
  let nextId = 1;

  console.log("경륜 경주결과 데이터 수집 시작...");
  console.log(`수집 연도: ${YEARS.join(", ")}`);
  console.log(`페이지 크기: ${PAGE_SIZE}\n`);

  for (const year of YEARS) {
    console.log(`=== ${year}년 데이터 수집 ===`);

    let pageNo = 1;
    let totalCount = 0;
    let fetched = 0;

    while (true) {
      let success = false;

      for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
        try {
          const result = await fetchRaceResultsPage({
            serviceKey: SERVICE_KEY,
            stnd_yr: year,
            pageNo,
            numOfRows: PAGE_SIZE,
          });

          success = true;

          if (pageNo === 1) {
            totalCount = result.totalCount;
            console.log(`  총 ${totalCount}건 발견`);
          }

          if (result.items.length === 0) break;

          for (const item of result.items) {
            const record = toRaceRecord(item, nextId);
            if (record) {
              records.push(record);
              nextId++;
            }
          }

          fetched += result.items.length;
          console.log(`  페이지 ${pageNo}: ${result.items.length}건 (누적 ${fetched}/${totalCount})`);

          if (fetched >= totalCount) break;
          pageNo++;

          await delay(DELAY_MS);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("429") && attempt < MAX_RETRIES - 1) {
            const backoff = (attempt + 1) * 5000;
            console.log(`  429 rate limit, ${backoff}ms 대기 후 재시도... (${attempt + 1}/${MAX_RETRIES})`);
            await delay(backoff);
          } else {
            console.error(`  ERROR 페이지 ${pageNo}: ${msg}`);
            success = true; // 에러 발생해도 다음 페이지로
            pageNo++;
            await delay(2000);
          }
        }
      }

      if (fetched >= totalCount || !success) break;
    }

    console.log(`  ${year}년 수집 완료: ${records.length}건\n`);
  }

  console.log(`=== 전체 수집 완료 ===`);
  console.log(`총 수집: ${records.length}건`);

  // 날짜 순으로 정렬
  records.sort((a, b) => a.date.localeCompare(b.date) || a.raceNo - b.raceNo);

  // ID 재할당
  records.forEach((r, i) => (r.id = i + 1));

  // JSON 파일로 저장
  const outPath = path.join(__dirname, "..", "src", "data", "race-data.json");
  fs.writeFileSync(outPath, JSON.stringify(records, null, 2), "utf-8");
  console.log(`저장 완료: ${outPath}`);
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
