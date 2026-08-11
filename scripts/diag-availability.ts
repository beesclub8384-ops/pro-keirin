// ============================================================
// 진단: 정렬 없는 .range() 페이지네이션이 결정적인가?
//
// 2026-08-11 실측 결과 (최근 90일 decision_card_entries, 7,454행):
//   무순서 fetch 1회차 → 고유 id 5,720 (중복 1,734)
//   무순서 fetch 2회차 → 고유 id 6,263 (중복 1,191)
//   두 회차의 고유 id 집합이 서로 다름 → 같은 쿼리인데 결과가 매번 달라진다
//   ORDER BY id 를 넣으면 7,454행 / 고유 7,454 / 중복 0, 2회 재현 동일
//
// PostgREST 의 .range() 는 SQL OFFSET/LIMIT 으로 번역되는데, ORDER BY 가 없으면
// Postgres 는 행 순서를 보장하지 않는다(seq scan 시작 위치가 synchronize_seqscans
// 때문에 매번 달라질 수 있음). 그 결과 어떤 행은 두 페이지에 걸쳐 두 번 나오고,
// 어떤 행은 아예 안 나온다. 에러는 나지 않는다 — 전형적인 무음 실패.
//
// 같은 패턴이 다른 파일에도 있는지 의심될 때 이 스크립트로 재현할 수 있다.
// 대상 테이블/필터만 바꿔서 쓰면 된다.
//
// 실행: npx tsx scripts/diag-availability.ts
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface RawEntry {
  id: number;
  racer_id: string | null;
  is_absent: boolean | null;
  decision_card_races: { decision_card_pages: { date: string } } | null;
}

const SELECT =
  "id, racer_id, is_absent, decision_card_races!inner(decision_card_pages!inner(date))";

async function fetchEntries(cutoff90: string, ordered: boolean): Promise<RawEntry[]> {
  const out: RawEntry[] = [];
  let offset = 0;
  while (true) {
    let q = admin
      .from("decision_card_entries")
      .select(SELECT)
      .gte("decision_card_races.decision_card_pages.date", cutoff90);
    if (ordered) q = q.order("id", { ascending: true });
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...(data as unknown as RawEntry[]));
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

function idStats(rows: RawEntry[]) {
  const seen = new Set<number>();
  let dups = 0;
  for (const r of rows) {
    if (seen.has(r.id)) dups++;
    else seen.add(r.id);
  }
  return { total: rows.length, unique: seen.size, dups, ids: seen };
}

interface Rec {
  recent30: number;
  recent90: number;
  lastRaceDate: string | null;
  totalDays: number;
}

// 구 로직의 집계부(원본 그대로) — 입력 행 집합만 바꿔가며 쓴다
function aggregate(
  entries: RawEntry[],
  idToName: Map<string, string>,
  cutoff30Str: string
): Record<string, Rec> {
  const tally = new Map<
    string,
    { recent30: number; recent90: number; dates: Set<string>; maxDate: string | null }
  >();
  for (const e of entries) {
    if (e.is_absent) continue;
    if (!e.racer_id) continue;
    const name = idToName.get(e.racer_id);
    if (!name) continue;
    const date = e.decision_card_races?.decision_card_pages?.date;
    if (!date) continue;
    let rec = tally.get(name);
    if (!rec) {
      rec = { recent30: 0, recent90: 0, dates: new Set(), maxDate: null };
      tally.set(name, rec);
    }
    rec.recent90++;
    if (date >= cutoff30Str) rec.recent30++;
    rec.dates.add(date);
    if (!rec.maxDate || date > rec.maxDate) rec.maxDate = date;
  }
  const out: Record<string, Rec> = {};
  for (const [name, rec] of tally.entries()) {
    out[name] = {
      recent30: rec.recent30,
      recent90: rec.recent90,
      lastRaceDate: rec.maxDate,
      totalDays: rec.dates.size,
    };
  }
  return out;
}

function compare(label: string, a: Record<string, Rec>, b: Record<string, Rec>) {
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  let exact = 0;
  const diffs: string[] = [];
  for (const n of names) {
    const x = a[n];
    const y = b[n];
    if (!x || !y) {
      diffs.push(`${n}: ${!x ? "좌측 없음" : "우측 없음"}`);
      continue;
    }
    const d: string[] = [];
    if (x.recent30 !== y.recent30) d.push(`recent30 ${x.recent30}/${y.recent30}`);
    if (x.recent90 !== y.recent90) d.push(`recent90 ${x.recent90}/${y.recent90}`);
    if (x.lastRaceDate !== y.lastRaceDate)
      d.push(`last ${x.lastRaceDate}/${y.lastRaceDate}`);
    if (x.totalDays !== y.totalDays) d.push(`days ${x.totalDays}/${y.totalDays}`);
    if (d.length === 0) exact++;
    else diffs.push(`${n}: ${d.join(" | ")}`);
  }
  console.log(`\n[${label}] 이름 ${names.length}개 중 일치 ${exact} / 불일치 ${diffs.length}`);
  for (const d of diffs.slice(0, 15)) console.log(`   - ${d}`);
  if (diffs.length > 15) console.log(`   ... 외 ${diffs.length - 15}건`);
  return diffs.length === 0;
}

async function main() {
  const today = new Date();
  const c90d = new Date(today);
  c90d.setDate(c90d.getDate() - 90);
  const c30d = new Date(today);
  c30d.setDate(c30d.getDate() - 30);
  const c90 = isoDate(c90d);
  const c30 = isoDate(c30d);
  console.log(`cutoff90=${c90}, cutoff30=${c30}\n`);

  // racer_id → name (구 로직과 동일)
  const idToName = new Map<string, string>();
  {
    let offset = 0;
    while (true) {
      const { data, error } = await admin
        .from("racer_ids")
        .select("racer_id, name")
        .gte("year", 2024)
        .range(offset, offset + 999);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const r of data) {
        if (!r.racer_id || !r.name) continue;
        const nm = r.name.replace(/\s+/g, "");
        if (!idToName.has(r.racer_id)) idToName.set(r.racer_id, nm);
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
  console.log(`racer_ids 매핑: ${idToName.size}건\n`);

  // ---- A) 무순서 fetch 2회 ----
  console.log("A) 구 로직 fetch(무순서) 2회 실행");
  const a1 = await fetchEntries(c90, false);
  const a2 = await fetchEntries(c90, false);
  const s1 = idStats(a1);
  const s2 = idStats(a2);
  console.log(`   1회차: 가져온 행 ${s1.total}, 고유 id ${s1.unique}, 중복 ${s1.dups}`);
  console.log(`   2회차: 가져온 행 ${s2.total}, 고유 id ${s2.unique}, 중복 ${s2.dups}`);
  const sameIds =
    s1.unique === s2.unique && [...s1.ids].every((i) => s2.ids.has(i));
  console.log(`   두 회차의 고유 id 집합 동일? ${sameIds ? "예" : "아니오"}`);
  compare("A: 1회차 vs 2회차", aggregate(a1, idToName, c30), aggregate(a2, idToName, c30));

  // ---- B) ORDER BY id fetch vs RPC ----
  console.log("\nB) ORDER BY id 를 넣은 fetch");
  const b1 = await fetchEntries(c90, true);
  const b2 = await fetchEntries(c90, true);
  const sb1 = idStats(b1);
  const sb2 = idStats(b2);
  console.log(`   1회차: 가져온 행 ${sb1.total}, 고유 id ${sb1.unique}, 중복 ${sb1.dups}`);
  console.log(`   2회차: 가져온 행 ${sb2.total}, 고유 id ${sb2.unique}, 중복 ${sb2.dups}`);
  const orderedAgg = aggregate(b1, idToName, c30);
  compare("B: 정렬 fetch 1회차 vs 2회차", orderedAgg, aggregate(b2, idToName, c30));

  // RPC
  const { data, error } = await anon.rpc("fn_racer_availability", {
    p_cutoff90: c90,
    p_cutoff30: c30,
  });
  if (error) throw new Error(error.message);
  const rpcAgg: Record<string, Rec> = {};
  for (const r of data as Array<{
    racer_name: string;
    recent30: number;
    recent90: number;
    last_race_date: string | null;
    total_days: number;
  }>) {
    rpcAgg[r.racer_name] = {
      recent30: r.recent30,
      recent90: r.recent90,
      lastRaceDate: r.last_race_date,
      totalDays: r.total_days,
    };
  }
  const ok = compare("B: 정렬 fetch vs RPC", orderedAgg, rpcAgg);

  console.log(
    `\n결론: 정렬 fetch(구 집계 로직) 와 RPC 가 ${ok ? "완전 일치 ✅" : "불일치 ❌"}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
