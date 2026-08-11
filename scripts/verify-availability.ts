// ============================================================
// /racers 가용율 — 구(TS 페이지네이션) vs 신(fn_racer_availability RPC) 결과 대조
//
// 목적: RPC 전환이 "빨라졌는가"가 아니라 "같은 값을 내는가"를 검증한다.
// 구 로직은 anon 3초 타임아웃으로 실서비스에서 늘 실패했으므로 화면값과는 비교 불가.
// 따라서 여기서는 service_role 키(타임아웃 8초)로 구 로직을 그대로 재현해 정답을 만든다.
//
// ⚠️ 2026-08-11 실행 결과: 구 로직은 .order() 없는 OFFSET 페이지네이션이라
//    실행할 때마다 값이 달라진다(중복 1,700여 건). 즉 이 스크립트의 "구 로직" 쪽은
//    정답이 아니라 버그 재현이다. 결정적 비교는 diag-availability.ts 를 볼 것.
//
// 구 로직 코드는 커밋 05dbe94 시점 src/lib/racer-availability.ts 에서 그대로
// 복사해왔다. 임의 수정 금지 — 수정하면 대조의 의미가 없다.
//
// 실행: npx tsx scripts/verify-availability.ts
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceKey || !anonKey) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 모두 필요합니다."
  );
  process.exit(1);
}

// 구 로직용: service_role (statement_timeout 미설정 → authenticator 8초 상속)
const admin = createClient(supabaseUrl, serviceKey);
// 신 로직용: anon — 실제 /racers 페이지와 동일한 조건에서 재는 것이 의미 있다
const anon = createClient(supabaseUrl, anonKey);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface Rec {
  recent30: number;
  recent90: number;
  lastRaceDate: string | null;
  totalDays: number;
}

// ---------- 구 로직 (원본 그대로) ----------
async function legacy(cutoff90Str: string, cutoff30Str: string) {
  const supabase = admin;

  const idToName = new Map<string, string>();
  const nameToIds = new Map<string, Set<string>>();
  {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("racer_ids")
        .select("racer_id, name")
        .gte("year", 2024)
        .range(offset, offset + 999);
      if (error) throw new Error(`racer_ids fetch failed: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const r of data) {
        if (!r.racer_id || !r.name) continue;
        const name = r.name.replace(/\s+/g, "");
        if (!idToName.has(r.racer_id)) idToName.set(r.racer_id, name);
        if (!nameToIds.has(name)) nameToIds.set(name, new Set());
        nameToIds.get(name)!.add(r.racer_id);
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  interface RawEntry {
    racer_id: string | null;
    is_absent: boolean | null;
    decision_card_races: {
      decision_card_pages: { date: string };
    } | null;
  }
  const entries: RawEntry[] = [];
  {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("decision_card_entries")
        .select(
          "racer_id, is_absent, decision_card_races!inner(decision_card_pages!inner(date))"
        )
        .gte("decision_card_races.decision_card_pages.date", cutoff90Str)
        .range(offset, offset + 999);
      if (error) throw new Error(`entries fetch failed: ${error.message}`);
      if (!data || data.length === 0) break;
      entries.push(...(data as unknown as RawEntry[]));
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

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

  const dupNames: string[] = [];
  for (const name of tally.keys()) {
    const ids = nameToIds.get(name);
    if (ids && ids.size > 1) dupNames.push(name);
  }

  const availability: Record<string, Rec> = {};
  for (const [name, rec] of tally.entries()) {
    availability[name] = {
      recent30: rec.recent30,
      recent90: rec.recent90,
      lastRaceDate: rec.maxDate,
      totalDays: rec.dates.size,
    };
  }

  // 이름 → racer_id 집합 (필드 대조용)
  const ids: Record<string, string[]> = {};
  for (const name of Object.keys(availability)) {
    ids[name] = [...(nameToIds.get(name) ?? [])].sort();
  }

  return { availability, ids, dupNames, totalEntries: entries.length };
}

// ---------- 신 로직 (RPC) ----------
interface AvailabilityRow {
  racer_name: string;
  racer_ids: string[] | null;
  recent30: number;
  recent90: number;
  last_race_date: string | null;
  total_days: number;
  total_entries: number;
}

async function viaRpc(cutoff90Str: string, cutoff30Str: string) {
  const { data, error } = await anon.rpc("fn_racer_availability", {
    p_cutoff90: cutoff90Str,
    p_cutoff30: cutoff30Str,
  });
  if (error) throw new Error(`availability rpc failed: ${error.message}`);
  const rows = (data ?? []) as AvailabilityRow[];

  const availability: Record<string, Rec> = {};
  const ids: Record<string, string[]> = {};
  const dupNames: string[] = [];
  for (const r of rows) {
    availability[r.racer_name] = {
      recent30: r.recent30,
      recent90: r.recent90,
      lastRaceDate: r.last_race_date,
      totalDays: r.total_days,
    };
    ids[r.racer_name] = [...(r.racer_ids ?? [])].sort();
    if ((r.racer_ids?.length ?? 0) > 1) dupNames.push(r.racer_name);
  }
  return { availability, ids, dupNames, totalEntries: rows[0]?.total_entries ?? 0 };
}

async function main() {
  const today = new Date();
  const cutoff90 = new Date(today);
  cutoff90.setDate(cutoff90.getDate() - 90);
  const cutoff30 = new Date(today);
  cutoff30.setDate(cutoff30.getDate() - 30);
  const c90 = isoDate(cutoff90);
  const c30 = isoDate(cutoff30);
  console.log(`기준일: ${isoDate(today)}  (cutoff90=${c90}, cutoff30=${c30})\n`);

  console.log("구 로직 실행 중 (service_role, 페이지네이션)...");
  const t0 = Date.now();
  const old = await legacy(c90, c30);
  const oldMs = Date.now() - t0;
  console.log(`  → ${oldMs}ms, 원본 엔트리 ${old.totalEntries}건\n`);

  console.log("RPC 실행 중 (anon, 실제 페이지와 동일 조건)...");
  const t1 = Date.now();
  const neu = await viaRpc(c90, c30);
  const rpcMs = Date.now() - t1;
  console.log(`  → ${rpcMs}ms, 원본 엔트리 ${neu.totalEntries}건\n`);

  const oldNames = Object.keys(old.availability);
  const newNames = Object.keys(neu.availability);
  const allNames = [...new Set([...oldNames, ...newNames])].sort();

  const onlyOld: string[] = [];
  const onlyNew: string[] = [];
  const mismatches: string[] = [];
  let exact = 0;

  for (const n of allNames) {
    const a = old.availability[n];
    const b = neu.availability[n];
    if (a && !b) {
      onlyOld.push(n);
      continue;
    }
    if (!a && b) {
      onlyNew.push(n);
      continue;
    }
    const diffs: string[] = [];
    if (a.recent30 !== b.recent30) diffs.push(`recent30 ${a.recent30}→${b.recent30}`);
    if (a.recent90 !== b.recent90) diffs.push(`recent90 ${a.recent90}→${b.recent90}`);
    if (a.lastRaceDate !== b.lastRaceDate)
      diffs.push(`last_race_date ${a.lastRaceDate}→${b.lastRaceDate}`);
    if (a.totalDays !== b.totalDays) diffs.push(`total_days ${a.totalDays}→${b.totalDays}`);
    const ia = (old.ids[n] ?? []).join(",");
    const ib = (neu.ids[n] ?? []).join(",");
    if (ia !== ib) diffs.push(`racer_ids [${ia}]→[${ib}]`);
    if (diffs.length === 0) exact++;
    else mismatches.push(`${n}: ${diffs.join(" | ")}`);
  }

  console.log("=".repeat(60));
  console.log(`기존 로직: ${oldNames.length}명`);
  console.log(`RPC:       ${newNames.length}명`);
  console.log(`완전 일치: ${exact}명`);
  console.log(`불일치:    ${mismatches.length + onlyOld.length + onlyNew.length}명`);
  console.log("=".repeat(60));

  if (onlyOld.length) {
    console.log(`\n[구 로직에만 있음] ${onlyOld.length}명`);
    for (const n of onlyOld) console.log(`  - ${n}: ${JSON.stringify(old.availability[n])}`);
  }
  if (onlyNew.length) {
    console.log(`\n[RPC에만 있음] ${onlyNew.length}명`);
    for (const n of onlyNew) console.log(`  - ${n}: ${JSON.stringify(neu.availability[n])}`);
  }
  if (mismatches.length) {
    console.log(`\n[필드 불일치] ${mismatches.length}명`);
    for (const m of mismatches) console.log(`  - ${m}`);
  }

  // 부가 항목
  const oldDup = [...old.dupNames].sort();
  const newDup = [...neu.dupNames].sort();
  console.log(`\ndupNames: 구 ${oldDup.length}명 / RPC ${newDup.length}명`);
  if (oldDup.join(",") !== newDup.join(",")) {
    console.log(`  ⚠️ 불일치`);
    console.log(`  구 : ${oldDup.join(", ")}`);
    console.log(`  RPC: ${newDup.join(", ")}`);
  }
  console.log(
    `totalEntries: 구 ${old.totalEntries} / RPC ${neu.totalEntries} ${
      old.totalEntries === neu.totalEntries ? "✅" : "⚠️ 불일치"
    }`
  );
  console.log(`\n소요시간: 구 ${oldMs}ms / RPC ${rpcMs}ms`);

  const ok =
    mismatches.length === 0 &&
    onlyOld.length === 0 &&
    onlyNew.length === 0 &&
    oldDup.join(",") === newDup.join(",") &&
    old.totalEntries === neu.totalEntries;
  console.log(`\n판정: ${ok ? "✅ 완전 일치" : "❌ 불일치 (구 로직 비결정성 때문일 수 있음 → diag-availability.ts 확인)"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
