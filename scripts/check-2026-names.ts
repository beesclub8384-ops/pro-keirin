import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // 1. 2026년 DC pages
  const { data: pages } = await supabase
    .from("decision_card_pages")
    .select("id")
    .eq("year", 2026);
  const pageIds = pages!.map((p: { id: number }) => p.id);
  console.log("2026 pages:", pageIds.length);

  // 2. races
  const { data: races } = await supabase
    .from("decision_card_races")
    .select("id")
    .in("page_id", pageIds);
  const raceIds = races!.map((r: { id: number }) => r.id);
  console.log("2026 races:", raceIds.length);

  // 3. entries에서 racer_id 수집
  let allEntries: Array<{ racer_id: string; back_no: number; dc_race_id: number }> = [];
  for (let i = 0; i < raceIds.length; i += 200) {
    const chunk = raceIds.slice(i, i + 200);
    const { data } = await supabase
      .from("decision_card_entries")
      .select("racer_id, back_no, dc_race_id")
      .in("dc_race_id", chunk);
    if (data) allEntries.push(...(data as typeof allEntries));
  }
  const racerIds2026 = [...new Set(allEntries.map((e) => e.racer_id).filter(Boolean))];
  console.log("2026 unique racer_ids:", racerIds2026.length);

  // 4. racer_ids 테이블에서 매칭 확인
  const nameMap = new Map<string, Array<{ year: number; name: string }>>();
  for (let i = 0; i < racerIds2026.length; i += 200) {
    const chunk = racerIds2026.slice(i, i + 200);
    const { data } = await supabase
      .from("racer_ids")
      .select("racer_id, name, year")
      .in("racer_id", chunk)
      .order("year", { ascending: false });
    if (data) {
      for (const r of data as Array<{ racer_id: string; name: string; year: number }>) {
        if (!nameMap.has(r.racer_id)) nameMap.set(r.racer_id, []);
        nameMap.get(r.racer_id)!.push({ year: r.year, name: r.name });
      }
    }
  }

  // 5. 이름 없는 racer_id
  const missing = racerIds2026.filter((id) => !nameMap.has(id));
  console.log(`\n=== 이름 없는 racer_id (${missing.length}명) ===`);
  for (const id of missing.sort()) {
    console.log(`  ${id}`);
  }

  // 6. 연도별 매칭 현황
  const yearCounts: Record<number, number> = {};
  for (const [, records] of nameMap) {
    for (const r of records) {
      yearCounts[r.year] = (yearCounts[r.year] || 0) + 1;
    }
  }
  console.log("\n=== racer_ids 연도별 매칭 현황 ===");
  for (const y of Object.keys(yearCounts).sort()) {
    console.log(`  ${y}년: ${yearCounts[+y]}명`);
  }

  console.log(`\n=== 이름 매칭: ${nameMap.size}/${racerIds2026.length} ===`);
}

main().catch(console.error);
