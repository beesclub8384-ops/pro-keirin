// 2024년 두 테이블 슬롯 수 차이 원인 분석
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!.trim()
);

async function fetchAll<T>(buildQuery: () => any): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function main() {
  // ===== 1. 각 테이블 정확한 건수 =====
  console.log("=== 1. 각 테이블 2024년 건수 ===\n");

  // entries 테이블 (date 기준)
  const entriesRows = await fetchAll<{ date: string; race_no: number; back_no: number; racer_name: string }>(
    () => sb.from("entries").select("date, race_no, back_no, racer_name")
      .gte("date", "2024-01-01").lte("date", "2024-12-31")
  );
  console.log(`entries 테이블: ${entriesRows.length}건`);

  // decision_card 체인
  const pages = await fetchAll<{ id: number; round: number; day: number; date: string }>(
    () => sb.from("decision_card_pages").select("id, round, day, date").eq("year", 2024)
  );
  const pageMap = new Map(pages.map(p => [p.id, p]));
  const pageIds = pages.map(p => p.id);

  const races: { id: number; page_id: number; race_no: number; race_type: string }[] = [];
  for (let i = 0; i < pageIds.length; i += 200) {
    const chunk = pageIds.slice(i, i + 200);
    const rows = await fetchAll<{ id: number; page_id: number; race_no: number; race_type: string }>(
      () => sb.from("decision_card_races").select("id, page_id, race_no, race_type").in("page_id", chunk)
    );
    races.push(...rows);
  }
  const raceMap = new Map(races.map(r => [r.id, r]));

  const raceIds = races.map(r => r.id);
  const dcEntries: { dc_race_id: number; back_no: number; racer_id: string }[] = [];
  for (let i = 0; i < raceIds.length; i += 200) {
    const chunk = raceIds.slice(i, i + 200);
    // racer_id null 포함 전체
    const rows = await fetchAll<{ dc_race_id: number; back_no: number; racer_id: string | null }>(
      () => sb.from("decision_card_entries").select("dc_race_id, back_no, racer_id").in("dc_race_id", chunk)
    );
    dcEntries.push(...(rows as any));
  }
  console.log(`decision_card_entries: ${dcEntries.length}건 (racer_id null 포함)`);
  const dcNonNull = dcEntries.filter(e => e.racer_id);
  console.log(`decision_card_entries (racer_id != null): ${dcNonNull.length}건`);
  console.log(`\n차이: entries(${entriesRows.length}) - dc_entries(${dcEntries.length}) = ${entriesRows.length - dcEntries.length}건`);

  // ===== 2. 경주별 슬롯 수 비교 =====
  console.log("\n=== 2. 경주별 슬롯 수 비교 ===\n");

  // entries: key = "date|race_no" → count
  const entriesByRace = new Map<string, { count: number; names: string[] }>();
  for (const e of entriesRows) {
    const key = `${e.date}|${e.race_no}`;
    if (!entriesByRace.has(key)) entriesByRace.set(key, { count: 0, names: [] });
    const g = entriesByRace.get(key)!;
    g.count++;
    g.names.push(`${e.back_no}:${e.racer_name?.replace(/\s+/g, "")}`);
  }

  // dc: key = "date|race_no" → count
  const dcByRace = new Map<string, { count: number; raceType: string; round: number; day: number; entries: string[] }>();
  for (const e of dcEntries) {
    const race = raceMap.get(e.dc_race_id);
    if (!race) continue;
    const page = pageMap.get(race.page_id);
    if (!page) continue;
    const key = `${page.date}|${race.race_no}`;
    if (!dcByRace.has(key)) dcByRace.set(key, { count: 0, raceType: race.race_type, round: page.round, day: page.day, entries: [] });
    const g = dcByRace.get(key)!;
    g.count++;
    g.entries.push(`${e.back_no}:${e.racer_id || "null"}`);
  }

  // 차이 찾기
  const diffs: string[] = [];

  // entries에 있고 dc에 없는 경주
  for (const [key, eg] of entriesByRace) {
    const dcg = dcByRace.get(key);
    if (!dcg) {
      diffs.push(`  entries에만 있음: ${key} (${eg.count}건)`);
    } else if (eg.count !== dcg.count) {
      diffs.push(`  슬롯 수 차이: ${key} (${dcg.round}회차 ${dcg.day}일차 ${key.split("|")[1]}경주 ${dcg.raceType}) → entries=${eg.count}, dc=${dcg.count}, 차이=${eg.count - dcg.count}`);
    }
  }
  // dc에 있고 entries에 없는 경주
  for (const [key, dcg] of dcByRace) {
    if (!entriesByRace.has(key)) {
      diffs.push(`  dc에만 있음: ${key} (${dcg.round}회차 ${dcg.day}일차 ${dcg.raceType}, ${dcg.count}건)`);
    }
  }

  if (diffs.length === 0) {
    console.log("차이 없음");
  } else {
    console.log(`차이 발견 ${diffs.length}건:`);
    for (const d of diffs) console.log(d);
  }

  // ===== 3. 차이 상세 =====
  console.log("\n=== 3. 차이 상세 ===\n");

  // entries에만 있는 경주의 상세 출력
  for (const [key, eg] of entriesByRace) {
    const dcg = dcByRace.get(key);
    if (!dcg) {
      console.log(`[entries에만 있음] ${key}:`);
      eg.names.sort().forEach(n => console.log(`    ${n}`));
    } else if (eg.count !== dcg.count) {
      const [date, raceNo] = key.split("|");
      console.log(`\n[슬롯 차이] ${dcg.round}회차 ${dcg.day}일차 ${raceNo}경주 (${dcg.raceType}) - ${date}`);
      console.log(`  entries(${eg.count}건): ${eg.names.sort().join(", ")}`);
      console.log(`  dc(${dcg.count}건): ${dcg.entries.sort().join(", ")}`);

      // entries에 있고 dc에 없는 back_no 찾기
      const entBackNos = new Set(eg.names.map(n => parseInt(n.split(":")[0])));
      const dcBackNos = new Set(dcg.entries.map(n => parseInt(n.split(":")[0])));
      const onlyInEntries = [...entBackNos].filter(b => !dcBackNos.has(b));
      const onlyInDc = [...dcBackNos].filter(b => !entBackNos.has(b));
      if (onlyInEntries.length) console.log(`  entries에만 있는 back_no: ${onlyInEntries.join(", ")}`);
      if (onlyInDc.length) console.log(`  dc에만 있는 back_no: ${onlyInDc.join(", ")}`);
    }
  }
}

main().catch(console.error);
