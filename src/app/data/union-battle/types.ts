// 진영 대결 데이터 타입 (API /api/data/union-battle 응답)
export interface MatrixCell {
  venue: string;
  grade: string;
  proWin: number;
  laborWin: number;
  tie: number;
  decisive: number;
  proWinrate: number | null;
  small: boolean; // n<300 표본 극소
}
export interface TrendRow {
  venue: string;
  grade: string;
  year: number;
  n: number;
  proWinrate: number | null;
}
export interface TradRow {
  grade: string;
  camp: "pro" | "labor";
  n: number;
  winRate: number;
  top2Rate: number;
  top3Rate: number;
  avgRank: number;
}
export interface AdvanceRow {
  venue: string;
  grade: string;
  proRate: number | null;
  laborRate: number | null;
  proSlotShare: number | null;
  finalStarts: number;
}
export interface StandingRow {
  venue: string;
  grade: string;
  win: number;
  winPro: number;
  top2: number;
  top2Pro: number;
  top3: number;
  top3Pro: number;
  winProPct: number | null;
  small: boolean; // 결승 20경주 미만
}
export interface UnionBattleData {
  meta: { period: string; venues: string[] };
  matrix: MatrixCell[];
  trend: TrendRow[];
  traditional: TradRow[];
  finalsAdvance: AdvanceRow[];
  finalsStandings: StandingRow[];
}

export const VENUES = ["광명", "창원", "부산"] as const;
export const GRADES = ["선발", "우수", "특선"] as const;

// 진영 색상 (UnionBadge와 통일: 프로=파랑, 노동=회색)
export const PRO_COLOR = "#2563eb"; // blue-600
export const LABOR_COLOR = "#9ca3af"; // gray-400
