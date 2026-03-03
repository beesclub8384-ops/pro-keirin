// ============================================================
// race-data.json에 순위/착차 결과 추가 스크립트
// race-detail-data.json의 결과를 race-data.json에 병합
// 사용법: npm run enrich-results
// ============================================================

import * as fs from "fs";
import * as path from "path";

interface RaceOddsRecord {
  id: number;
  date: string;
  venue: string;
  gradeGroup: string;
  raceNo: number;
  odds: Record<string, number>;
  results?: {
    rank: number;
    backNo: number;
    name: string;
    gap: string;
    raceTime: string;
    tactic: string;
  }[];
}

interface RacerResult {
  backNo: number;
  name: string;
  rank: number;
  gap: string;
  raceTime: string;
  tactic: string;
  disqualified: string;
  warning: string;
  caution: string;
  withdrawal: string;
  finish: string;
  record200m: string;
  speed200m: number;
}

interface RaceDetail {
  year: number;
  round: number;
  day: number;
  raceNo: number;
  date: string;
  environment: Record<string, string>;
  results: RacerResult[];
  violations: unknown[];
}

function main() {
  const dataDir = path.join(__dirname, "..", "src", "data");

  // 1. race-data.json 로드
  const raceDataPath = path.join(dataDir, "race-data.json");
  const raceData: RaceOddsRecord[] = JSON.parse(
    fs.readFileSync(raceDataPath, "utf-8")
  );
  console.log(`race-data.json: ${raceData.length}건`);

  // 2. race-detail-data.json 로드 → (date, raceNo) 맵 생성
  const detailPath = path.join(dataDir, "race-detail-data.json");
  const detailData: RaceDetail[] = JSON.parse(
    fs.readFileSync(detailPath, "utf-8")
  );
  console.log(`race-detail-data.json: ${detailData.length}건`);

  const detailMap = new Map<string, RaceDetail>();
  for (const d of detailData) {
    const key = `${d.date}_${d.raceNo}`;
    detailMap.set(key, d);
  }

  // 3. 매칭 & 보강
  let matched = 0;
  let unmatched = 0;

  for (const race of raceData) {
    const key = `${race.date}_${race.raceNo}`;
    const detail = detailMap.get(key);

    if (detail && detail.results.length > 0) {
      // 순위별 정렬 (rank=0은 실격 등 → 맨 뒤로)
      const sorted = [...detail.results].sort((a, b) => {
        if (a.rank === 0 && b.rank === 0) return a.backNo - b.backNo;
        if (a.rank === 0) return 1;
        if (b.rank === 0) return -1;
        return a.rank - b.rank;
      });

      race.results = sorted.map((r) => ({
        rank: r.rank,
        backNo: r.backNo,
        name: r.name,
        gap: r.gap,
        raceTime: r.raceTime,
        tactic: r.tactic,
      }));
      matched++;
    } else {
      unmatched++;
    }
  }

  console.log(`\n매칭: ${matched}건, 미매칭: ${unmatched}건`);

  // 4. 저장
  fs.writeFileSync(raceDataPath, JSON.stringify(raceData, null, 2), "utf-8");
  console.log(`\nrace-data.json 업데이트 완료 (${raceData.length}건)`);

  // 5. 샘플 출력
  const sample = raceData.find((r) => r.results && r.results.length > 0);
  if (sample) {
    console.log("\n=== 샘플 ===");
    console.log(JSON.stringify(sample, null, 2));
  }
}

main();
