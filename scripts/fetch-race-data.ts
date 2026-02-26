// ============================================================
// 경륜 경주결과 데이터 수집 스크립트
// 사용법: npm run fetch-data
// ============================================================

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { fetchRaceResultsPage, type ApiRaceResult } from "../src/lib/keirin-api";

// --- 타입 ---
interface RaceOddsRecord {
  id: number;
  date: string;
  venue: string;
  gradeGroup: string;
  raceNo: number;
  odds: {
    단승: number;
    연승1착: number;
    연승2착: number;
    쌍승: number;
    복승: number;
    쌍복승: number;
    삼복승: number;
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

// --- 배당 파싱 ---
/** "(번호)배당값" → 숫자만 추출 (첫 번째 매치) */
function parsePoolVal(val: string | undefined): number {
  if (!val || val.trim() === "") return 0;
  const match = val.match(/\)\s*([\d.]+)/);
  if (!match) return 0;
  const n = parseFloat(match[1]);
  return isNaN(n) ? 0 : Math.round(n * 10) / 10;
}

/** 연승 파싱: "(1)1.1 (3)6.0" → [1.1, 6.0] */
function parseYeonseung(val: string | undefined): [number, number] {
  if (!val || val.trim() === "") return [0, 0];
  const matches = [...val.matchAll(/\)\s*([\d.]+)/g)];
  const first = matches[0] ? parseFloat(matches[0][1]) : 0;
  const second = matches[1] ? parseFloat(matches[1][1]) : 0;
  return [
    isNaN(first) ? 0 : Math.round(first * 10) / 10,
    isNaN(second) ? 0 : Math.round(second * 10) / 10,
  ];
}

// --- 날짜 변환 ---
function formatDate(year: string, mmdd: string): string {
  const padded = mmdd.padStart(4, "0");
  return `${year}-${padded.substring(0, 2)}-${padded.substring(2, 4)}`;
}

// --- API 결과 → RaceOddsRecord 변환 (광명만) ---
function toRaceRecord(item: ApiRaceResult, id: number): RaceOddsRecord | null {
  const raceNo = parseInt(item.race_no, 10);
  if (isNaN(raceNo)) return null;

  const venue = (item.meet_nm || "").trim();
  if (venue !== "광명") return null;

  const [yeonseung1, yeonseung2] = parseYeonseung(item.pool2_val);

  const odds = {
    단승: parsePoolVal(item.pool1_val),
    연승1착: yeonseung1,
    연승2착: yeonseung2,
    쌍승: parsePoolVal(item.pool4_val),
    복승: parsePoolVal(item.pool5_val),
    쌍복승: parsePoolVal(item.pool6_val),
    삼복승: parsePoolVal(item.pool7_val),
    삼쌍승: parsePoolVal(item.pool8_val),
  };

  // 모든 배당이 0이면 취소된 경주
  if (Object.values(odds).every((v) => v === 0)) return null;

  return {
    id,
    date: formatDate(item.stnd_yr || "2024", item.race_ymd),
    venue,
    gradeGroup: "", // 후속 스크립트(enrich-grade-data)에서 채움
    raceNo,
    odds,
  };
}

// --- 딜레이 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- 메인 ---
async function main() {
  const records: RaceOddsRecord[] = [];
  let nextId = 1;

  console.log("경륜 경주결과 데이터 수집 시작...");
  console.log(`수집 연도: ${YEARS.join(", ")}, 대상: 광명`);
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
            console.log(`  API 총 ${totalCount}건 (광명만 필터링)`);
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
          if (pageNo % 5 === 0 || fetched >= totalCount) {
            console.log(`  페이지 ${pageNo}: 누적 API ${fetched}/${totalCount}, 광명 ${records.length}건`);
          }

          if (fetched >= totalCount) break;
          pageNo++;
          await delay(DELAY_MS);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("429") && attempt < MAX_RETRIES - 1) {
            const backoff = (attempt + 1) * 5000;
            console.log(`  429 rate limit, ${backoff}ms 대기 후 재시도...`);
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

    console.log(`  ${year}년 완료: 광명 ${records.length}건\n`);
  }

  // 날짜 순 정렬 + ID 재할당
  records.sort((a, b) => a.date.localeCompare(b.date) || a.raceNo - b.raceNo);
  records.forEach((r, i) => (r.id = i + 1));

  // 저장
  const outPath = path.join(__dirname, "..", "src", "data", "race-data.json");
  fs.writeFileSync(outPath, JSON.stringify(records, null, 2), "utf-8");

  console.log(`=== 수집 완료 ===`);
  console.log(`총 ${records.length}건 저장: ${outPath}`);
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
