// ============================================================
// 연도별 등급별(선발/우수/특선) 평균 출주일수 + 검산
//
// ⚠️ DB 저장 없음, kcycle 요청 없음.
//   입력: analyze-grade-starts.ts 가 받아둔 캐시 HTML (analysis-output/grade-starts/html/{year}/{racerId}.html)
//   결과: analysis-output/grade-days/
//
// 기준은 출주일수(실제로 달린 날)뿐. 출주횟수(회차)는 쓰지 않음.
//
// 세는 규칙:
//   1. 경주 목록(T6) 1줄 = 출주 1일
//   2. 그날 등급 = 출전구분에 적힌 등급 ('선발'/'우수'/'특선' 포함, 결승·준결 포함)
//   3. 그랑프리 회차의 모든 날 → 직전 회차 등급 (출전구분 원문과 무관)
//      그랑프리 회차 = special_rounds(race_type='그랑프리GP') 회 번호 + 광명 코드, 그리고 MANUAL_GP_ROUNDS
//   4. 출전구분에 '특별' 또는 '한일' 이 든 날 → 직전 회차 등급
//   5. 직전 회차 = 같은 해 날짜상 바로 앞에 탄 회차 중 3·4번 대상이 아닌 회차.
//      없으면 바로 다음에 탄 같은 조건의 회차. 앞뒤 모두 없으면 목록 보고 (추측 금지)
//      그랑프리 아닌 'B Final' 2건(NON_GP_BFINAL)도 같은 방식 (규칙 4B)
//   6. 위 어디에도 안 맞는 출전구분 → 목록 보고 후 그 연도 중단
//   7. 2023 목록 누락분 보완 (T6_SUPPLEMENTS, 이것 1건만)
//   8. 등급 변경 선수 → 날짜 비율로 나눔 / 9. 평균 = 등급 총 일수 ÷ 등급 인원(비율 합)
//
// 사용법:
//   npx tsx scripts/analyze-grade-days.ts                 (DEFAULT_YEARS)
//   npx tsx scripts/analyze-grade-days.ts --years 2023,2024
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(또는 ANON_KEY)가 필요합니다.");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const GP_VENUE_NAME = "광명";

// 2020·2021 은 코로나로 경주 수가 비정상 → 계산 제외, 요약표에 표시만
const DEFAULT_YEARS = [2014, 2015, 2016, 2017, 2018, 2019, 2022, 2023, 2024, 2025];
const EXCLUDED_YEARS = new Map([[2020, "코로나로 제외"], [2021, "코로나로 제외"]]);

// special_rounds 에 없는 그랑프리 회차 (회차키 = 연도-회-경기장코드)
// 2014: 2014-50-001(광명, 12/26~28) 3일차 14경주 1위 이현구·2위 박용범
//   = 2015.12.15 시대일보 기사 "지난해 그랑프리 결승 이현구 우승, 박용범 준우승"과 일치
const MANUAL_GP_ROUNDS = new Map([[2014, "2014-50-001"]]);

// kcycle 경주 목록(T6) 누락분 보완 (이것 1건만)
// 2023-45-002 창원 11/12(3일차) 1·2경주가 전 선수 T6 에서 빠짐 → 그 회차 1·2일차만 있는 14명 = 2경주 × 7명.
// 14명 모두 1·2일차 우수. 추가 전 "목록 줄 수 + 1 = 프로필 출주일수" 확인, 아니면 추가 안 하고 보고.
const T6_SUPPLEMENTS = [
  {
    year: 2023,
    roundKey: "2023-45-002",
    fnRound: "45",
    fnDay: "3",
    venueCode: "002",
    venueName: "창원",
    date: "2023-11-12",
    grade: "우수" as const,
    racers: [
      "20040066", "20050043", "20060007", "20060032", "20070021", "20080001", "20090014",
      "20090023", "20120021", "20130014", "20130027", "20180003", "20210002", "20210009",
    ],
  },
];

// 그랑프리가 아닌 'B Final' 날 → 규칙 4 와 같은 방식 (직전 회차 등급). 이 2건 외의 등급 없는 값은 규칙 6 으로 멈춤
const NON_GP_BFINAL = [
  { roundKey: "2015-35-002", date: "2015-09-06", raceNo: "14" }, // 창원 9/6 3일차 14경주
  { roundKey: "2016-13-002", date: "2016-03-27", raceNo: "07" }, // 창원 3/27 3일차 7경주
];

// 검산1: kcycle 출주일수는 '특별'·'한일' 날을 세지 않는다 (2017~2019 실측: 선수별 차이 = 특별·한일 줄 수)
//   → 목록 줄 수 = 프로필 출주일수 + 특별·한일 일수 로 대조. 우리는 실제 달린 날이므로 센다.
// 확인된 kcycle 집계 누락 — 실제 달린 날(경주 목록 줄 수)로 센다. 검산 1·3 은 이 일수를 더해 대조
// 근거 (2026-10-22 캐시 HTML 진단):
//   - 팝업의 '1위~7위 횟수' 표는 kcycle 집계값. 2015년 576명 중 574명, 2016년 547명 전원이 목록 순위 집계와 같다
//   - 2015 두 선수는 (목록 순위 집계 − 1~7위 표) 가 2015-46-002 창원(11/27~29) 3일의 순위와 정확히 일치
//     (박광진 6위1·7위2 = 이 회차만 해당 / 김희종 7위3 = 이 회차 또는 24-004, 두 선수 공통 회차는 46-002)
//     같은 경주의 다른 선수들은 출주일수가 정상 집계됨 → 이 두 선수만 kcycle 집계에서 빠짐
//   - 2019 현정운: 회차 수는 일치, 1~7위 표도 목록과 같음 → 순위 '-' 인 두 날(4/7 창원 10R, 5/3 광명 3R 실격) 중 1일 누락.
//     두 날 모두 실제 출전 (같은 경주 다른 선수 순위 정상, DB 에도 출전 기록)
const KCYCLE_COUNT_OMISSIONS = new Map<number, Map<string, { days: number; note: string }>>([
  [2015, new Map([
    ["20020013", { days: 3, note: "김희종: 목록 55일 vs kcycle 52일 — 누락 2015-46-002 창원 11/27~29 3일 (8R 7위·11R 7위·7R 7위)" }],
    ["20020021", { days: 3, note: "박광진: 목록 53일 vs kcycle 50일 — 누락 2015-46-002 창원 11/27~29 3일 (15R 6위·15R 7위·10R 7위)" }],
  ])],
  [2019, new Map([
    ["19950014", { days: 1, note: "현정운: 목록 15일 vs kcycle 14일 — 누락 2019-04-07 창원 10R 또는 2019-05-03 광명 3R(실격) 중 1일 (둘 다 실제 출전)" }],
  ])],
]);

// 검산7: 열리지 않은 경주 (DB 7명 모두 순위·기록 없음, 어느 선수 경주 목록에도 없음) → 대조 제외, '미시행 경주'로 표시
const NOT_HELD_RACES = new Map([
  ["2018-02-14|광명|15", "race_id 30364 — DB 7명(정종진 등) 순위·기록 모두 비어 있음, 어느 선수 경주 목록에도 없음"],
]);

// 검산7: 그랑프리 회차 경주의 등급 표기 차이 (T6 '특선' vs DB races.grade '우수') → 등급 비교만 제외, '확인된 표기 차이'로 표시
//   규칙 3(직전 회차 등급) 대상이라 결과에 영향 없음. 인원 비교는 그대로
const LABEL_DIFF_ROUNDS = new Set(["2018-51-001", "2019-51-001"]);

// 검산7 경기장 범위: 2014~2019 DB 에는 광명만 적재
const DB_VENUES_BY_YEAR = (year: number): Set<string> | null => (year <= 2019 ? new Set(["광명"]) : null);

// 검산7: 확인된 DB 오류(수정 예정) — 대조에서 제외 (2026-10-22 진단, scripts/fix-venue-contamination.ts 로 수정 예정)
//   부산 race_results 1,283경주 (광명 명단 전체 복사 1,276 + 일부 복사 7), 창원 남은 광명 선수 26행
const DB_ERROR_RACE_FILES = [
  "analysis-output/grade-days/busan-fullcopy-races.json",
  "analysis-output/grade-days/busan-partial-races.json",
];
const DB_ERROR_RESULT_IDS = new Set([
  6757429, 6758219, 6758758, 6762565, 6763807, 6765249, 6766589, 6766695, 6766713, 6767912,
  6770337, 6772439, 6775168, 6781607, 6782165, 6782827, 6787313, 6788876, 6792222, 6792432,
  6798252, 6801064, 6801615, 6802505, 6802621, 6806769,
]);
function loadDbErrorRaceIds(): Set<number> {
  const ids = new Set<number>();
  for (const f of DB_ERROR_RACE_FILES) {
    for (const r of JSON.parse(fs.readFileSync(f, "utf-8")) as { id: number; venue: string }[]) {
      if (r.venue === "부산") ids.add(r.id);
    }
  }
  return ids;
}

function parseYearsArg(): number[] {
  const one = process.argv.indexOf("--year");
  const many = process.argv.indexOf("--years");
  const raw = one >= 0 ? process.argv[one + 1] : many >= 0 ? process.argv[many + 1] : DEFAULT_YEARS.join(",");
  const years = (raw ?? "").split(",").map((s) => parseInt(s.trim(), 10));
  if (!years.length || years.some((y) => !Number.isInteger(y) || y < 2000 || y > 2100)) {
    console.error("사용법: npx tsx scripts/analyze-grade-days.ts --year 2025 | --years 2014,2015");
    process.exit(1);
  }
  return years;
}
const YEARS = parseYearsArg();

const HTML_ROOT = path.resolve(process.cwd(), "analysis-output/grade-starts/html");
const OUT_DIR = path.resolve(process.cwd(), "analysis-output/grade-days");

type Grade = "선발" | "우수" | "특선";
const GRADES: Grade[] = ["선발", "우수", "특선"];

// ---------- 유틸 ----------
function strip(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeCsv(file: string, header: string[], rows: unknown[][]): void {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  fs.writeFileSync(file, "﻿" + body + "\n", "utf-8"); // BOM: 엑셀 한글
}

// ---------- 파싱 (analyze-grade-starts.ts 와 같은 방식) ----------
interface RaceRow {
  racerId: string;
  name: string;
  fnYear: string;
  fnRound: string;
  fnDay: string;
  venueCode: string;
  raceNo: string;
  venueName: string;
  date: string; // YYYY-MM-DD
  classRaw: string;
  supplemented: boolean; // 규칙 7 보완분
}
interface Profile {
  racerId: string;
  name: string;
  gradeChange: string;
  startDays: number;
  rows: RaceRow[];
}

function parseRaceyy(html: string): number | null {
  const m = html.match(/var\s+raceyy\s*=\s*"(\d{4})"/);
  return m ? parseInt(m[1], 10) : null;
}

function parseProfile(racerId: string, html: string): Profile {
  const name = strip((html.match(/<b class="name">([\s\S]*?)<\/b>/) || [])[1] ?? "");
  const tables = [...html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/g)].map((m) => m[0]);
  const cellsOf = (tr: string) => [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);

  const t1 = tables.find((t) => /<th[^>]*>\s*출주횟수\s*<\/th>/.test(t));
  const t6 = tables.find(
    (t) => /<th[^>]*>\s*경주회차\s*<\/th>/.test(t) && /<th[^>]*>\s*출전구분\s*<\/th>/.test(t),
  );
  if (!t1) throw new Error("T1(출주횟수) 표 없음");
  if (!t6) throw new Error("T6(경주회차/출전구분) 표 없음");

  const t1Row = [...t1.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => cellsOf(m[1]).map(strip))
    .find((c) => c.length >= 6);
  if (!t1Row) throw new Error("T1 데이터 행 없음");
  const startDays = parseInt(t1Row[t1Row.length - 1], 10);
  if (!Number.isInteger(startDays)) throw new Error(`T1 출주일수 파싱 실패: ${t1Row.join("|")}`);

  const rows: RaceRow[] = [];
  for (const m of t6.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = cellsOf(m[1]);
    if (cells.length < 3) continue;
    const fn = cells[0].match(
      /fnRace\.popup\.result\(&quot;(\d+)&quot;,\s*&quot;(\d+)&quot;,\s*&quot;(\d+)&quot;,\s*&quot;(\d+)&quot;,\s*&quot;(\d+)&quot;\)/,
    );
    const roundText = strip(cells[0]);
    const tm = roundText.match(/^\d+회 \d+일차 (\S+) \d+경주 \((\d{4})\.(\d{2})\.(\d{2})\)$/);
    if (!fn || !tm) throw new Error(`T6 행 파싱 실패: ${roundText}`);
    rows.push({
      racerId,
      name,
      fnYear: fn[1],
      fnRound: fn[2],
      fnDay: fn[3],
      venueCode: fn[4],
      raceNo: fn[5],
      venueName: tm[1],
      date: `${tm[2]}-${tm[3]}-${tm[4]}`,
      classRaw: strip(cells[1]),
      supplemented: false,
    });
  }
  return { racerId, name, gradeChange: strip(t1Row[0]), startDays, rows };
}

const writtenGrade = (raw: string): Grade | null => GRADES.find((g) => raw.includes(g)) ?? null;
const isSpecialClass = (raw: string) => raw.includes("특별") || raw.includes("한일");
const roundKeyOf = (r: RaceRow) => `${r.fnYear}-${r.fnRound}-${r.venueCode}`;
const normName = (s: string) => s.replace(/\s+/g, ""); // 이름 비교용 ('정 관' 등 공백 차이)
const isNonGpBFinal = (r: RaceRow) =>
  r.classRaw === "B Final" &&
  NON_GP_BFINAL.some((b) => b.roundKey === roundKeyOf(r) && b.date === r.date && b.raceNo === r.raceNo);

// ---------- DB ----------
async function loadTargets(year: number): Promise<Map<string, { start_days: number }>> {
  const map = new Map<string, { start_days: number }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("racer_yearly_starts")
      .select("racer_id, start_days")
      .eq("year", year)
      .order("racer_id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`racer_yearly_starts 조회 실패: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) map.set(r.racer_id, { start_days: r.start_days });
    if (data.length < 1000) break;
  }
  return map;
}

async function loadGpRounds(year: number): Promise<Set<number>> {
  const { data, error } = await supabase
    .from("special_rounds")
    .select("round")
    .eq("year", year)
    .eq("race_type", "그랑프리GP")
    .order("id", { ascending: true });
  if (error) throw new Error(`special_rounds 조회 실패: ${error.message}`);
  return new Set((data ?? []).map((r) => Number(r.round)));
}

// (날짜|경기장명|경주번호) → { raceIds, grades, entrants(행 id·이름) }
type DbEntrant = { id: number; name: string };
async function loadDbRaces(year: number): Promise<Map<string, { raceIds: number[]; grades: string[]; entrants: DbEntrant[] }>> {
  const races: { id: number; date: string; venue: string; race_no: number; grade: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("races")
      .select("id, date, venue, race_no, grade")
      .eq("year", year)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`races 조회 실패: ${error.message}`);
    if (!data?.length) break;
    races.push(...data);
    if (data.length < 1000) break;
  }
  if (!races.length) return new Map();
  const byId = new Map(races.map((r) => [r.id, r]));
  const minId = Math.min(...races.map((r) => r.id));
  const maxId = Math.max(...races.map((r) => r.id));
  const entrants = new Map<number, DbEntrant[]>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("race_results")
      .select("id, race_id, name")
      .gte("race_id", minId)
      .lte("race_id", maxId)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`race_results 조회 실패: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) {
      if (byId.has(r.race_id)) entrants.set(r.race_id, [...(entrants.get(r.race_id) ?? []), { id: r.id, name: r.name ?? "" }]);
    }
    if (data.length < 1000) break;
  }
  const map = new Map<string, { raceIds: number[]; grades: string[]; entrants: DbEntrant[] }>();
  for (const r of races) {
    const key = `${r.date}|${r.venue}|${Number(r.race_no)}`;
    const e = map.get(key) ?? { raceIds: [], grades: [], entrants: [] };
    e.raceIds.push(r.id);
    e.grades.push(r.grade ?? "(없음)");
    e.entrants.push(...(entrants.get(r.id) ?? []));
    map.set(key, e);
  }
  return map;
}

// ---------- 연도 분석 ----------
type Rule = "2" | "3" | "4" | "4B" | "7"; // 4B = 그랑프리 아닌 'B Final' (규칙 4 와 같은 방식)
interface DayInfo {
  row: RaceRow;
  rule: Rule;
  grade: Grade | null; // null = 미분류 또는 직전·다음 없음
  via: string; // 규칙 3·4: "직전 회차 X" / "다음 회차 X"
}
interface YearSummary {
  year: number;
  racers: number;
  totalDays: number;
  grades: { g: Grade; people: number; days: number }[];
  ruleDays: { r3: number; r4: number; r4b: number; r5prev: number; r5next: number; r7: number };
  specialDays: number; // 특별·한일 일수 = kcycle 출주일수와 차이 나는 부분
  omissions: { id: string; days: number; note: string }[]; // 확인된 kcycle 집계 누락
  check7Excluded: {
    foreign: number; foreignList: string[]; dbErrorRaces: number; dbErrorRows: number; notHeld: string[]; labelDiff: number;
  };
  supplements: string[]; // 2023 목록 누락분 보완
  checks: { name: string; pass: boolean; detail: string }[];
  gpKeys: string[];
}

class YearStopped extends Error {}

async function analyzeYear(YEAR: number): Promise<YearSummary> {
  console.log(`\n=== ${YEAR}년 등급별 출주일수 ===`);
  const L: string[] = [];
  const out = (s = "") => L.push(s);
  const reportPath = path.join(OUT_DIR, `${YEAR}_report.md`);
  const flush = () => fs.writeFileSync(reportPath, L.join("\n") + "\n", "utf-8");
  out(`# ${YEAR}년 등급별 출주일수 — 검산 보고서`);
  out(`생성: ${new Date().toISOString()}`);
  out();

  // 1) 캐시 HTML 읽기 (없으면 오류 — kcycle 요청 안 함)
  const targets = await loadTargets(YEAR);
  const errors: { racerId: string; reason: string }[] = [];
  const profiles: Profile[] = [];
  for (const racerId of targets.keys()) {
    const file = path.join(HTML_ROOT, String(YEAR), `${racerId}.html`);
    try {
      if (!fs.existsSync(file)) throw new Error("캐시 HTML 없음");
      const html = fs.readFileSync(file, "utf-8");
      const yy = parseRaceyy(html);
      if (yy !== YEAR) throw new Error(`raceyy=${yy} (기대 ${YEAR})`);
      profiles.push(parseProfile(racerId, html));
    } catch (e) {
      errors.push({ racerId, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  console.log(`대상 ${targets.size}명 / 파싱 ${profiles.length}명 / 오류 ${errors.length}`);
  out(`대상 ${targets.size}명 (racer_yearly_starts year=${YEAR}) / 파싱 ${profiles.length}명 / 오류 ${errors.length}건`);
  out();
  out(`## 수집 오류 (${errors.length}건)`);
  for (const e of errors) out(`- ${e.racerId}: ${e.reason}`);
  out();

  // 2) 그랑프리 회차
  const allRows0 = profiles.flatMap((p) => p.rows);
  const gpCodes = new Set(allRows0.filter((r) => r.venueName === GP_VENUE_NAME).map((r) => r.venueCode));
  const dbGp = await loadGpRounds(YEAR);
  const gpKeys = new Set(
    allRows0.filter((r) => dbGp.has(parseInt(r.fnRound, 10)) && gpCodes.has(r.venueCode)).map(roundKeyOf),
  );
  const manualGp = MANUAL_GP_ROUNDS.get(YEAR);
  if (manualGp) gpKeys.add(manualGp);
  out(`## 그랑프리 회차`);
  out(`- special_rounds 그랑프리GP round=[${[...dbGp].join(",")}], ${GP_VENUE_NAME} 코드=[${[...gpCodes].join(",")}]`);
  if (manualGp) out(`- 코드 지정: ${manualGp} (근거: 3일차 14경주 1위 이현구·2위 박용범 = 2015.12.15 시대일보 기사)`);
  for (const k of gpKeys) out(`- ${k}: T6 행 ${allRows0.filter((r) => roundKeyOf(r) === k).length}`);
  out();

  // 3) 출전구분 값 점검 (규칙 6)
  const classCounts = new Map<string, number>();
  for (const r of allRows0) classCounts.set(r.classRaw, (classCounts.get(r.classRaw) ?? 0) + 1);
  const unknown = allRows0.filter(
    (r) => !gpKeys.has(roundKeyOf(r)) && !isSpecialClass(r.classRaw) && !isNonGpBFinal(r) && !writtenGrade(r.classRaw),
  );
  out(`## 출전구분 원문 값 (${classCounts.size}종)`);
  for (const [v, n] of [...classCounts].sort((a, b) => b[1] - a[1])) {
    const gpN = allRows0.filter((r) => r.classRaw === v && gpKeys.has(roundKeyOf(r))).length;
    const bfN = allRows0.filter((r) => r.classRaw === v && !gpKeys.has(roundKeyOf(r)) && isNonGpBFinal(r)).length;
    const tag = isSpecialClass(v) ? "규칙 4 (특별·한일)" : writtenGrade(v) ? `규칙 2 → ${writtenGrade(v)}` : "등급 없음";
    out(`- ${v}: ${n}행 — ${tag}${gpN ? ` (그 중 그랑프리 회차 ${gpN}행 → 규칙 3)` : ""}${bfN ? ` (그 중 그랑프리 아닌 B Final ${bfN}행 → 규칙 4B)` : ""}`);
  }
  out(`### 규칙 2·3·4 어디에도 안 맞는 값 (${unknown.length}행)`);
  for (const r of unknown) out(`- ${r.racerId} ${r.name}: ${roundKeyOf(r)} ${r.date} ${r.fnDay}일차 ${r.venueName} ${r.raceNo}경주 '${r.classRaw}'`);
  out();
  if (unknown.length) {
    out(`## ⛔ 규칙 6: 분류할 수 없는 출전구분 ${unknown.length}행 → ${YEAR}년 중단`);
    flush();
    throw new YearStopped(`분류 불가 출전구분 ${unknown.length}행 (${[...new Set(unknown.map((r) => `'${r.classRaw}' ${roundKeyOf(r)}`))].join(", ")})`);
  }

  // 4) 규칙 7: 목록 누락분 보완
  const supp = T6_SUPPLEMENTS.filter((s) => s.year === YEAR);
  const suppApplied: string[] = [];
  const suppRejected: string[] = [];
  for (const s of supp) {
    for (const id of s.racers) {
      const p = profiles.find((x) => x.racerId === id);
      if (!p) {
        suppRejected.push(`${id}: 프로필 없음`);
        continue;
      }
      if (p.rows.length + 1 !== p.startDays) {
        suppRejected.push(`${id} ${p.name}: 목록 ${p.rows.length}줄 + 1 ≠ 출주일수 ${p.startDays} → 추가 안 함`);
        continue;
      }
      p.rows.push({
        racerId: id, name: p.name, fnYear: String(YEAR), fnRound: s.fnRound, fnDay: s.fnDay,
        venueCode: s.venueCode, raceNo: "", venueName: s.venueName, date: s.date, classRaw: s.grade, supplemented: true,
      });
      suppApplied.push(`${id} ${p.name}: 목록 ${p.rows.length - 1}줄 + 1 = 출주일수 ${p.startDays} → ${s.date} ${s.roundKey} ${s.fnDay}일차 ${s.grade} 1일 추가`);
    }
  }
  // kcycle 출주일수가 세지 않는 특별·한일 날 (선수별)
  const specialOf = (p: Profile) => p.rows.filter((r) => isSpecialClass(r.classRaw)).length;
  const omissionsHere = KCYCLE_COUNT_OMISSIONS.get(YEAR) ?? new Map<string, { days: number; note: string }>();
  const omissionDays = [...omissionsHere.values()].reduce((s, o) => s + o.days, 0);
  const expectedRows = (p: Profile) => p.startDays + specialOf(p) + (omissionsHere.get(p.racerId)?.days ?? 0);
  const rowGap = profiles.filter((p) => p.rows.length !== expectedRows(p));
  out(`## 목록 누락분 보완 (규칙 7)`);
  out(`- 추가 ${suppApplied.length}명 / 추가 안 함 ${suppRejected.length}명`);
  for (const s of suppApplied) out(`  - ${s}`);
  for (const s of suppRejected) out(`  - ⚠️ ${s}`);
  out(`### 보완 후에도 목록 줄 수 ≠ 출주일수 + 특별·한일 일수 (${rowGap.length}명, 보완하지 않음)`);
  for (const p of rowGap) {
    out(`- ${p.racerId} ${p.name}: 목록 ${p.rows.length}줄 vs 출주일수 ${p.startDays} + 특별·한일 ${specialOf(p)} (차이 ${expectedRows(p) - p.rows.length})`);
  }
  const specialRacers = profiles.filter((p) => specialOf(p) > 0);
  const specialDays = profiles.reduce((s, p) => s + specialOf(p), 0);
  out(`### 특별·한일 날 (kcycle 출주일수에 안 들어감, 우리는 실제 달린 날로 셈): ${specialDays}일 / ${specialRacers.length}명`);
  out(`### 확인된 kcycle 집계 누락 — 실제 달린 날(목록 줄 수)로 셈 (${omissionsHere.size}명, ${omissionDays}일)`);
  for (const [id, o] of omissionsHere) out(`- ${id} ${o.note}`);
  if (omissionsHere.size) {
    out(`- 근거: 팝업 '1~7위 횟수' 표(kcycle 집계)와 목록 순위 집계의 차이가 누락 날짜의 순위와 일치, 같은 경주 다른 선수는 정상 집계`);
  }
  out();

  // 5) 날별 등급
  const allRows = profiles.flatMap((p) => p.rows);
  const unclassified: string[] = [];
  const noPrevNext: string[] = [];
  const daysByRacer = new Map<string, DayInfo[]>();
  for (const p of profiles) {
    const sorted = [...p.rows].sort((a, b) => a.date.localeCompare(b.date) || a.fnDay.localeCompare(b.fnDay));
    // 회차별 묶음 (첫 날짜 순)
    const rounds = new Map<string, RaceRow[]>();
    for (const r of sorted) {
      const k = roundKeyOf(r);
      if (!rounds.has(k)) rounds.set(k, []);
      rounds.get(k)!.push(r);
    }
    const order = [...rounds.keys()];
    // 3·4번 대상이 아닌 회차 = 그랑프리 아님 + 특별·한일 날 없음. 그 회차 등급 = 적힌 등급이 하나일 때만
    const normalGrade = (k: string): { ok: boolean; grade?: Grade; why?: string } => {
      if (gpKeys.has(k)) return { ok: false };
      const rs = rounds.get(k)!;
      if (rs.some((r) => isSpecialClass(r.classRaw) || isNonGpBFinal(r))) return { ok: false };
      const gs = [...new Set(rs.map((r) => writtenGrade(r.classRaw)))];
      if (gs.length === 1 && gs[0]) return { ok: true, grade: gs[0] };
      return { ok: true, why: `등급 ${gs.join("/")} 혼합` };
    };
    const lookup = (k: string): { grade: Grade | null; via: string } => {
      const i = order.indexOf(k);
      const firstDate = rounds.get(k)![0].date;
      for (let j = i - 1; j >= 0; j--) {
        const c = order[j];
        if (rounds.get(c)![0].date >= firstDate) continue;
        const n = normalGrade(c);
        if (!n.ok) continue;
        return n.grade ? { grade: n.grade, via: `직전 ${c}(${rounds.get(c)![0].date})` } : { grade: null, via: `직전 ${c} ${n.why}` };
      }
      for (let j = i + 1; j < order.length; j++) {
        const c = order[j];
        const n = normalGrade(c);
        if (!n.ok) continue;
        return n.grade ? { grade: n.grade, via: `다음 ${c}(${rounds.get(c)![0].date})` } : { grade: null, via: `다음 ${c} ${n.why}` };
      }
      return { grade: null, via: `${YEAR}년 내 직전·다음 정상 회차 없음` };
    };
    const days: DayInfo[] = [];
    for (const r of sorted) {
      const k = roundKeyOf(r);
      let d: DayInfo;
      if (r.supplemented) d = { row: r, rule: "7", grade: writtenGrade(r.classRaw), via: "목록 누락분 보완" };
      else if (gpKeys.has(k) || isSpecialClass(r.classRaw) || isNonGpBFinal(r)) {
        const x = lookup(k);
        d = { row: r, rule: gpKeys.has(k) ? "3" : isNonGpBFinal(r) ? "4B" : "4", grade: x.grade, via: x.via };
        if (!x.grade) noPrevNext.push(`${p.racerId} ${p.name} ${k} ${r.date} ${r.fnDay}일차 '${r.classRaw}': ${x.via}`);
      } else {
        d = { row: r, rule: "2", grade: writtenGrade(r.classRaw), via: "" };
        if (!d.grade) unclassified.push(`${p.racerId} ${p.name} ${k} ${r.date} '${r.classRaw}'`);
      }
      days.push(d);
    }
    daysByRacer.set(p.racerId, days);
  }

  // 6) 선수별 집계 + 비율
  const byRacer = profiles.map((p) => {
    const days = daysByRacer.get(p.racerId)!;
    const c = { 선발: 0, 우수: 0, 특선: 0, 미확정: 0 };
    for (const d of days) c[d.grade ?? "미확정"]++;
    const graded = c.선발 + c.우수 + c.특선;
    const share = Object.fromEntries(GRADES.map((g) => [g, graded ? c[g] / graded : 0])) as Record<Grade, number>;
    const ridden = GRADES.filter((g) => c[g] > 0);
    return { p, days, c, graded, share, ridden, db: targets.get(p.racerId)! };
  });
  writeCsv(
    path.join(OUT_DIR, `${YEAR}_by_racer.csv`),
    ["racer_id", "name", "grade_change", "선발_일", "우수_일", "특선_일", "미확정_일", "선발_비율", "우수_비율", "특선_비율",
      "profile_start_days", "t6_rows", "db_start_days"],
    byRacer.map(({ p, c, share, db }) => [p.racerId, p.name, p.gradeChange, c.선발, c.우수, c.특선, c.미확정,
      share.선발.toFixed(4), share.우수.toFixed(4), share.특선.toFixed(4), p.startDays,
      p.rows.filter((r) => !r.supplemented).length, db.start_days]),
  );
  writeCsv(
    path.join(OUT_DIR, `${YEAR}_days.csv`),
    ["racer_id", "name", "date", "round_key", "fn_day", "venue", "race_no", "class_raw", "rule", "grade", "via"],
    byRacer.flatMap(({ p, days }) => days.map((d) => [p.racerId, p.name, d.row.date, roundKeyOf(d.row), d.row.fnDay,
      d.row.venueName, d.row.raceNo, d.row.classRaw, d.rule, d.grade ?? "", d.via])),
  );

  const gradeStats = GRADES.map((g) => ({
    g,
    people: byRacer.reduce((s, b) => s + b.share[g], 0),
    days: byRacer.reduce((s, b) => s + b.c[g], 0),
  }));
  const peopleSum = gradeStats.reduce((s, x) => s + x.people, 0);
  const totalDays = gradeStats.reduce((s, x) => s + x.days, 0);
  const allDays = byRacer.flatMap((b) => b.days);
  const ruleDays = {
    r3: allDays.filter((d) => d.rule === "3").length,
    r4: allDays.filter((d) => d.rule === "4").length,
    r4b: allDays.filter((d) => d.rule === "4B").length,
    r5prev: allDays.filter((d) => d.via.startsWith("직전")).length,
    r5next: allDays.filter((d) => d.via.startsWith("다음")).length,
    r7: allDays.filter((d) => d.rule === "7").length,
  };

  out(`## 결과 — 등급별 출주일수 (등급 변경 선수는 날짜 비율로 나눔)`);
  out(`| 등급 | 인원(비율 합) | 총 출주일수 | 평균 |`);
  out(`|---|---|---|---|`);
  for (const x of gradeStats) out(`| ${x.g} | ${x.people.toFixed(2)} | ${x.days} | ${x.people ? (x.days / x.people).toFixed(2) : "-"} |`);
  out(`| 전체 | ${peopleSum.toFixed(2)} | ${totalDays} | ${peopleSum ? (totalDays / peopleSum).toFixed(2) : "-"} |`);
  out(`- 규칙 적용 일수: 3(그랑프리) ${ruleDays.r3} / 4(특별·한일) ${ruleDays.r4} / 4B(그랑프리 아닌 B Final) ${ruleDays.r4b} / ` +
    `5(직전 회차 ${ruleDays.r5prev}, 다음 회차 ${ruleDays.r5next}) / 7(보완) ${ruleDays.r7}`);
  out(`- 등급 변경 선수 ${byRacer.filter((b) => b.ridden.length > 1).length}명 / 한 등급만 ${byRacer.filter((b) => b.ridden.length === 1).length}명`);
  out();

  // 7) 검산
  const c1 = byRacer.filter((b) => b.graded !== expectedRows(b.p) || b.c.미확정 > 0);
  out(`## 검산1 선수별 (선발+우수+특선 일수) = 프로필 출주일수 + 특별·한일 일수 — 불일치 ${c1.length}명`);
  out(`- (확인된 kcycle 집계 누락 ${omissionsHere.size}명은 누락 일수를 더해 대조, 위 목록 참고)`);
  for (const b of c1) {
    out(`- ${b.p.racerId} ${b.p.name}: ${b.graded} (미확정 ${b.c.미확정}) vs 출주일수 ${b.p.startDays} + 특별·한일 ${specialOf(b.p)}`);
  }
  out();
  const c2 = byRacer.filter((b) => b.p.startDays !== b.db.start_days);
  out(`## 검산2 프로필 출주일수 = racer_yearly_starts.start_days — 불일치 ${c2.length}명`);
  for (const b of c2) out(`- ${b.p.racerId} ${b.p.name}: ${b.p.startDays} vs DB ${b.db.start_days}`);
  out();
  const dbSumDays = [...targets.values()].reduce((s, r) => s + r.start_days, 0);
  const expectedTotal = dbSumDays + specialDays + omissionDays;
  out(`## 검산3 연도 총 출주일수 = racer_yearly_starts 합계 + 특별·한일 일수 + 확인된 kcycle 집계 누락 일수`);
  out(`- ${totalDays} vs DB ${dbSumDays} + 특별·한일 ${specialDays} + kcycle 누락 ${omissionDays} = ${expectedTotal} → ${totalDays === expectedTotal ? "일치" : "불일치"}`);
  out();
  out(`## 검산4 등급별 인원(비율 합)의 합 = 선수 수`);
  out(`- ${peopleSum.toFixed(6)} vs ${targets.size} (파싱 ${profiles.length}, 오류 ${errors.length})`);
  out();
  out(`## 검산5 미분류 ${unclassified.length}일 / 직전·다음 회차 모두 없음 ${noPrevNext.length}건`);
  for (const s of unclassified) out(`- 미분류: ${s}`);
  for (const s of noPrevNext) out(`- 직전·다음 없음: ${s}`);
  out();
  const seen = new Map<string, number>();
  for (const r of allRows.filter((x) => !x.supplemented)) {
    const k = `${r.racerId}|${r.date}|${r.venueName}|${r.raceNo}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dups = [...seen].filter(([, n]) => n > 1);
  const outOfYear = allRows.filter((r) => !r.date.startsWith(`${YEAR}-`) || r.fnYear !== String(YEAR));
  out(`## 검산6 (선수, 날짜, 경기장, 경주번호) 중복 ${dups.length} / 연도 밖 날짜 ${outOfYear.length}`);
  for (const [k, n] of dups) out(`- 중복 ${k} ×${n}`);
  for (const r of outOfYear) out(`- 연도 밖 ${r.racerId} ${roundKeyOf(r)} ${r.date}`);
  out();

  // 검산7: 규칙 3·4 적용 전, 적힌 등급 그대로 vs DB races.grade + race_results 인원
  const venueScope = DB_VENUES_BY_YEAR(YEAR);
  const dbRaces = await loadDbRaces(YEAR);
  const prof = new Map<string, { n: number; names: string[]; roundKeys: Set<string>; grades: Map<string, number> }>();
  for (const r of allRows) {
    if (r.supplemented) continue; // 보완분은 경주번호 미상 → 대조 제외
    if (venueScope && !venueScope.has(r.venueName)) continue;
    const k = `${r.date}|${r.venueName}|${parseInt(r.raceNo, 10)}`;
    const e = prof.get(k) ?? { n: 0, names: [], roundKeys: new Set(), grades: new Map() };
    e.n++;
    e.names.push(normName(r.name));
    e.roundKeys.add(roundKeyOf(r));
    const g = writtenGrade(r.classRaw) ?? "(적힌 등급 없음)";
    e.grades.set(g, (e.grades.get(g) ?? 0) + 1);
    prof.set(k, e);
  }
  const dbScoped = new Map([...dbRaces].filter(([k]) => !venueScope || venueScope.has(k.split("|")[1])));
  // 우리 선수 명단(그 해 racer_yearly_starts 대상, 프로필 이름)에 없는 선수(일본 선수 등)는 대조 제외.
  // 단 DB 는 개명 전 이름으로 남아 있을 수 있다 (최성일↔최부건 등) → 경주 안에서 "DB에만 있는 이름"과
  // "프로필에만 있는 이름"을 먼저 짝지어(개명 추정) 빼고, 짝 없이 남는 DB 쪽 이름 중 우리 명단에 없는 사람만 제외
  const ourNames = new Set(profiles.map((p) => normName(p.name)));
  let renamed7 = 0;
  const dbErrorRaceIds = loadDbErrorRaceIds();
  const keys7 = [...new Set([...prof.keys(), ...dbScoped.keys()])].sort();
  const bad7: string[] = [];
  const noWritten7: string[] = [];
  const dbError7: string[] = [];
  const foreign7: string[] = [];
  const notHeld7: string[] = [];
  const labelDiff7: string[] = [];
  let dbErrorRows7 = 0;
  const profByGrade = new Map<string, number>();
  const dbByGrade = new Map<string, number>();
  for (const k of keys7) {
    const a = prof.get(k);
    const b = dbScoped.get(k);
    if (NOT_HELD_RACES.has(k)) {
      notHeld7.push(`- ${k}: ${NOT_HELD_RACES.get(k)} (프로필 ${a?.n ?? 0}명 / DB ${b?.entrants.length ?? 0}명)`);
      continue;
    }
    if (b && b.raceIds.some((id) => dbErrorRaceIds.has(id))) {
      dbError7.push(`- ${k} (race_id ${b.raceIds.join(",")}): 부산 광명 명단 복사 — 프로필 ${a?.n ?? 0}명 / DB ${b.entrants.length}명`);
      continue;
    }
    const errRows = (b?.entrants ?? []).filter((e) => DB_ERROR_RESULT_IDS.has(e.id));
    for (const e of errRows) dbError7.push(`- ${k} (race_id ${b!.raceIds.join(",")}): 창원 남은 광명 선수 행 ${e.id} ${e.name}`);
    dbErrorRows7 += errRows.length;
    const kept = (b?.entrants ?? []).filter((e) => !DB_ERROR_RESULT_IDS.has(e.id));
    const profLeft = [...(a?.names ?? [])];
    const dbOnly: DbEntrant[] = [];
    for (const e of kept) {
      const i = profLeft.indexOf(normName(e.name));
      if (i >= 0) profLeft.splice(i, 1);
      else dbOnly.push(e);
    }
    const pairs = Math.min(dbOnly.length, profLeft.length); // 개명 추정 짝
    renamed7 += pairs;
    const unpaired = dbOnly.filter((e) => !ourNames.has(normName(e.name))).slice(0, Math.max(0, dbOnly.length - pairs));
    const others = unpaired;
    if (others.length) foreign7.push(`- ${k}: ${others.map((e) => e.name).join(", ")}`);
    const dbN = kept.length - others.length;
    for (const [g, n] of a?.grades ?? []) profByGrade.set(g, (profByGrade.get(g) ?? 0) + n);
    if (b) for (const g of b.grades) dbByGrade.set(g, (dbByGrade.get(g) ?? 0) + dbN / b.grades.length);
    const pg = [...(a?.grades.keys() ?? [])];
    const dbg = [...new Set(b?.grades ?? [])];
    const desc = `프로필 ${a?.n ?? 0}명 [${[...(a?.grades ?? [])].map(([g, n]) => `${g} ${n}`).join(", ")}] vs DB ${dbN}명 [${dbg.join(",") || "경주 없음"}]` +
      (b ? ` (race_id ${b.raceIds.join(",")})` : "");
    const countBad = (a?.n ?? 0) !== dbN;
    const onlyUnwritten = pg.length === 1 && pg[0] === "(적힌 등급 없음)";
    const gradeDiff = !onlyUnwritten && (pg.length !== 1 || dbg.length !== 1 || pg[0] !== dbg[0]);
    // 확인된 표기 차이 회차는 등급 비교만 제외 (인원 비교는 그대로)
    const labelDiff = gradeDiff && !!a && [...a.roundKeys].every((rk) => LABEL_DIFF_ROUNDS.has(rk));
    const gradeBad = gradeDiff && !labelDiff;
    if (countBad || gradeBad || (b && b.raceIds.length > 1)) bad7.push(`- ${k}: ${desc}${countBad ? " ← 인원 다름" : ""}${gradeBad ? " ← 등급 다름" : ""}`);
    else if (labelDiff) labelDiff7.push(`- ${k} (${[...a!.roundKeys].join(",")}): ${desc}`);
    else if (onlyUnwritten) noWritten7.push(`- ${k}: ${desc}`);
  }
  out(`## 검산7 [다른 자료 대조] 적힌 등급 그대로 vs DB races.grade + race_results 인원 (${venueScope ? [...venueScope].join(",") + "만" : "전 경기장"})`);
  out(`- 인원·등급만 비교 (이름 비교 안 함). 프로필은 racer_yearly_starts 대상 선수만, 규칙 7 보완분 제외`);
  out(`- DB 쪽에서 우리 선수 명단에 없는 선수(일본 선수 등) 제외: ${foreign7.length}경주`);
  out(`- 같은 경주 안에서 DB·프로필 이름만 다른 선수 (개명 추정, 인원에는 포함): ${renamed7}명·경주`);
  out(`- 확인된 DB 오류(수정 예정) 제외: 부산 광명 명단 복사 ${dbError7.length - dbErrorRows7}경주 / 창원 남은 광명 선수 ${dbErrorRows7}행`);
  out(`- 미시행 경주 제외: ${notHeld7.length} / 확인된 표기 차이(등급 비교만 제외): ${labelDiff7.length}경주`);
  out(`| 등급 | 프로필 적힌 등급 일수 | DB 등급별 출전 인원 (제외 후) |`);
  out(`|---|---|---|`);
  for (const g of [...GRADES, "(적힌 등급 없음)"]) out(`| ${g} | ${profByGrade.get(g) ?? 0} | ${g === "(적힌 등급 없음)" ? "-" : Math.round(dbByGrade.get(g) ?? 0)} |`);
  out(`- 경주 수: 전체 ${keys7.length} / 불일치 ${bad7.length} / 적힌 등급 없는 경주(등급 비교 불가, 인원 일치) ${noWritten7.length}`);
  out(`### 불일치 경주 (${bad7.length})`);
  for (const s of bad7) out(s);
  out(`### 확인된 DB 오류(수정 예정) — 대조 제외 (${dbError7.length})`);
  for (const s of dbError7) out(s);
  out(`### 미시행 경주 — 대조 제외 (${notHeld7.length})`);
  for (const s of notHeld7) out(s);
  out(`### 확인된 표기 차이 — 그랑프리 회차 T6 '특선' vs DB '우수', 규칙 3 대상이라 결과 영향 없음 (${labelDiff7.length})`);
  for (const s of labelDiff7) out(s);
  out(`### 우리 선수 명단에 없는 DB 선수 — 대조 제외 (${foreign7.length}경주)`);
  for (const s of foreign7) out(s);
  out(`### 적힌 등급 없는 경주 — 인원만 비교, 일치 (${noWritten7.length})`);
  for (const s of noWritten7) out(s);
  out();

  // 검산8: 사람 눈 확인용
  out(`## 검산8 [사람 눈 확인용]`);
  const picks: [string, (typeof byRacer)[number] | undefined][] = [
    ["한 등급만 탄 선수", byRacer.find((b) => b.ridden.length === 1 && b.days.some((d) => d.rule !== "2")) ?? byRacer.find((b) => b.ridden.length === 1)],
    ["등급이 바뀐 선수", byRacer.find((b) => b.ridden.length > 1)],
    ["그랑프리 출전 선수", byRacer.find((b) => b.days.some((d) => d.rule === "3"))],
  ];
  for (const [label, b] of picks) {
    out(`### ${label}: ${b ? `${b.p.racerId} ${b.p.name} (${b.p.gradeChange}) — ${GRADES.map((g) => `${g} ${b.c[g]}일`).join(" / ")}, 출주일수 ${b.p.startDays}` : "해당 선수 없음"}`);
    if (!b) continue;
    out(`| 날짜 | 회차 | 일차 | 출전구분 원문 | 적용 등급 | 적용 규칙 |`);
    out(`|---|---|---|---|---|---|`);
    for (const d of b.days) {
      out(`| ${d.row.date} | ${d.row.fnRound}회 ${d.row.venueName} | ${d.row.fnDay} | ${d.row.classRaw} | ${d.grade ?? "미확정"} | ${d.rule}${d.via ? ` (${d.via})` : ""} |`);
    }
    out();
  }

  const checks = [
    { name: "1 등급일수=출주일수+특별", pass: c1.length === 0, detail: `불일치 ${c1.length}명` },
    { name: "2 출주일수=DB", pass: c2.length === 0, detail: `불일치 ${c2.length}명` },
    {
      name: "3 총 일수=DB 합+특별",
      pass: totalDays === expectedTotal,
      detail: `${totalDays}/${dbSumDays}+${specialDays}${omissionDays ? `+${omissionDays}` : ""}`,
    },
    {
      name: "4 비율 합=선수 수",
      pass: Math.abs(peopleSum - targets.size) < 1e-6 && errors.length === 0,
      detail: `${peopleSum.toFixed(4)}/${targets.size}`,
    },
    { name: "5 미분류·직전다음없음", pass: unclassified.length + noPrevNext.length === 0, detail: `${unclassified.length}/${noPrevNext.length}` },
    { name: "6 중복·연도 밖", pass: dups.length + outOfYear.length === 0, detail: `${dups.length}/${outOfYear.length}` },
    { name: "7 DB 대조", pass: bad7.length === 0, detail: `불일치 경주 ${bad7.length}/${keys7.length}` },
    { name: "8 눈 확인표", pass: picks.every(([, b]) => b), detail: picks.map(([, b]) => (b ? "O" : "X")).join("") },
  ];
  out(`## 검산 요약`);
  for (const c of checks) out(`- ${c.pass ? "✅" : "❌"} ${c.name}: ${c.detail}`);
  flush();
  console.log(`보고서: ${reportPath}`);

  return {
    year: YEAR,
    racers: targets.size,
    totalDays,
    grades: gradeStats,
    ruleDays,
    specialDays,
    omissions: [...omissionsHere].map(([id, o]) => ({ id, days: o.days, note: o.note })),
    check7Excluded: {
      foreign: foreign7.length, foreignList: foreign7, dbErrorRaces: dbError7.length - dbErrorRows7, dbErrorRows: dbErrorRows7,
      notHeld: notHeld7, labelDiff: labelDiff7.length,
    },
    supplements: suppApplied,
    checks,
    gpKeys: [...gpKeys],
  };
}

// ---------- 메인 ----------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results: YearSummary[] = [];
  const failed: { year: number; reason: string }[] = [];
  for (const year of YEARS) {
    try {
      results.push(await analyzeYear(year));
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.error(`  ${year}년 중단: ${reason}`);
      failed.push({ year, reason });
      if (!(e instanceof YearStopped)) console.error(e);
    }
  }

  const allYears = [...new Set([...YEARS, ...EXCLUDED_YEARS.keys()])]
    .filter((y) => y >= Math.min(...YEARS) && y <= Math.max(...YEARS))
    .sort((a, b) => a - b);
  const avg = (d: number, p: number) => (p ? (d / p).toFixed(2) : "-");
  const get = (r: YearSummary, g: Grade) => r.grades.find((x) => x.g === g)!;
  const M: string[] = [];
  const out = (s = "") => M.push(s);
  const csvRows: unknown[][] = [];
  out(`# ${Math.min(...YEARS)}~${Math.max(...YEARS)} 등급별 평균 출주일수 — 최종`);
  out(`생성: ${new Date().toISOString()}`);
  out();
  out(`기준: 경주 목록(T6) 1줄 = 출주 1일 (실제 달린 날). 그랑프리·특별·한일·그랑프리 아닌 B Final 날은 직전(없으면 다음) 정상 회차 등급. ` +
    `등급 변경 선수는 날짜 비율로 나눔. 평균 = 등급 총 출주일수 ÷ 등급 인원(비율 합). 단위: 일`);
  out();
  out(`## 1. 최종 결과`);
  out(`| 연도 | 선발 평균 | 우수 평균 | 특선 평균 | 전체 평균 | 선수 수 | 총 출주일수 |`);
  out(`|---|---|---|---|---|---|---|`);
  for (const y of allYears) {
    const r = results.find((x) => x.year === y);
    const note = EXCLUDED_YEARS.get(y) ?? (failed.find((f) => f.year === y) ? `중단: ${failed.find((f) => f.year === y)!.reason}` : "-");
    if (!r) {
      out(`| ${y} | ${note} | | | | | |`);
      csvRows.push([y, ...Array(GRADES.length * 3 + 4).fill(""), note]);
      continue;
    }
    const bad = r.checks.filter((c) => !c.pass).map((c) => c.name.split(" ")[0]);
    const avgs = GRADES.map((g) => get(r, g).days / get(r, g).people);
    out(`| ${y} | ${GRADES.map((g) => avg(get(r, g).days, get(r, g).people)).join(" | ")} | ${avg(r.totalDays, r.racers)} | ` +
      `${r.racers} | ${r.totalDays} |`);
    csvRows.push([y, ...GRADES.flatMap((g) => [get(r, g).people.toFixed(4), get(r, g).days, avg(get(r, g).days, get(r, g).people)]),
      avg(r.totalDays, r.racers), r.racers, r.totalDays, (Math.max(...avgs) - Math.min(...avgs)).toFixed(2),
      bad.length ? `검산 불일치 ${bad.join(",")}` : "검산 통과"]);
  }
  out();
  out(`## 2. 등급 인원(비율 합) / 총 출주일수`);
  out(`| 연도 | ${GRADES.map((g) => `${g} 인원 | ${g} 일수`).join(" | ")} |`);
  out(`|---|${GRADES.map(() => "---|---").join("|")}|`);
  for (const r of results) out(`| ${r.year} | ${GRADES.map((g) => `${get(r, g).people.toFixed(2)} | ${get(r, g).days}`).join(" | ")} |`);
  out();
  out(`## 3. 등급 간 차이 (가장 높은 등급 평균 − 가장 낮은 등급 평균)`);
  out(`| 연도 | 가장 높은 등급 | 가장 낮은 등급 | 차이(일) |`);
  out(`|---|---|---|---|`);
  for (const y of allYears) {
    const r = results.find((x) => x.year === y);
    if (!r) {
      out(`| ${y} | ${EXCLUDED_YEARS.get(y) ?? "-"} | | |`);
      continue;
    }
    const ga = GRADES.map((g) => ({ g, v: get(r, g).days / get(r, g).people }));
    const hi = ga.reduce((m, x) => (x.v > m.v ? x : m));
    const lo = ga.reduce((m, x) => (x.v < m.v ? x : m));
    out(`| ${y} | ${hi.g} ${hi.v.toFixed(2)} | ${lo.g} ${lo.v.toFixed(2)} | ${(hi.v - lo.v).toFixed(2)} |`);
  }
  out();
  out(`## 4. 검산 1~8 연도별`);
  const names = results[0]?.checks.map((c) => c.name) ?? [];
  out(`| 연도 | ${names.join(" | ")} |`);
  out(`|---|${names.map(() => "---").join("|")}|`);
  for (const r of results) out(`| ${r.year} | ${r.checks.map((c) => `${c.pass ? "✅" : "❌"} ${c.detail}`).join(" | ")} |`);
  for (const f of failed) out(`| ${f.year} | ⛔ 중단: ${f.reason} |`);
  out();
  out(`## 5. 확인된 예외`);
  out(`### 5-1. 2014 그랑프리 판정 근거`);
  out(`- 2014-50-001 (광명, 12/26~28): 3일차 14경주 1위 이현구·2위 박용범 = 2015.12.15 시대일보 기사 ` +
    `"지난해 그랑프리 결승 이현구 우승, 박용범 준우승"과 일치 (special_rounds 에 2014 그랑프리 없음)`);
  out(`### 5-2. 2023 목록 누락분 보완 (2023-45-002 창원 11/12 1·2경주가 kcycle 목록에서 빠짐 → 우수 1일씩 추가)`);
  for (const r of results) for (const s of r.supplements) out(`- ${s}`);
  out(`### 5-3. 확인된 kcycle 집계 누락 (실제 달린 날로 셈)`);
  for (const r of results) for (const o of r.omissions) out(`- ${r.year} ${o.id} ${o.note}`);
  out(`- 근거: 팝업 '1~7위 횟수' 표(kcycle 집계)와 목록 순위 집계 차이 = 누락 날짜 순위 (2015 576명 중 574명·2016 전원은 두 값이 같음), ` +
    `같은 경주 다른 선수는 정상 집계`);
  out(`### 5-4. 특별·한일 일수 (kcycle 출주일수에 안 들어감, 실제 달린 날로 셈)`);
  out(`| 연도 | 특별·한일 일수 | 총 출주일수 (우리) | racer_yearly_starts 합계 (kcycle) |`);
  out(`|---|---|---|---|`);
  for (const r of results) {
    const om = r.omissions.reduce((s, o) => s + o.days, 0);
    if (r.specialDays) out(`| ${r.year} | ${r.specialDays} | ${r.totalDays} | ${r.totalDays - r.specialDays - om} |`);
  }
  out(`### 5-5. 미시행 경주 (검산 7 대조 제외)`);
  for (const r of results) for (const s of r.check7Excluded.notHeld) out(`${s} (${r.year})`);
  out(`### 5-6. 확인된 표기 차이 (검산 7 등급 비교 제외, 규칙 3 대상이라 결과 영향 없음)`);
  for (const r of results) if (r.check7Excluded.labelDiff) out(`- ${r.year}: ${r.check7Excluded.labelDiff}경주 (그랑프리 회차 T6 '특선' vs DB races.grade '우수')`);
  out(`### 5-7. 검산 7에서 제외한 DB 오류(수정 예정)·명단 밖 선수`);
  out(`| 연도 | 부산 광명 명단 복사 경주 | 창원 남은 광명 선수 행 | 우리 명단 밖 선수(일본 선수 등) 경주 |`);
  out(`|---|---|---|---|`);
  for (const r of results) {
    out(`| ${r.year} | ${r.check7Excluded.dbErrorRaces} | ${r.check7Excluded.dbErrorRows} | ${r.check7Excluded.foreign} |`);
  }
  out();
  out(`## 참고: 규칙 적용 일수`);
  out(`| 연도 | 3 그랑프리 | 4 특별·한일 | 4B 그랑프리 아닌 B Final | 5 직전 회차 | 5 다음 회차 | 7 2023 목록 누락분 보완 |`);
  out(`|---|---|---|---|---|---|---|`);
  for (const r of results) {
    out(`| ${r.year} | ${r.ruleDays.r3} | ${r.ruleDays.r4} | ${r.ruleDays.r4b} | ${r.ruleDays.r5prev} | ${r.ruleDays.r5next} | ${r.ruleDays.r7} |`);
  }
  out();
  out(`## 참고: 그랑프리 회차`);
  for (const r of results) out(`- ${r.year}: ${r.gpKeys.join(", ")}`);
  const allPass = !failed.length && results.every((r) => r.checks.every((c) => c.pass));
  out();
  out(`## 종합: ${allPass ? "모든 연도 검산 통과" : "검산 불일치/중단 연도 있음"}`);

  writeCsv(
    path.join(OUT_DIR, "final_summary.csv"),
    ["year", ...GRADES.flatMap((g) => [`${g}_인원`, `${g}_일수`, `${g}_평균`]), "전체_평균", "선수_수", "총_출주일수", "등급간_차이", "비고"],
    csvRows,
  );
  fs.writeFileSync(path.join(OUT_DIR, "final_report.md"), M.join("\n") + "\n", "utf-8");
  console.log(`\n요약: ${path.join(OUT_DIR, "final_report.md")} — ${allPass ? "모든 연도 통과" : "불일치/중단 있음"}`);
}

main().catch((err) => {
  console.error("치명적 에러:", err instanceof Error ? err.message : err);
  process.exit(1);
});
