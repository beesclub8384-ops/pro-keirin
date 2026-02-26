// ============================================================
// 출주표 API에서 등급 데이터 수집 → race-data.json 업데이트
// ============================================================

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";

const API_BASE =
  "https://apis.data.go.kr/B551014/SRVC_OD_API_CRA_RACE_ORGAN/TODZ_API_CRA_RACE_ORGAN_I";
const SERVICE_KEY = process.env.DATA_GO_KR_API_KEY!;
const PAGE_SIZE = 100;
const DELAY_MS = 500;
const MAX_RETRIES = 3;

// --- 타입 ---
interface EntryItem {
  race_ymd: string;      // "2024.01.05"
  meet_nm: string;       // "광명  "
  race_no: string;       // "01"
  racer_grd_cd: string;  // "선발", "우수", "특선" 등
}

interface ApiResponse {
  response: {
    header: { resultCode: string; resultMsg: string };
    body: {
      items: { item: EntryItem | EntryItem[] };
      totalCount: number;
      pageNo: number;
      numOfRows: number;
    };
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- 1단계: 출주표 API 전체 수집 ---
async function fetchAllEntries(): Promise<EntryItem[]> {
  const all: EntryItem[] = [];
  let pageNo = 1;
  let totalCount = 0;

  console.log("=== 1단계: 출주표 API 전체 데이터 수집 ===\n");

  while (true) {
    let success = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        const url = `${API_BASE}?serviceKey=${SERVICE_KEY}&resultType=json&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&stnd_yr=2024`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: ApiResponse = await res.json();

        if (data.response.header.resultCode !== "00") {
          throw new Error(data.response.header.resultMsg);
        }

        if (pageNo === 1) {
          totalCount = data.response.body.totalCount;
          console.log(`  총 ${totalCount}건 발견`);
        }

        const items = data.response.body?.items?.item;
        if (!items) break;
        const arr = Array.isArray(items) ? items : [items];

        all.push(...arr);
        success = true;

        if (pageNo % 20 === 0 || all.length >= totalCount) {
          console.log(`  페이지 ${pageNo}: 누적 ${all.length}/${totalCount}건`);
        }

        if (all.length >= totalCount) break;
        pageNo++;
        await delay(DELAY_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("429") && attempt < MAX_RETRIES - 1) {
          console.log(`  429 rate limit, 재시도 ${attempt + 1}/${MAX_RETRIES}...`);
          await delay((attempt + 1) * 5000);
        } else {
          console.error(`  ERROR 페이지 ${pageNo}: ${msg}`);
          success = true;
          pageNo++;
          await delay(2000);
        }
      }
    }
    if (all.length >= totalCount) break;
  }

  console.log(`\n  수집 완료: ${all.length}건\n`);
  return all;
}

// --- 2단계: 경주별 등급 매핑 ---
function buildGradeMap(entries: EntryItem[]) {
  console.log("=== 2단계: 경주별 등급 매핑 테이블 생성 ===\n");

  // meet_nm에 어떤 값이 있는지
  const meetNames = new Set<string>();
  // racer_grd_cd에 어떤 값이 있는지
  const gradeCodes = new Set<string>();

  const gradeMap = new Map<string, string>(); // "YYYY-MM-DD|venue|raceNo" → gradeGroup

  for (const e of entries) {
    meetNames.add(e.meet_nm.trim());
    gradeCodes.add(e.racer_grd_cd);

    // 날짜 변환: "2024.01.05" → "2024-01-05"
    const date = e.race_ymd.replace(/\./g, "-");
    const venue = e.meet_nm.trim();
    const raceNo = parseInt(e.race_no, 10);
    const key = `${date}|${venue}|${raceNo}`;

    if (!gradeMap.has(key)) {
      gradeMap.set(key, e.racer_grd_cd);
    }
  }

  console.log(`  경륜장 목록: ${[...meetNames].join(", ")}`);
  console.log(`  등급 코드 목록: ${[...gradeCodes].join(", ")}`);
  console.log(`  경주별 매핑 수: ${gradeMap.size}건\n`);

  return gradeMap;
}

// --- 3단계: race-data.json 업데이트 ---
function updateRaceData(gradeMap: Map<string, string>) {
  console.log("=== 3단계: race-data.json 업데이트 ===\n");

  const jsonPath = path.join(__dirname, "..", "src", "data", "race-data.json");
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const records = JSON.parse(raw) as Array<{
    id: number;
    date: string;
    venue: string;
    gradeGroup: string;
    grade: string;
    raceNo: number;
    odds: Record<string, number>;
  }>;

  let matched = 0;
  let unmatched = 0;
  const unmatchedSamples: string[] = [];

  for (const r of records) {
    const key = `${r.date}|${r.venue}|${r.raceNo}`;
    const grade = gradeMap.get(key);

    if (grade) {
      r.gradeGroup = grade;
      matched++;
    } else {
      unmatched++;
      if (unmatchedSamples.length < 10) {
        unmatchedSamples.push(key);
      }
    }
  }

  fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2), "utf-8");

  console.log(`  매칭 성공: ${matched}건`);
  console.log(`  매칭 실패: ${unmatched}건`);
  if (unmatchedSamples.length > 0) {
    console.log(`  실패 샘플: ${unmatchedSamples.join(", ")}`);
  }
  console.log(`\n  저장 완료: ${jsonPath}`);
}

// --- 메인 ---
async function main() {
  const entries = await fetchAllEntries();
  const gradeMap = buildGradeMap(entries);
  updateRaceData(gradeMap);

  console.log("\n=== 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
