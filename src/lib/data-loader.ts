import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "src", "data");

// --- Helper ---

function getYearlyDir(subDir: string): string {
  return path.join(DATA_DIR, subDir);
}

export function getAvailableYears(subDir: string): number[] {
  const dir = getYearlyDir(subDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => parseInt(f.replace(".json", ""), 10))
    .sort((a, b) => b - a);
}

function loadJSON<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

// --- Race Detail Types ---

export interface RaceDetailResult {
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
  training: string;
}

export interface RaceDetailEnvironment {
  time: string;
  weather: string;
  windDir: string;
  windSpeed: string;
  temp: string;
  humidity: string;
  rainfall: string;
  record200m: string;
  lastLap: string;
}

export interface RaceDetailRace {
  year: number;
  round: number;
  day: number;
  raceNo: number;
  date: string;
  environment: RaceDetailEnvironment;
  results: RaceDetailResult[];
}

export interface RaceDetailYear {
  year: number;
  totalRaces: number;
  races: RaceDetailRace[];
}

// --- Decision Card Types ---

export interface DecisionCardEntry {
  backNo: number;
  racerId: string;
  generation: number;
  age: number;
  photoUrl: string;
  winRateVenue: number;
  top2RateVenue: number;
  top3RateVenue: number;
  winRateTotal: number;
  top2RateTotal: number;
  top3RateTotal: number;
  place1st: number;
  place2nd: number;
  place3rd: number;
  tacticPreemptTotal: string;
  tacticPushTotal: string;
  tacticChaseTotal: string;
  tacticMarkTotal: string;
  tacticPreemptRound: string;
  tacticPushRound: string;
  tacticChaseRound: string;
  tacticMarkRound: string;
  gradeAdjust: string;
  recent3ScoreVenue: string;
  recent3ScoreTotal: string;
  performanceRank: string;
  isAbsent: boolean;
  training: string;
  isUnion: boolean;
}

export interface DecisionCardRace {
  raceNo: number;
  startTime: string;
  laps: string;
  raceType: string;
  entries: DecisionCardEntry[];
}

export interface DecisionCardPage {
  year: number;
  round: number;
  day: number;
  date: string;
  races: DecisionCardRace[];
}

export interface DecisionCardYear {
  year: number;
  totalPages: number;
  pages: DecisionCardPage[];
}

// --- Entry Types ---

export interface EntryRecord {
  date: string;
  venue: string;
  week: number;
  day: number;
  raceNo: number;
  backNo: number;
  color: string;
  racerName: string;
  racerAge: number;
  grade: string;
  gradeCode: string;
  gradePrev: string;
  training: string;
  gearRate: number;
  raceLen: number;
  winRate: number;
  top2Rate: number;
  avgScore: number;
  rec200m: string;
}

// --- Race Data (odds) ---

export interface RaceOdds {
  단승: number;
  연승1착: number;
  연승2착: number;
  쌍승: number;
  복승: number;
  삼복승: number;
  삼쌍승: number;
  쌍복승: number;
}

export interface RaceDataRecord {
  id: number;
  date: string;
  venue: string;
  gradeGroup: string;
  raceNo: number;
  odds: RaceOdds;
  results: { rank: number; backNo: number; name: string; gap: string; raceTime: string; tactic: string }[];
}

// --- Racer Profile Types ---

export interface RacerProfile {
  racerId: string;
  name: string;
  year: number;
  birthYear: string;
  height: number;
  weight: number;
  bloodType: string;
  gradeChange: string;
  winRate: number;
  top2Rate: number;
  top3Rate: number;
  raceCount: number;
  runDays: number;
  recent3Score: number;
  recent3Rank: number;
  totalAvgScore: number;
  totalRankScore: number;
  recent200m: string;
  training: string;
  tactics: {
    preemptive: number[];
    push: number[];
    chase: number[];
    mark: number[];
  };
  violations: {
    disqualification: number;
    warning: number;
    caution: number;
    fallWithdraw: number;
    fallEntry: number;
    accidentWithdraw: number;
    accidentEntry: number;
  };
  indices: {
    preemptive: number;
    push: number;
    chase: number;
    mark: number;
  };
  isUnion: boolean;
}

// --- Ranking Types ---

export interface RankingEntry {
  rank: number;
  name: string;
  generation: number;
  grade: string;
  runDays: number;
  avgScore: number;
  avgScoreGM: number;
  avgScoreCW: number;
  avgScoreBS: number;
  recent3: number;
  recent3GM: number;
  recent3CW: number;
  recent3BS: number;
  winRate: number;
  top2Rate: number;
  top3Rate: number;
}

export interface RankingYear {
  year: number;
  totalRacers: number;
  rankings: RankingEntry[];
}

// --- Statistics Types ---

export interface DividendStatsYear {
  year: number;
  highDividends: { poolType: string; amount: string; raceDate: string; round: string; day: string; raceNo: string; combination: string }[];
  distribution: { poolType: string; range1: string; range2: string; range3: string; range4: string; range5: string; range6: string; range7: string; range8: string }[];
}

export interface SalesStatsYear {
  year: number;
  byRound: { rank: number; amount: string; raceDate: string; round: string; day: string; raceNo: string }[];
  byDay: { rank: number; amount: string; raceDate: string; round: string; day: string; raceNo: string }[];
  byRace: { rank: number; amount: string; raceDate: string; round: string; day: string; raceNo: string }[];
}

export interface HighDividendYear {
  year: number;
  tables: { poolType: string; rows: { rank: number; amount: string; raceDate: string; round: string; day: string; raceNo: string; combination: string }[] }[];
}

export interface NoHitRace {
  title: string;
  pools: { poolType: string; winNo: string; dividend: string; sales: string }[];
}

// --- Racer ID Types ---

export interface RacerIdEntry {
  racerId: string;
  name: string;
  rank: number;
}

// --- Loaders ---

export function loadRacerIds(year: number): RacerIdEntry[] {
  return loadJSON<RacerIdEntry[]>(path.join(getYearlyDir("racer-ids"), `${year}.json`));
}

export function loadYearlyRaceDetail(year: number): RaceDetailYear {
  return loadJSON<RaceDetailYear>(path.join(getYearlyDir("yearly-race-detail"), `${year}.json`));
}

export function loadYearlyDecisionCard(year: number): DecisionCardYear {
  return loadJSON<DecisionCardYear>(path.join(getYearlyDir("yearly-decision-card"), `${year}.json`));
}

export function loadYearlyEntry(year: number): EntryRecord[] {
  return loadJSON<EntryRecord[]>(path.join(getYearlyDir("yearly-entry"), `${year}.json`));
}

export function loadRaceData(): RaceDataRecord[] {
  return loadJSON<RaceDataRecord[]>(path.join(DATA_DIR, "race-data.json"));
}

export function loadRacerProfiles(): RacerProfile[] {
  return loadJSON<RacerProfile[]>(path.join(DATA_DIR, "racer-profile-data.json"));
}

export function loadYearlyRacerProfiles(year: number): RacerProfile[] {
  const data = loadJSON<{ year: number; totalRacers: number; profiles: RacerProfile[] }>(
    path.join(getYearlyDir("yearly-racer-profile"), `${year}.json`)
  );
  return data.profiles;
}

export function loadRankingData(): RankingYear[] {
  return loadJSON<RankingYear[]>(path.join(DATA_DIR, "ranking-data.json"));
}

export function loadDividendStats(): DividendStatsYear[] {
  return loadJSON<DividendStatsYear[]>(path.join(DATA_DIR, "dividend-stats-data.json"));
}

export function loadSalesStats(): SalesStatsYear[] {
  return loadJSON<SalesStatsYear[]>(path.join(DATA_DIR, "sales-stats-data.json"));
}

export function loadHighDividend(): HighDividendYear[] {
  return loadJSON<HighDividendYear[]>(path.join(DATA_DIR, "high-dividend-data.json"));
}

export function loadNoHitRaces(): NoHitRace[] {
  return loadJSON<NoHitRace[]>(path.join(DATA_DIR, "no-hit-races-data.json"));
}
