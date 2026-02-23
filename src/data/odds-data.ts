// ============================================================
// 경륜 등급별 배당률 분석 데이터
// ============================================================
// 실제 한국 경륜 통계 패턴을 기반으로 구성한 샘플 데이터입니다.
// - 특선급(SS/S): 상위 선수들이 출전 → 예측 용이 → 배당 낮은 경향
// - 우수급(A): 중간 수준
// - 선발급(B): 실력 편차 적음 → 예측 어려움 → 배당 높은 경향
// ============================================================

export type GradeGroup = "특선" | "우수" | "선발";
export type BetType = "단승" | "연승" | "쌍승" | "복승" | "삼쌍승";

export interface RaceOddsRecord {
  id: number;
  date: string;           // YYYY-MM-DD
  venue: "광명" | "부산" | "창원";
  gradeGroup: GradeGroup;
  grade: string;          // SS, S1, S2, S3, A1, A2, A3, B1, B2, B3
  raceNo: number;
  odds: {
    단승: number;
    연승: number;
    쌍승: number;
    복승: number;
    삼쌍승: number;
  };
}

// 시드 기반 의사 난수 생성 (일관된 데이터)
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateOdds(
  rand: () => number,
  gradeGroup: GradeGroup
): RaceOddsRecord["odds"] {
  // 등급별 배당률 분포 파라미터
  const params = {
    특선: { 단승: [1.5, 4.0], 연승: [1.1, 2.5], 쌍승: [3, 25], 복승: [2, 18], 삼쌍승: [8, 120] },
    우수: { 단승: [2.0, 8.0], 연승: [1.2, 3.5], 쌍승: [5, 50], 복승: [4, 35], 삼쌍승: [15, 350] },
    선발: { 단승: [2.5, 15.0], 연승: [1.3, 5.0], 쌍승: [8, 90], 복승: [6, 60], 삼쌍승: [25, 800] },
  };

  const p = params[gradeGroup];

  // 가끔 고배당 이변 발생 (약 8~12%)
  const isUpset = rand() < (gradeGroup === "특선" ? 0.08 : gradeGroup === "우수" ? 0.10 : 0.12);
  const upsetMultiplier = isUpset ? 2.0 + rand() * 3.0 : 1.0;

  const genOdd = (range: number[]) => {
    const base = range[0] + rand() * (range[1] - range[0]);
    return Math.round(base * upsetMultiplier * 10) / 10;
  };

  return {
    단승: genOdd(p.단승),
    연승: genOdd(p.연승),
    쌍승: genOdd(p.쌍승),
    복승: genOdd(p.복승),
    삼쌍승: genOdd(p.삼쌍승),
  };
}

// 2024.03 ~ 2025.02 (약 1년치) 데이터 생성
export function generateRaceData(): RaceOddsRecord[] {
  const rand = seededRandom(42);
  const records: RaceOddsRecord[] = [];
  let id = 1;

  const venues: RaceOddsRecord["venue"][] = ["광명", "부산", "창원"];
  const gradeMap: Record<GradeGroup, string[]> = {
    특선: ["SS", "S1", "S2", "S3"],
    우수: ["A1", "A2", "A3"],
    선발: ["B1", "B2", "B3"],
  };

  // 매주 금~일 경주 (약 52주 × 3일)
  const startDate = new Date(2024, 2, 1); // 2024-03-01

  for (let week = 0; week < 52; week++) {
    for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
      const raceDate = new Date(startDate);
      raceDate.setDate(startDate.getDate() + week * 7 + dayOffset + (5 - startDate.getDay())); // 금요일부터

      const dateStr = raceDate.toISOString().split("T")[0];
      const venue = venues[Math.floor(rand() * venues.length)];

      // 하루 약 12경주 (등급 혼합)
      const dayGrades: { group: GradeGroup; grade: string }[] = [];

      // 특선 2~3경주, 우수 4~5경주, 선발 4~5경주
      const numSpecial = 2 + Math.floor(rand() * 2);
      const numExcellent = 4 + Math.floor(rand() * 2);
      const numGeneral = 12 - numSpecial - numExcellent;

      for (let i = 0; i < numSpecial; i++) {
        const grades = gradeMap["특선"];
        dayGrades.push({ group: "특선", grade: grades[Math.floor(rand() * grades.length)] });
      }
      for (let i = 0; i < numExcellent; i++) {
        const grades = gradeMap["우수"];
        dayGrades.push({ group: "우수", grade: grades[Math.floor(rand() * grades.length)] });
      }
      for (let i = 0; i < numGeneral; i++) {
        const grades = gradeMap["선발"];
        dayGrades.push({ group: "선발", grade: grades[Math.floor(rand() * grades.length)] });
      }

      dayGrades.forEach((g, raceIdx) => {
        records.push({
          id: id++,
          date: dateStr,
          venue,
          gradeGroup: g.group,
          grade: g.grade,
          raceNo: raceIdx + 1,
          odds: generateOdds(rand, g.group),
        });
      });
    }
  }

  return records;
}

// 사전 생성된 데이터
export const raceData = generateRaceData();

// ============================================================
// 분석 유틸리티 함수들
// ============================================================

export function getAverageOddsByGrade(data: RaceOddsRecord[]) {
  const groups: Record<GradeGroup, { 단승: number[]; 쌍승: number[]; 삼쌍승: number[] }> = {
    특선: { 단승: [], 쌍승: [], 삼쌍승: [] },
    우수: { 단승: [], 쌍승: [], 삼쌍승: [] },
    선발: { 단승: [], 쌍승: [], 삼쌍승: [] },
  };

  data.forEach((r) => {
    groups[r.gradeGroup].단승.push(r.odds.단승);
    groups[r.gradeGroup].쌍승.push(r.odds.쌍승);
    groups[r.gradeGroup].삼쌍승.push(r.odds.삼쌍승);
  });

  const avg = (arr: number[]) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

  return (["특선", "우수", "선발"] as GradeGroup[]).map((group) => ({
    등급: group,
    단승: avg(groups[group].단승),
    쌍승: avg(groups[group].쌍승),
    삼쌍승: avg(groups[group].삼쌍승),
    경주수: groups[group].단승.length,
  }));
}

export function getOddsDistribution(data: RaceOddsRecord[], betType: BetType) {
  const groups: Record<GradeGroup, { 저배당: number; 중배당: number; 고배당: number; total: number }> = {
    특선: { 저배당: 0, 중배당: 0, 고배당: 0, total: 0 },
    우수: { 저배당: 0, 중배당: 0, 고배당: 0, total: 0 },
    선발: { 저배당: 0, 중배당: 0, 고배당: 0, total: 0 },
  };

  // 배당 구간: 승식별로 다르게 설정
  const thresholds = {
    단승: { low: 5, high: 20 },
    연승: { low: 3, high: 10 },
    쌍승: { low: 15, high: 50 },
    복승: { low: 10, high: 40 },
    삼쌍승: { low: 50, high: 200 },
  };

  const t = thresholds[betType];

  data.forEach((r) => {
    const odds = r.odds[betType];
    const g = groups[r.gradeGroup];
    g.total++;
    if (odds <= t.low) g.저배당++;
    else if (odds <= t.high) g.중배당++;
    else g.고배당++;
  });

  return (["특선", "우수", "선발"] as GradeGroup[]).map((group) => ({
    등급: group,
    저배당: Math.round((groups[group].저배당 / groups[group].total) * 100),
    중배당: Math.round((groups[group].중배당 / groups[group].total) * 100),
    고배당: Math.round((groups[group].고배당 / groups[group].total) * 100),
  }));
}

export function getUpsetFrequency(data: RaceOddsRecord[]) {
  // "고배당 이변" = 단승 배당 10배 이상
  const groups: Record<GradeGroup, { total: number; upset: number }> = {
    특선: { total: 0, upset: 0 },
    우수: { total: 0, upset: 0 },
    선발: { total: 0, upset: 0 },
  };

  data.forEach((r) => {
    groups[r.gradeGroup].total++;
    if (r.odds.단승 >= 10) groups[r.gradeGroup].upset++;
  });

  return (["특선", "우수", "선발"] as GradeGroup[]).map((group) => ({
    등급: group,
    이변빈도: Math.round((groups[group].upset / groups[group].total) * 1000) / 10,
    이변횟수: groups[group].upset,
    총경주수: groups[group].total,
  }));
}

export function getMonthlyTrend(data: RaceOddsRecord[]) {
  const monthlyMap: Record<string, Record<GradeGroup, number[]>> = {};

  data.forEach((r) => {
    const month = r.date.substring(0, 7); // YYYY-MM
    if (!monthlyMap[month]) {
      monthlyMap[month] = { 특선: [], 우수: [], 선발: [] };
    }
    monthlyMap[month][r.gradeGroup].push(r.odds.단승);
  });

  const avg = (arr: number[]) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

  return Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, groups]) => ({
      월: month.substring(5) + "월",
      특선: avg(groups.특선),
      우수: avg(groups.우수),
      선발: avg(groups.선발),
    }));
}
