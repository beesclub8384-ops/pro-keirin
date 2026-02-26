// ============================================================
// 경륜 배당률 분석 데이터
// ============================================================
// data.go.kr 경륜 경주결과 API 데이터를 사용합니다.
// race-data.json이 없을 경우 빈 배열로 폴백합니다.
// ============================================================

import cachedData from "./race-data.json";

export type BetType = "단승" | "연승" | "쌍승" | "복승" | "삼쌍승";
export type Venue = "광명" | "부산" | "창원";

export interface RaceOddsRecord {
  id: number;
  date: string;           // YYYY-MM-DD
  venue: Venue;
  raceNo: number;
  odds: {
    단승: number;
    연승: number;
    쌍승: number;
    복승: number;
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
// 분석 유틸리티 함수들 (정확한 데이터 기반)
// ============================================================

const avg = (arr: number[]) =>
  arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

/** 승식별 평균 배당률 */
export function getAverageOddsByBetType(data: RaceOddsRecord[]) {
  const betTypes: BetType[] = ["단승", "연승", "쌍승", "복승", "삼쌍승"];
  return betTypes.map((bt) => ({
    승식: bt,
    평균: avg(data.map((r) => r.odds[bt])),
    최소: data.length ? Math.min(...data.map((r) => r.odds[bt])) : 0,
    최대: data.length ? Math.max(...data.map((r) => r.odds[bt])) : 0,
    경주수: data.length,
  }));
}

/** 경륜장별 평균 배당률 비교 */
export function getAverageOddsByVenue(data: RaceOddsRecord[]) {
  const venues: Venue[] = ["광명", "부산", "창원"];
  return venues.map((v) => {
    const venueData = data.filter((r) => r.venue === v);
    return {
      경륜장: v,
      단승: avg(venueData.map((r) => r.odds.단승)),
      쌍승: avg(venueData.map((r) => r.odds.쌍승)),
      삼쌍승: avg(venueData.map((r) => r.odds.삼쌍승)),
      경주수: venueData.length,
    };
  });
}

/** 승식별 배당 분포 (저/중/고배당 비율) */
export function getBetTypeDistribution(data: RaceOddsRecord[]) {
  const betTypes: BetType[] = ["단승", "쌍승", "삼쌍승"];
  const thresholds: Record<string, { low: number; high: number }> = {
    단승: { low: 5, high: 20 },
    쌍승: { low: 15, high: 50 },
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

/** 전체 이변(고배당) 빈도 — 경륜장별 */
export function getUpsetFrequencyByVenue(data: RaceOddsRecord[]) {
  const venues: (Venue | "전체")[] = ["광명", "부산", "창원"];
  const result: { 경륜장: string; 이변빈도: number; 이변횟수: number; 총경주수: number }[] =
    venues.map((v) => {
      const venueData = data.filter((r) => r.venue === v);
      const upsets = venueData.filter((r) => r.odds.단승 >= 10).length;
      return {
        경륜장: v,
        이변빈도: venueData.length ? Math.round((upsets / venueData.length) * 1000) / 10 : 0,
        이변횟수: upsets,
        총경주수: venueData.length,
      };
    });

  // 전체 합산도 추가
  const totalUpsets = data.filter((r) => r.odds.단승 >= 10).length;
  result.push({
    경륜장: "전체",
    이변빈도: data.length ? Math.round((totalUpsets / data.length) * 1000) / 10 : 0,
    이변횟수: totalUpsets,
    총경주수: data.length,
  });

  return result;
}

/** 월별 단승 평균 배당 추이 — 경륜장별 */
export function getMonthlyTrendByVenue(data: RaceOddsRecord[]) {
  const monthlyMap: Record<string, Record<string, number[]>> = {};

  data.forEach((r) => {
    const month = r.date.substring(0, 7);
    if (!monthlyMap[month]) {
      monthlyMap[month] = { 광명: [], 부산: [], 창원: [], 전체: [] };
    }
    monthlyMap[month][r.venue].push(r.odds.단승);
    monthlyMap[month]["전체"].push(r.odds.단승);
  });

  return Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, groups]) => ({
      월: month.substring(5) + "월",
      광명: avg(groups.광명),
      부산: avg(groups.부산),
      창원: avg(groups.창원),
      전체: avg(groups.전체),
    }));
}
