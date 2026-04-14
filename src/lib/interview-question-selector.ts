import { createAdminClient } from "@/lib/supabase";

export type RequestType = "regular" | "rookie" | "event" | "special";

export type Situation =
  | "good_result"
  | "win_streak"
  | "bad_result"
  | "fall_accident"
  | "grade_change_up"
  | "neutral";

export interface RecentRace {
  year: number;
  round: number;
  day: number;
  race_no: number;
  rank: number | null;
  tactic: string | null;
}

export interface PlayerContext {
  recentResults: RecentRace[];
  situation: Situation;
  situationLabel: string;
}

export interface SelectedQuestion {
  code: string;
  category: string;
  subcategory: string;
  questionText: string;
  format: string;
  choices: unknown | null;
}

export interface SelectResult {
  questions: SelectedQuestion[];
  playerContext: PlayerContext;
  racerId: string | null;
}

interface QuestionRow {
  code: string;
  category: string;
  subcategory: string;
  question_text: string;
  format: string;
  choices: unknown | null;
  requires_auto_generate: boolean | null;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

function detectSituation(recent: RecentRace[], requestType: RequestType): Situation {
  if (recent.length === 0) return "neutral";

  const hasFall = recent
    .slice(0, 3)
    .some((r) => r.rank === null || r.rank === 0);
  if (hasFall) return "fall_accident";

  const last = recent[0];
  const first3 = recent.slice(0, 3);
  const first5 = recent.slice(0, 5);

  if (
    first3.length >= 3 &&
    first3.every((r) => r.rank !== null && r.rank > 0 && r.rank <= 3)
  ) {
    return "win_streak";
  }

  if (last.rank === 1) return "good_result";

  const bad = first5.filter((r) => r.rank !== null && r.rank >= 5).length;
  if (first5.length > 0 && bad > first5.length / 2) return "bad_result";

  if (requestType === "special") return "grade_change_up";

  return "neutral";
}

function situationLabel(s: Situation): string {
  switch (s) {
    case "good_result":
      return "최근 경주 1착";
    case "win_streak":
      return "연속 입상 중";
    case "bad_result":
      return "최근 성적 부진";
    case "fall_accident":
      return "최근 낙차 또는 실격 기록";
    case "grade_change_up":
      return "등급 변동 가능";
    case "neutral":
    default:
      return "특이사항 없음";
  }
}

const SUB_MAP: Record<Situation, string[]> = {
  good_result: ["A-2", "A-2", "A-5"],
  win_streak: ["A-2", "A-2", "A-1"],
  bad_result: ["A-3", "A-3", "A-5"],
  fall_accident: ["A-4", "A-4", "A-1"],
  grade_change_up: ["A-6", "A-6", "A-1"],
  neutral: ["A-1", "A-1", "A-5"],
};

async function fetchRacerId(playerName: string): Promise<string | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("racer_profiles")
    .select("racer_id")
    .eq("name", playerName)
    .limit(1);
  if (!data || data.length === 0) return null;
  return String(data[0].racer_id);
}

async function fetchRecentRaces(playerName: string): Promise<RecentRace[]> {
  const sb = createAdminClient();
  const { data: results } = await sb
    .from("race_results")
    .select("race_id, rank, tactic")
    .eq("name", playerName)
    .order("race_id", { ascending: false })
    .limit(30);

  if (!results || results.length === 0) return [];

  const raceIds = results.map((r) => r.race_id as number);
  const { data: races } = await sb
    .from("races")
    .select("id, year, round, day, race_no")
    .in("id", raceIds);

  if (!races) return [];
  const byId = new Map(races.map((r) => [r.id as number, r]));

  return results
    .map((r) => {
      const race = byId.get(r.race_id as number);
      if (!race) return null;
      return {
        year: race.year as number,
        round: race.round as number,
        day: race.day as number,
        race_no: race.race_no as number,
        rank: (r.rank as number | null) ?? null,
        tactic: (r.tactic as string | null) ?? null,
      };
    })
    .filter((r): r is RecentRace => r !== null)
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.round !== b.round) return b.round - a.round;
      if (a.day !== b.day) return b.day - a.day;
      return b.race_no - a.race_no;
    })
    .slice(0, 10);
}

async function fetchQuestionsBySubcategory(
  subs: string[],
): Promise<Map<string, QuestionRow[]>> {
  const sb = createAdminClient();
  const uniq = Array.from(new Set(subs));
  const { data } = await sb
    .from("interview_questions")
    .select("code, category, subcategory, question_text, format, choices, requires_auto_generate")
    .eq("is_active", true)
    .in("subcategory", uniq);

  const map = new Map<string, QuestionRow[]>();
  for (const sub of uniq) map.set(sub, []);
  for (const q of (data ?? []) as QuestionRow[]) {
    const arr = map.get(q.subcategory);
    if (arr) arr.push(q);
  }
  return map;
}

async function fetchQuestionsByCategory(
  cats: string[],
): Promise<Map<string, QuestionRow[]>> {
  const sb = createAdminClient();
  const uniq = Array.from(new Set(cats));
  const { data } = await sb
    .from("interview_questions")
    .select("code, category, subcategory, question_text, format, choices, requires_auto_generate")
    .eq("is_active", true)
    .in("category", uniq);

  const map = new Map<string, QuestionRow[]>();
  for (const c of uniq) map.set(c, []);
  for (const q of (data ?? []) as QuestionRow[]) {
    const arr = map.get(q.category);
    if (arr) arr.push(q);
  }
  return map;
}

/** 자동생성 질문의 ( ) 괄호를 실제 경주 데이터로 치환 */
function fillAutoGenerate(text: string, recent: RecentRace[]): string {
  const target =
    recent.find((r) => r.rank === 1) ?? recent[0];
  if (!target) return text;
  const values = [
    String(target.round),
    String(target.day),
    String(target.race_no),
  ];
  let i = 0;
  return text.replace(/\(\s*\)/g, () => {
    const v = values[i] ?? "";
    i++;
    return v;
  });
}

function toSelected(q: QuestionRow, recent: RecentRace[]): SelectedQuestion {
  const text = q.requires_auto_generate
    ? fillAutoGenerate(q.question_text, recent)
    : q.question_text;
  return {
    code: q.code,
    category: q.category,
    subcategory: q.subcategory,
    questionText: text,
    format: q.format,
    choices: q.choices,
  };
}

export async function selectQuestionsForPlayer(
  playerName: string,
  requestType: RequestType,
): Promise<SelectResult> {
  const [recent, racerId] = await Promise.all([
    fetchRecentRaces(playerName),
    fetchRacerId(playerName),
  ]);
  const situation = detectSituation(recent, requestType);

  const selected: SelectedQuestion[] = [];

  if (requestType === "rookie") {
    const pool = await fetchQuestionsByCategory(["D", "B", "C"]);
    const d = pickRandom(pool.get("D") ?? [], 3);
    const b = pickRandom(pool.get("B") ?? [], 1);
    const c = pickRandom(pool.get("C") ?? [], 1);
    for (const q of [...d, ...b, ...c]) selected.push(toSelected(q, recent));
  } else if (requestType === "event") {
    const pool = await fetchQuestionsByCategory(["E", "A", "C"]);
    const e = pickRandom(pool.get("E") ?? [], 2);
    const a = pickRandom(pool.get("A") ?? [], 2);
    const c = pickRandom(pool.get("C") ?? [], 1);
    for (const q of [...e, ...a, ...c]) selected.push(toSelected(q, recent));
  } else {
    // regular / special — 상황기반 A 3개 + B 1 + C 1
    const subs = SUB_MAP[situation];
    const aPool = await fetchQuestionsBySubcategory(subs);
    // 같은 subcategory가 두 번 등장하면 중복 없이 2개 뽑아야 함
    const aPicked: QuestionRow[] = [];
    const usedCodes = new Set<string>();
    // subcategory별 필요 개수 집계
    const needCount: Record<string, number> = {};
    for (const s of subs) needCount[s] = (needCount[s] ?? 0) + 1;
    for (const [sub, n] of Object.entries(needCount)) {
      const available = (aPool.get(sub) ?? []).filter(
        (q) => !usedCodes.has(q.code),
      );
      for (const q of pickRandom(available, n)) {
        aPicked.push(q);
        usedCodes.add(q.code);
      }
    }

    const catPool = await fetchQuestionsByCategory(["B", "C"]);
    const b = pickRandom(catPool.get("B") ?? [], 1);
    const c = pickRandom(catPool.get("C") ?? [], 1);

    for (const q of [...aPicked, ...b, ...c])
      selected.push(toSelected(q, recent));
  }

  return {
    questions: selected,
    playerContext: {
      recentResults: recent.slice(0, 5),
      situation,
      situationLabel: situationLabel(situation),
    },
    racerId,
  };
}
