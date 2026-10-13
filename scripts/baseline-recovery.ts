/**
 * 창원·부산 race_results 복구 — 0단계 기준선 기록 (읽기 전용)
 *
 * 배경:
 *   2026-10-13 01:29~01:35 UTC 에 scripts/seed/seed-races.ts 가 광명 데이터를
 *   창원·부산 race_id 에 덮어썼다. 원인은 seed-races.ts:98~101 의 race_id 맵이
 *   `year|round|day|race_no` 만 키로 쓰고 **venue 를 빼먹은** 것이다.
 *   races UNIQUE 는 (year, round, day, race_no, venue) 이므로 3개 구장이 한 키로
 *   뭉개졌고, 광명 전용 yearly-race-detail 파일이 창원·부산 행에 upsert 됐다.
 *
 * 이 스크립트가 필요한 이유:
 *   무료 요금제라 PITR 백업 복원이 불가능하다. 그리고 복구(재수집)는 upsert
 *   덮어쓰기라 **되돌릴 수 없다**. 복구가 잘못되면 지금 상태로도 못 돌아간다.
 *   그래서 복구 전에 현재 상태를 행 단위로 고정해 두는 것이 유일한 안전장치다.
 *   손상 전 기준선이 없어서 이 사고의 범위를 사후 추정해야 했던 실패를 반복하지 않는다.
 *
 * ⚠️ 이 스크립트는 **DB 에 쓰지 않는다.** SELECT 만 한다.
 *    복구 후 같은 스크립트를 다시 돌려 before/after 를 비교하는 것이 목적이므로
 *    출력 형식과 계산 방법을 바꾸지 말 것. 바꾸면 비교가 무의미해진다.
 *
 * 실행: npx tsx scripts/baseline-recovery.ts        (npm run baseline:recovery)
 * 출력: docs/recovery/baseline-<타임스탬프>.json  +  동일 이름 .md 요약
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  // 값은 출력하지 않는다 — 존재 여부만 알린다
  console.error(
    `ERROR: 환경변수 누락 (NEXT_PUBLIC_SUPABASE_URL=${url ? "set" : "MISSING"}, SUPABASE_SERVICE_ROLE_KEY=${key ? "set" : "MISSING"})`,
  );
  process.exit(1);
}
const sb: SupabaseClient = createClient(url, key);

/** 손상이 발생할 수 있는 최소 연도. 창원·부산은 2020년부터 적재된다 */
const SINCE_YEAR = 2020;
const PAGE = 1000;
const ID_CHUNK = 500;
const OUT_DIR = path.join(process.cwd(), "docs", "recovery");

/**
 * 페이지네이션 조회. 고유키 정렬을 **호출자가** 걸어야 한다.
 * ORDER BY 없이 .range() 를 쓰면 행이 중복·누락되는데 에러도 안 나고 건수도 맞는다
 * (CLAUDE.md 규칙 3 실측 근거). 기준선이 틀리면 복구 판정 전체가 무의미해지므로
 * 여기서는 특히 중요하다.
 */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await build(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

async function countOf(table: string): Promise<number> {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function maxDate(table: string): Promise<string | null> {
  const { data, error } = await sb.from(table).select("date").order("date", { ascending: false }).limit(1);
  if (error) return null;
  return (data?.[0]?.date as string) ?? null;
}

interface RaceRow {
  id: number;
  year: number;
  round: string;
  day: number;
  race_no: number;
  venue: string | null;
  date: string;
  grade: string | null;
  grade_raw: string | null;
}

interface ResultRow {
  id: number;
  race_id: number;
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

/** 손상 행 스냅샷 — 복구 후 무엇이 어떻게 바뀌었는지 행 단위로 대조하는 용도 */
interface SnapshotRow {
  venue: string;
  date: string;
  round: string;
  day: number;
  raceNo: number;
  backNo: number;
  name: string;
  rank: number | null;
  gap: string | null;
  raceTime: string | null;
  tactic: string | null;
  disqualified: string | null;
  warning: string | null;
  caution: string | null;
  withdrawal: string | null;
  finish: string | null;
  record200m: string | null;
  speed200m: number | null;
}

function sigKey(r: { year: number; round: string; day: number; race_no: number }): string {
  return `${r.year}|${r.round}|${r.day}|${r.race_no}`;
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log("=== 복구 기준선 기록 (읽기 전용) ===\n");

  // ---------------------------------------------------------------- 1. 테이블 건수
  console.log("1/5 테이블 건수...");
  const tables = [
    "races",
    "race_results",
    "race_odds",
    "violations",
    "decision_card_pages",
    "decision_card_races",
    "decision_card_entries",
    "racer_profiles",
    "race_schedule",
  ];
  const tableCounts: Record<string, { count: number; maxDate: string | null }> = {};
  for (const t of tables) {
    tableCounts[t] = { count: await countOf(t), maxDate: await maxDate(t) };
    console.log(`     ${t}: ${tableCounts[t].count}${tableCounts[t].maxDate ? ` (max date ${tableCounts[t].maxDate})` : ""}`);
  }

  // ---------------------------------------------------------------- 2. races / race_results
  console.log(`\n2/5 races (${SINCE_YEAR}년 이후) + race_results 조회...`);
  const races = await fetchAll<RaceRow>((from, to) =>
    sb
      .from("races")
      .select("id, year, round, day, race_no, venue, date, grade, grade_raw")
      .gte("year", SINCE_YEAR)
      .order("id", { ascending: true })
      .range(from, to),
  );
  console.log(`     races: ${races.length}건`);

  const raceById = new Map<number, RaceRow>();
  for (const r of races) raceById.set(r.id, r);

  const ids = races.map((r) => r.id);
  const results: ResultRow[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const rows = await fetchAll<ResultRow>((from, to) =>
      sb
        .from("race_results")
        .select(
          "id, race_id, back_no, name, rank, gap, race_time, tactic, disqualified, warning, caution, withdrawal, finish, record_200m, speed_200m",
        )
        .in("race_id", chunk)
        .order("id", { ascending: true })
        .range(from, to),
    );
    results.push(...rows);
  }
  console.log(`     race_results: ${results.length}건`);

  // race_id 별로 묶기
  const byRace = new Map<number, ResultRow[]>();
  for (const rr of results) {
    let arr = byRace.get(rr.race_id);
    if (!arr) {
      arr = [];
      byRace.set(rr.race_id, arr);
    }
    arr.push(rr);
  }
  for (const arr of byRace.values()) arr.sort((a, b) => a.back_no - b.back_no);

  // ---------------------------------------------------------------- 3. 손상 탐지 (방법 A)
  // 같은 (year, round, day, race_no) 의 광명 경주와 선수명 배열이 차번 순으로
  // 완전히 동일하면 덮어쓰기로 본다. 서로 다른 구장의 7명 명단이 순서까지
  // 같을 확률은 실질적으로 0이다.
  console.log("\n3/5 손상 탐지 (광명 데이터 서명 대조)...");
  const gmSig = new Map<string, string>();
  for (const r of races) {
    if (r.venue !== "광명") continue;
    const arr = byRace.get(r.id);
    if (!arr || arr.length === 0) continue;
    gmSig.set(sigKey(r), arr.map((x) => x.name).join(","));
  }

  const damagedRaceIds: number[] = [];
  const snapshot: SnapshotRow[] = [];
  const damagedDateSet = new Map<string, number>(); // "venue|date" -> 경주수
  const perVenueYear = new Map<string, { dates: Set<string>; races: number; rows: number }>();

  for (const r of races) {
    if (r.venue !== "창원" && r.venue !== "부산") continue;
    const arr = byRace.get(r.id);
    if (!arr || arr.length === 0) continue;
    const sig = arr.map((x) => x.name).join(",");
    const gm = gmSig.get(sigKey(r));
    if (!gm || gm !== sig) continue;

    damagedRaceIds.push(r.id);
    const dk = `${r.venue}|${r.date}`;
    damagedDateSet.set(dk, (damagedDateSet.get(dk) ?? 0) + 1);

    const vk = `${r.venue}|${r.year}`;
    let agg = perVenueYear.get(vk);
    if (!agg) {
      agg = { dates: new Set<string>(), races: 0, rows: 0 };
      perVenueYear.set(vk, agg);
    }
    agg.dates.add(r.date);
    agg.races += 1;
    agg.rows += arr.length;

    for (const x of arr) {
      snapshot.push({
        venue: r.venue,
        date: r.date,
        round: r.round,
        day: r.day,
        raceNo: r.race_no,
        backNo: x.back_no,
        name: x.name,
        rank: x.rank,
        gap: x.gap,
        raceTime: x.race_time,
        tactic: x.tactic,
        disqualified: x.disqualified,
        warning: x.warning,
        caution: x.caution,
        withdrawal: x.withdrawal,
        finish: x.finish,
        record200m: x.record_200m,
        speed200m: x.speed_200m,
      });
    }
  }
  console.log(`     손상 경주: ${damagedRaceIds.length}건 / 손상 행: ${snapshot.length}건`);
  console.log(`     손상 날짜(구장×날짜): ${damagedDateSet.size}건`);

  // ---------------------------------------------------------------- 4. 이름 불일치율 (방법 B)
  // 출주표 racer_id → racer_profiles.name 과 race_results.name 을 대조한다.
  // 방법 A 와 독립적인 지표이므로 둘이 맞아떨어지면 범위 특정을 신뢰할 수 있다.
  console.log("\n4/5 이름 불일치율 (출주표 racer_id 대조)...");
  const profiles = await fetchAll<{ racer_id: string | null; name: string | null }>((from, to) =>
    sb.from("racer_profiles").select("racer_id, name").order("id", { ascending: true }).range(from, to),
  );
  const nameById = new Map<string, string>();
  for (const p of profiles) {
    if (p.racer_id && p.name) nameById.set(p.racer_id, p.name);
  }

  const pages = await fetchAll<{ id: number; date: string; venue: string }>((from, to) =>
    sb
      .from("decision_card_pages")
      .select("id, date, venue")
      .gte("date", `${SINCE_YEAR}-01-01`)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const pageById = new Map<number, { date: string; venue: string }>();
  for (const p of pages) pageById.set(p.id, { date: p.date, venue: p.venue });

  const dcRaces: Array<{ id: number; page_id: number; race_no: number }> = [];
  const pageIds = pages.map((p) => p.id);
  for (let i = 0; i < pageIds.length; i += ID_CHUNK) {
    const chunk = pageIds.slice(i, i + ID_CHUNK);
    const rows = await fetchAll<{ id: number; page_id: number; race_no: number }>((from, to) =>
      sb
        .from("decision_card_races")
        .select("id, page_id, race_no")
        .in("page_id", chunk)
        .order("id", { ascending: true })
        .range(from, to),
    );
    dcRaces.push(...rows);
  }
  const dcRaceById = new Map<number, { page_id: number; race_no: number }>();
  for (const d of dcRaces) dcRaceById.set(d.id, { page_id: d.page_id, race_no: d.race_no });

  /** "date|venue|raceNo|backNo" → racer_id */
  const racerIdByCell = new Map<string, string>();
  const dcRaceIds = dcRaces.map((d) => d.id);
  for (let i = 0; i < dcRaceIds.length; i += ID_CHUNK) {
    const chunk = dcRaceIds.slice(i, i + ID_CHUNK);
    const rows = await fetchAll<{ dc_race_id: number; back_no: number; racer_id: string | null }>((from, to) =>
      sb
        .from("decision_card_entries")
        .select("dc_race_id, back_no, racer_id")
        .in("dc_race_id", chunk)
        .order("id", { ascending: true })
        .range(from, to),
    );
    for (const e of rows) {
      const dr = dcRaceById.get(e.dc_race_id);
      if (!dr) continue;
      const p = pageById.get(dr.page_id);
      if (!p || !e.racer_id) continue;
      racerIdByCell.set(`${p.date}|${p.venue}|${dr.race_no}|${e.back_no}`, e.racer_id);
    }
  }

  const mismatch = new Map<string, { compared: number; mismatched: number }>();
  for (const [raceId, arr] of byRace) {
    const r = raceById.get(raceId);
    if (!r || !r.venue) continue;
    let agg = mismatch.get(r.venue);
    if (!agg) {
      agg = { compared: 0, mismatched: 0 };
      mismatch.set(r.venue, agg);
    }
    for (const x of arr) {
      const rid = racerIdByCell.get(`${r.date}|${r.venue}|${r.race_no}|${x.back_no}`);
      if (!rid) continue;
      const expected = nameById.get(rid);
      if (!expected) continue;
      agg.compared += 1;
      if (expected !== x.name) agg.mismatched += 1;
    }
  }

  const venueNameMismatch = [...mismatch.entries()]
    .map(([venue, v]) => ({
      venue,
      compared: v.compared,
      mismatched: v.mismatched,
      ratePct: v.compared > 0 ? Math.round((1000 * v.mismatched) / v.compared) / 10 : 0,
    }))
    .sort((a, b) => a.venue.localeCompare(b.venue));
  for (const m of venueNameMismatch) {
    console.log(`     ${m.venue}: ${m.mismatched}/${m.compared} (${m.ratePct}%)`);
  }

  // ---------------------------------------------------------------- 5. 저장
  console.log("\n5/5 저장...");
  const damagedDates = [...damagedDateSet.entries()]
    .map(([k, races_]) => {
      const [venue, date] = k.split("|");
      return { venue, date, races: races_ };
    })
    .sort((a, b) => a.venue.localeCompare(b.venue) || a.date.localeCompare(b.date));

  const damagedSummary = [...perVenueYear.entries()]
    .map(([k, v]) => {
      const [venue, year] = k.split("|");
      return { venue, year: Number(year), dates: v.dates.size, races: v.races, rows: v.rows };
    })
    .sort((a, b) => a.venue.localeCompare(b.venue) || a.year - b.year);

  snapshot.sort(
    (a, b) =>
      a.venue.localeCompare(b.venue) ||
      a.date.localeCompare(b.date) ||
      a.raceNo - b.raceNo ||
      a.backNo - b.backNo,
  );

  const payload = {
    kind: "changwon-busan-race-results-recovery-baseline",
    generatedAt: startedAt,
    readOnly: true,
    incident: {
      whenUTC: "2026-10-13T01:29~01:35Z",
      cause:
        "scripts/seed/seed-races.ts 의 race_id 맵이 venue 를 빼고 (year|round|day|race_no) 만 키로 써서, 광명 전용 yearly-race-detail 데이터가 창원·부산 race_id 에 upsert 됐다",
      aggravating: [
        "races upsert onConflict 가 (year,round,day,race_no) 로 실제 제약 (…,venue) 과 불일치해 전량 실패했으나 console.error 만 하고 진행했다",
        "race_id 조회에 .order() 가 없어 어느 구장이 맵을 차지하는지 비결정적이다 — 재실행 시 손상 패턴이 달라진다",
      ],
      restoreUnavailable: "무료 요금제 — PITR 백업 복원 불가",
    },
    method: {
      A_signature:
        "같은 (year,round,day,race_no) 의 광명 경주와 선수명 배열(차번 순)이 완전히 동일하면 손상으로 본다",
      B_nameMismatch:
        "decision_card_entries.racer_id → racer_profiles.name 과 race_results.name 대조",
      scope: `races.year >= ${SINCE_YEAR} (창원·부산 적재 시작 연도)`,
      caveats: [
        "손상 전 기준선이 없어 방법 A·B 모두 사후 추정이다",
        "광명 자체 불일치율은 개명·동명이인 등 기저 노이즈로 보이며, 손상분과 완벽히 분리되지 않는다",
        "광명 행 자체가 오래된 연도 파일 값으로 후퇴했을 가능성은 이 방법으로 잡지 못한다",
      ],
    },
    tableCounts,
    venueNameMismatch,
    damagedSummary,
    damagedTotals: {
      venueDates: damagedDates.length,
      races: damagedRaceIds.length,
      rows: snapshot.length,
      firstDate: damagedDates.length > 0 ? damagedDates.reduce((m, d) => (d.date < m ? d.date : m), damagedDates[0].date) : null,
      lastDate: damagedDates.length > 0 ? damagedDates.reduce((m, d) => (d.date > m ? d.date : m), damagedDates[0].date) : null,
    },
    damagedDates,
    damagedRows: snapshot,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(OUT_DIR, `baseline-${stamp}.json`);
  // pretty print 하지 않는다 — 2만 행이라 파일이 몇 배로 커진다
  fs.writeFileSync(jsonPath, JSON.stringify(payload), "utf-8");
  console.log(`     ${path.relative(process.cwd(), jsonPath)} (${(fs.statSync(jsonPath).size / 1024 / 1024).toFixed(2)} MB)`);

  const md = [
    `# 복구 기준선 — ${startedAt}`,
    "",
    "읽기 전용 조사 결과. 복구(재수집) 전 상태를 행 단위로 고정한 것이다.",
    "복구는 upsert 덮어쓰기라 되돌릴 수 없고, 무료 요금제라 PITR 복원도 불가하다.",
    "따라서 이 파일이 유일한 대조 기준이다.",
    "",
    "## 테이블 건수",
    "",
    "| 테이블 | 건수 | 최종일자 |",
    "|---|---|---|",
    ...tables.map((t) => `| ${t} | ${tableCounts[t].count} | ${tableCounts[t].maxDate ?? "-"} |`),
    "",
    "## 이름 불일치율 (방법 B)",
    "",
    "| 구장 | 대조 행 | 불일치 | 비율 |",
    "|---|---|---|---|",
    ...venueNameMismatch.map((m) => `| ${m.venue} | ${m.compared} | ${m.mismatched} | ${m.ratePct}% |`),
    "",
    "## 손상 범위 (방법 A)",
    "",
    "| 구장 | 연도 | 날짜 | 경주 | 행 |",
    "|---|---|---|---|---|",
    ...damagedSummary.map((d) => `| ${d.venue} | ${d.year} | ${d.dates} | ${d.races} | ${d.rows} |`),
    "",
    `**합계: ${damagedDates.length} (구장×날짜) / ${damagedRaceIds.length} 경주 / ${snapshot.length} 행**`,
    `기간: ${payload.damagedTotals.firstDate} ~ ${payload.damagedTotals.lastDate}`,
    "",
    "## 복구 성공 판정 기준",
    "",
    "1. 창원·부산 이름 불일치율이 광명 수준(기저 노이즈)까지 내려간다",
    "2. 방법 A 손상 경주가 0 에 가까워진다",
    "3. `npm run verify:falls` 40개 단정 전부 통과 (현재 4개 실패 — 같은 디렉터리의 verify-falls-*.txt 참조)",
    "4. 광명 불일치율은 **변하지 않는다** (광명을 건드리면 안 된다)",
    "",
    "## 주의",
    "",
    "- 이 스크립트의 계산 방법을 바꾸면 before/after 비교가 무의미해진다. 바꾸지 말 것",
    "- `damagedRows` 는 **손상된 현재 값**이다. 되돌림용으로 쓰면 손상 상태로 되돌아간다",
    "",
  ].join("\n");
  const mdPath = path.join(OUT_DIR, `baseline-${stamp}.md`);
  fs.writeFileSync(mdPath, md, "utf-8");
  console.log(`     ${path.relative(process.cwd(), mdPath)}`);

  console.log("\n=== 완료 (DB 에 쓰지 않았다) ===");
}

void main().catch((e) => {
  console.error("실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
