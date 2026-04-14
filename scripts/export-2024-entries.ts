// 2024년 전체 출주표 데이터를 JSON으로 추출
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

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
  // 1. pages
  const pages = await fetchAll<{ id: number; round: number; day: number }>(
    () => sb.from("decision_card_pages").select("id, round, day").eq("year", 2024).order("round").order("day")
  );
  console.log(`pages: ${pages.length}`);
  const pageMap = new Map(pages.map(p => [p.id, p]));
  const pageIds = pages.map(p => p.id);

  // 2. races
  const races: { id: number; page_id: number; race_no: number; race_type: string }[] = [];
  for (let i = 0; i < pageIds.length; i += 200) {
    const chunk = pageIds.slice(i, i + 200);
    const rows = await fetchAll<{ id: number; page_id: number; race_no: number; race_type: string }>(
      () => sb.from("decision_card_races").select("id, page_id, race_no, race_type").in("page_id", chunk)
    );
    races.push(...rows);
  }
  console.log(`races: ${races.length}`);

  // 3. entries
  const raceIds = races.map(r => r.id);
  const entries: { dc_race_id: number; back_no: number; racer_id: string }[] = [];
  for (let i = 0; i < raceIds.length; i += 200) {
    const chunk = raceIds.slice(i, i + 200);
    const rows = await fetchAll<{ dc_race_id: number; back_no: number; racer_id: string }>(
      () => sb.from("decision_card_entries").select("dc_race_id, back_no, racer_id")
        .in("dc_race_id", chunk).not("racer_id", "is", null)
    );
    entries.push(...rows);
  }
  console.log(`entries: ${entries.length}`);

  // 4. racer_id → name
  const racerIdSet = new Set(entries.map(e => e.racer_id).filter(Boolean));
  const racerIds = [...racerIdSet];
  const nameMap = new Map<string, string>();

  for (let i = 0; i < racerIds.length; i += 200) {
    const chunk = racerIds.slice(i, i + 200);
    const rows = await fetchAll<{ racer_id: string; name: string }>(
      () => sb.from("racer_ids").select("racer_id, name").eq("year", 2024).in("racer_id", chunk)
    );
    for (const r of rows) nameMap.set(r.racer_id, r.name);
  }
  const missing = racerIds.filter(id => !nameMap.has(id));
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200);
    const rows = await fetchAll<{ racer_id: string; name: string }>(
      () => sb.from("racer_ids").select("racer_id, name").in("racer_id", chunk)
        .order("year", { ascending: false })
    );
    for (const r of rows) if (!nameMap.has(r.racer_id)) nameMap.set(r.racer_id, r.name);
  }
  console.log(`names: ${nameMap.size}`);

  // 5. 조립
  // race별 entries 그룹핑
  const raceEntries = new Map<number, { back_no: number; name: string }[]>();
  for (const e of entries) {
    if (!raceEntries.has(e.dc_race_id)) raceEntries.set(e.dc_race_id, []);
    const raw = nameMap.get(e.racer_id) || e.racer_id;
    raceEntries.get(e.dc_race_id)!.push({ back_no: e.back_no, name: raw.replace(/\s+/g, "") });
  }

  // 정렬: round → day → race_no
  const sorted = races
    .map(r => {
      const pg = pageMap.get(r.page_id)!;
      const ents = (raceEntries.get(r.id) || []).sort((a, b) => a.back_no - b.back_no);
      const names: string[] = [];
      for (let bn = 1; bn <= 7; bn++) {
        const found = ents.find(e => e.back_no === bn);
        names.push(found ? found.name : "");
      }
      return {
        round: pg.round,
        day: pg.day,
        race_no: r.race_no,
        race_type: r.race_type || "",
        names,
      };
    })
    .sort((a, b) => a.round - b.round || a.day - b.day || a.race_no - b.race_no);

  const outPath = path.resolve(process.cwd(), "scripts/2024-entries-export.json");
  fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2), "utf-8");
  console.log(`\n출력: ${outPath} (${sorted.length}경주)`);
}

main().catch(console.error);
