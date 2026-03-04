import type {
  RaceDetailRace,
  RaceDetailResult,
  RaceDetailEnvironment,
  RaceOdds,
  DecisionCardPage,
  DecisionCardRace,
  DecisionCardEntry,
  RacerProfile,
  RankingEntry,
} from "./data-loader";

// ---- Generic helpers ----

// Convert a single DB row's snake_case keys to camelCase
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export function toCamelCase<T extends Record<string, unknown>>(
  row: Record<string, unknown>
): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value;
  }
  return result as T;
}

// ---- Race Results transformers ----

interface RaceRow {
  id: number;
  year: number;
  round: number;
  day: number;
  race_no: number;
  date: string;
  env_time: string | null;
  env_weather: string | null;
  env_wind_dir: string | null;
  env_wind_speed: string | null;
  env_temp: string | null;
  env_humidity: string | null;
  env_rainfall: string | null;
  env_record_200m: string | null;
  env_last_lap: string | null;
}

interface RaceResultRow {
  back_no: number;
  name: string;
  rank: number | null;
  gap: string | null;
  race_time: string | null;
  tactic: string | null;
  disqualified: string | null;
  warning: string | null;
  caution: string | null;
  withdrawal: string | null;
  finish: string | null;
  record_200m: string | null;
  speed_200m: number | null;
}

interface OddsRow {
  odds_win: number | null;
  odds_place_1st: number | null;
  odds_place_2nd: number | null;
  odds_exacta: number | null;
  odds_quinella: number | null;
  odds_trio: number | null;
  odds_trifecta: number | null;
  odds_duet: number | null;
}

export function transformRaceResult(row: RaceResultRow): RaceDetailResult {
  return {
    backNo: row.back_no,
    name: row.name,
    rank: row.rank ?? 0,
    gap: row.gap ?? "",
    raceTime: row.race_time ?? "",
    tactic: row.tactic ?? "",
    disqualified: row.disqualified ?? "",
    warning: row.warning ?? "",
    caution: row.caution ?? "",
    withdrawal: row.withdrawal ?? "",
    finish: row.finish ?? "",
    record200m: row.record_200m ?? "",
    speed200m: row.speed_200m ?? 0,
  };
}

export function transformEnvironment(row: RaceRow): RaceDetailEnvironment {
  return {
    time: row.env_time ?? "",
    weather: row.env_weather ?? "",
    windDir: row.env_wind_dir ?? "",
    windSpeed: row.env_wind_speed ?? "",
    temp: row.env_temp ?? "",
    humidity: row.env_humidity ?? "",
    rainfall: row.env_rainfall ?? "",
    record200m: row.env_record_200m ?? "",
    lastLap: row.env_last_lap ?? "",
  };
}

export function transformOdds(row: OddsRow | null): RaceOdds | null {
  if (!row) return null;
  return {
    단승: row.odds_win ?? 0,
    연승1착: row.odds_place_1st ?? 0,
    연승2착: row.odds_place_2nd ?? 0,
    쌍승: row.odds_exacta ?? 0,
    복승: row.odds_quinella ?? 0,
    삼복승: row.odds_trio ?? 0,
    삼쌍승: row.odds_trifecta ?? 0,
    쌍복승: row.odds_duet ?? 0,
  };
}

export function transformRaceWithResults(
  raceRow: RaceRow,
  resultRows: RaceResultRow[],
  oddsRow?: OddsRow | null
): RaceDetailRace & { odds: RaceOdds | null } {
  return {
    year: raceRow.year,
    round: raceRow.round,
    day: raceRow.day,
    raceNo: raceRow.race_no,
    date: raceRow.date,
    environment: transformEnvironment(raceRow),
    results: resultRows.map(transformRaceResult),
    odds: oddsRow ? transformOdds(oddsRow) : null,
  };
}

// ---- Decision Card transformers ----

interface DCPageRow {
  id: number;
  year: number;
  round: number;
  day: number;
  date: string;
}

interface DCRaceRow {
  id: number;
  page_id: number;
  race_no: number;
  start_time: string | null;
  laps: string | null;
  race_type: string | null;
}

interface DCEntryRow {
  dc_race_id: number;
  back_no: number;
  racer_id: string | null;
  generation: number | null;
  age: number | null;
  photo_url: string | null;
  win_rate_venue: number | null;
  top2_rate_venue: number | null;
  top3_rate_venue: number | null;
  win_rate_total: number | null;
  top2_rate_total: number | null;
  top3_rate_total: number | null;
  place_1st: number | null;
  place_2nd: number | null;
  place_3rd: number | null;
  tactic_preempt_total: string | null;
  tactic_push_total: string | null;
  tactic_chase_total: string | null;
  tactic_mark_total: string | null;
  tactic_preempt_round: string | null;
  tactic_push_round: string | null;
  tactic_chase_round: string | null;
  tactic_mark_round: string | null;
  grade_adjust: string | null;
  recent3_score_venue: string | null;
  recent3_score_total: string | null;
  performance_rank: string | null;
  name?: string; // joined from racer_ids
}

export function transformDCEntry(row: DCEntryRow): DecisionCardEntry & { name: string } {
  return {
    backNo: row.back_no,
    racerId: row.racer_id ?? "",
    generation: row.generation ?? 0,
    age: row.age ?? 0,
    photoUrl: row.photo_url ?? "",
    winRateVenue: row.win_rate_venue ?? 0,
    top2RateVenue: row.top2_rate_venue ?? 0,
    top3RateVenue: row.top3_rate_venue ?? 0,
    winRateTotal: row.win_rate_total ?? 0,
    top2RateTotal: row.top2_rate_total ?? 0,
    top3RateTotal: row.top3_rate_total ?? 0,
    place1st: row.place_1st ?? 0,
    place2nd: row.place_2nd ?? 0,
    place3rd: row.place_3rd ?? 0,
    tacticPreemptTotal: row.tactic_preempt_total ?? "",
    tacticPushTotal: row.tactic_push_total ?? "",
    tacticChaseTotal: row.tactic_chase_total ?? "",
    tacticMarkTotal: row.tactic_mark_total ?? "",
    tacticPreemptRound: row.tactic_preempt_round ?? "",
    tacticPushRound: row.tactic_push_round ?? "",
    tacticChaseRound: row.tactic_chase_round ?? "",
    tacticMarkRound: row.tactic_mark_round ?? "",
    gradeAdjust: row.grade_adjust ?? "",
    recent3ScoreVenue: row.recent3_score_venue ?? "",
    recent3ScoreTotal: row.recent3_score_total ?? "",
    performanceRank: row.performance_rank ?? "",
    name: row.name ?? "",
  };
}

export function assembleDCPages(
  pageRows: DCPageRow[],
  raceRows: DCRaceRow[],
  entryRows: DCEntryRow[]
): DecisionCardPage[] {
  // Group entries by dc_race_id
  const entriesByRace = new Map<number, DCEntryRow[]>();
  for (const e of entryRows) {
    const arr = entriesByRace.get(e.dc_race_id) || [];
    arr.push(e);
    entriesByRace.set(e.dc_race_id, arr);
  }

  // Group races by page_id
  const racesByPage = new Map<number, (DecisionCardRace & { id: number })[]>();
  for (const r of raceRows) {
    const entries = (entriesByRace.get(r.id) || []).map(transformDCEntry);
    const race = {
      id: r.id,
      raceNo: r.race_no,
      startTime: r.start_time ?? "",
      laps: r.laps ?? "",
      raceType: r.race_type ?? "",
      entries,
    };
    const arr = racesByPage.get(r.page_id) || [];
    arr.push(race);
    racesByPage.set(r.page_id, arr);
  }

  return pageRows.map((p) => ({
    year: p.year,
    round: p.round,
    day: p.day,
    date: p.date,
    races: (racesByPage.get(p.id) || []).map(({ id: _id, ...rest }) => rest),
  }));
}

// ---- Racer Profile transformer ----

interface RacerProfileRow {
  racer_id: string;
  name: string;
  year: number;
  grade_change: string | null;
  win_rate: number | null;
  top2_rate: number | null;
  top3_rate: number | null;
  race_count: number | null;
  run_days: number | null;
  recent3_score: number | null;
  recent3_rank: number | null;
  total_avg_score: number | null;
  total_rank_score: number | null;
  recent_200m: string | null;
  training: string | null;
  tactics: Record<string, unknown> | null;
  violations: Record<string, unknown> | null;
  indices: Record<string, unknown> | null;
}

export function transformRacerProfile(row: RacerProfileRow): RacerProfile {
  return {
    racerId: row.racer_id,
    name: row.name,
    year: row.year,
    gradeChange: row.grade_change ?? "",
    winRate: row.win_rate ?? 0,
    top2Rate: row.top2_rate ?? 0,
    top3Rate: row.top3_rate ?? 0,
    raceCount: row.race_count ?? 0,
    runDays: row.run_days ?? 0,
    recent3Score: row.recent3_score ?? 0,
    recent3Rank: row.recent3_rank ?? 0,
    totalAvgScore: row.total_avg_score ?? 0,
    totalRankScore: row.total_rank_score ?? 0,
    recent200m: row.recent_200m ?? "",
    training: row.training ?? "",
    tactics: (row.tactics as RacerProfile["tactics"]) ?? {
      preemptive: [],
      push: [],
      chase: [],
      mark: [],
    },
    violations: (row.violations as RacerProfile["violations"]) ?? {
      disqualification: 0,
      warning: 0,
      caution: 0,
      fallWithdraw: 0,
      fallEntry: 0,
      accidentWithdraw: 0,
      accidentEntry: 0,
    },
    indices: (row.indices as RacerProfile["indices"]) ?? {
      preemptive: 0,
      push: 0,
      chase: 0,
      mark: 0,
    },
  };
}

// ---- Ranking transformer ----

interface RankingRow {
  year: number;
  rank: number;
  name: string;
  generation: number | null;
  grade: string | null;
  run_days: number | null;
  avg_score: number | null;
  avg_score_gm: number | null;
  avg_score_cw: number | null;
  avg_score_bs: number | null;
  recent3: number | null;
  recent3_gm: number | null;
  recent3_cw: number | null;
  recent3_bs: number | null;
  win_rate: number | null;
  top2_rate: number | null;
  top3_rate: number | null;
}

export function transformRanking(row: RankingRow): RankingEntry & { year: number } {
  return {
    year: row.year,
    rank: row.rank,
    name: row.name,
    generation: row.generation ?? 0,
    grade: row.grade ?? "",
    runDays: row.run_days ?? 0,
    avgScore: row.avg_score ?? 0,
    avgScoreGM: row.avg_score_gm ?? 0,
    avgScoreCW: row.avg_score_cw ?? 0,
    avgScoreBS: row.avg_score_bs ?? 0,
    recent3: row.recent3 ?? 0,
    recent3GM: row.recent3_gm ?? 0,
    recent3CW: row.recent3_cw ?? 0,
    recent3BS: row.recent3_bs ?? 0,
    winRate: row.win_rate ?? 0,
    top2Rate: row.top2_rate ?? 0,
    top3Rate: row.top3_rate ?? 0,
  };
}
