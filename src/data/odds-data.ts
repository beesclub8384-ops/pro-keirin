// ============================================================
// 경륜 배당률 분석 데이터
// ============================================================
// data.go.kr 경주결과 + 출주표 API 기반 (광명 경륜장 2024년)
// 등급(gradeGroup)은 출주표 API의 racer_grd_cd 실제 값 사용
// ============================================================

import cachedData from "./race-data.json";

export type BetType = "단승" | "연승1착" | "연승2착" | "복승" | "쌍승" | "삼복승" | "쌍복승" | "삼쌍승";
export type GradeGroup = "특선" | "우수" | "선발";

export interface RaceOddsRecord {
  id: number;
  date: string;           // YYYY-MM-DD
  venue: string;
  gradeGroup: GradeGroup;
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

// API 데이터 (race-data.json) 로드
export const raceData: RaceOddsRecord[] =
  Array.isArray(cachedData) && cachedData.length > 0
    ? (cachedData as RaceOddsRecord[])
    : [];

export const isRealData = raceData.length > 0;

// ============================================================
// 분석 유틸리티 함수들
// ============================================================

const avg = (arr: number[]) =>
  arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

/** 승식별 평균 배당률 */
export function getAverageOddsByBetType(data: RaceOddsRecord[]) {
  const betTypes: BetType[] = ["단승", "연승1착", "연승2착", "복승", "쌍승", "삼복승", "쌍복승", "삼쌍승"];
  return betTypes.map((bt) => ({
    승식: bt,
    평균: avg(data.map((r) => r.odds[bt])),
    최소: data.length ? Math.min(...data.map((r) => r.odds[bt])) : 0,
    최대: data.length ? Math.max(...data.map((r) => r.odds[bt])) : 0,
    경주수: data.length,
  }));
}

/** 등급별 평균 배당률 비교 */
export function getAverageOddsByGrade(data: RaceOddsRecord[]) {
  const grades: GradeGroup[] = ["선발", "우수", "특선"];
  return grades.map((g) => {
    const gradeData = data.filter((r) => r.gradeGroup === g);
    return {
      등급: g,
      단승: avg(gradeData.map((r) => r.odds.단승)),
      연승1착: avg(gradeData.map((r) => r.odds.연승1착)),
      연승2착: avg(gradeData.map((r) => r.odds.연승2착)),
      복승: avg(gradeData.map((r) => r.odds.복승)),
      쌍승: avg(gradeData.map((r) => r.odds.쌍승)),
      삼복승: avg(gradeData.map((r) => r.odds.삼복승)),
      쌍복승: avg(gradeData.map((r) => r.odds.쌍복승)),
      삼쌍승: avg(gradeData.map((r) => r.odds.삼쌍승)),
      경주수: gradeData.length,
    };
  });
}

/** 승식별 배당 분포 (저/중/고배당 비율) */
export function getBetTypeDistribution(data: RaceOddsRecord[]) {
  const betTypes: BetType[] = ["단승", "연승1착", "연승2착", "복승", "쌍승", "삼복승", "쌍복승", "삼쌍승"];
  const thresholds: Record<string, { low: number; high: number }> = {
    단승: { low: 5, high: 20 },
    연승1착: { low: 3, high: 10 },
    연승2착: { low: 3, high: 10 },
    쌍승: { low: 15, high: 50 },
    복승: { low: 10, high: 40 },
    쌍복승: { low: 30, high: 100 },
    삼복승: { low: 50, high: 200 },
    삼쌍승: { low: 50, high: 200 },
  };

  return betTypes.map((bt) => {
    const t = thresholds[bt];
    let low = 0, mid = 0, high = 0;
    data.forEach((r) => {
      const v = r.odds[bt];
      if (v <= t.low) low++;
      else if (v <= t.high) mid++;
      else high++;
    });
    const total = data.length || 1;
    return {
      승식: bt,
      저배당: Math.round((low / total) * 100),
      중배당: Math.round((mid / total) * 100),
      고배당: Math.round((high / total) * 100),
    };
  });
}

/** 등급별 이변(고배당) 발생 빈도 */
export function getUpsetFrequencyByGrade(data: RaceOddsRecord[]) {
  const grades: GradeGroup[] = ["선발", "우수", "특선"];
  const result: { 등급: string; 이변빈도: number; 이변횟수: number; 총경주수: number }[] =
    grades.map((g) => {
      const gradeData = data.filter((r) => r.gradeGroup === g);
      const upsets = gradeData.filter((r) => r.odds.단승 >= 10).length;
      return {
        등급: g,
        이변빈도: gradeData.length ? Math.round((upsets / gradeData.length) * 1000) / 10 : 0,
        이변횟수: upsets,
        총경주수: gradeData.length,
      };
    });

  const totalUpsets = data.filter((r) => r.odds.단승 >= 10).length;
  result.push({
    등급: "전체",
    이변빈도: data.length ? Math.round((totalUpsets / data.length) * 1000) / 10 : 0,
    이변횟수: totalUpsets,
    총경주수: data.length,
  });

  return result;
}

/** 월별 단승 평균 배당 추이 — 등급별 */
export function getMonthlyTrendByGrade(data: RaceOddsRecord[]) {
  const monthlyMap: Record<string, Record<string, number[]>> = {};

  data.forEach((r) => {
    const month = r.date.substring(0, 7);
    if (!monthlyMap[month]) {
      monthlyMap[month] = { 선발: [], 우수: [], 특선: [], 전체: [] };
    }
    monthlyMap[month][r.gradeGroup].push(r.odds.단승);
    monthlyMap[month]["전체"].push(r.odds.단승);
  });

  return Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, groups]) => ({
      월: month.substring(5) + "월",
      특선: avg(groups.특선),
      우수: avg(groups.우수),
      선발: avg(groups.선발),
      전체: avg(groups.전체),
    }));
}
