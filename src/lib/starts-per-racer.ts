import { getSupabase, fetchAllRows } from "@/lib/supabase";

/** 진행 중인 연도 (연말까지 수치가 계속 변한다) */
export const IN_PROGRESS_YEAR = 2026;
/** 진행 중 연도의 집계 기준일 */
export const IN_PROGRESS_AS_OF = "2026년 8월 2일";
/** 코로나로 정상 운영되지 않은 연도 */
export const COVID_YEARS = [2020, 2021];
/** 경주 1개당 출전 인원 */
const RACERS_PER_RACE = 7;
/** 한 회차의 통상 일수(= 경주 수) */
export const DAYS_PER_ROUND = 3;

export interface YearlyStarts {
  year: number;
  /** 그 해 출주 기록이 있는 선수 수 */
  racerCount: number;
  /** 1인당 출주횟수 (회차 기준) */
  avgStarts: number;
  /** 전 선수 출주일수 합계 */
  totalDays: number;
  /** 총 경주 수 = 출주일수 합계 / 7 */
  totalRaces: number;
}

interface StartsRow {
  year: number;
  start_count: number;
  start_days: number | null;
}

/** Postgres ROUND(numeric, n) 과 동일한 half-up 반올림 (JS 기본 Math.round 는 음수에서 다름) */
function roundTo(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.sign(value) * Math.round(Math.abs(value) * f) / f;
}

/**
 * racer_yearly_starts 를 연도별로 집계한다.
 *
 * SQL 원본:
 *   SELECT year, COUNT(*), ROUND(AVG(start_count),2),
 *          SUM(start_days), ROUND(SUM(start_days)/7.0)
 *   FROM racer_yearly_starts GROUP BY year ORDER BY year;
 *
 * PostgREST 는 GROUP BY 를 지원하지 않으므로 원본 행(약 9,600행)을 받아 집계한다.
 * ⚠️ 1000행 제한 때문에 fetchAllRows 페이지네이션 필수.
 */
export async function getYearlyStarts(): Promise<YearlyStarts[]> {
  const sb = getSupabase();
  const rows = await fetchAllRows<StartsRow>(
    sb
      .from("racer_yearly_starts")
      .select("year, start_count, start_days")
      // 페이지 경계에서 행이 누락/중복되지 않도록 고유키 기준 정렬
      .order("year", { ascending: true })
      .order("racer_id", { ascending: true })
  );

  const byYear = new Map<number, { n: number; starts: number; days: number }>();
  for (const r of rows) {
    const acc = byYear.get(r.year) ?? { n: 0, starts: 0, days: 0 };
    acc.n += 1;
    acc.starts += r.start_count ?? 0;
    acc.days += r.start_days ?? 0;
    byYear.set(r.year, acc);
  }

  return [...byYear.entries()]
    .map(([year, a]) => ({
      year,
      racerCount: a.n,
      avgStarts: roundTo(a.starts / a.n, 2),
      totalDays: a.days,
      totalRaces: roundTo(a.days / RACERS_PER_RACE),
    }))
    .sort((a, b) => a.year - b.year);
}
