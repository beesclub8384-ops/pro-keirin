import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Get 2026 page IDs
  const { data: pages } = await supabase
    .from("decision_card_pages")
    .select("id")
    .eq("year", 2026);
  const pageIds = pages!.map((p: { id: number }) => p.id);

  // Get race IDs
  const { data: races } = await supabase
    .from("decision_card_races")
    .select("id")
    .in("page_id", pageIds);
  const raceIds = races!.map((r: { id: number }) => r.id);

  // Count is_absent = true
  const { count: absentCount } = await supabase
    .from("decision_card_entries")
    .select("*", { count: "exact", head: true })
    .in("dc_race_id", raceIds)
    .eq("is_absent", true);

  const { count: totalCount } = await supabase
    .from("decision_card_entries")
    .select("*", { count: "exact", head: true })
    .in("dc_race_id", raceIds);

  console.log(`2026년 DC entries: ${totalCount}건`);
  console.log(`결장(is_absent=true): ${absentCount}건`);

  // Show absent entries
  const { data: absentRows } = await supabase
    .from("decision_card_entries")
    .select("dc_race_id, back_no, racer_id, is_absent")
    .in("dc_race_id", raceIds)
    .eq("is_absent", true);

  if (absentRows) {
    console.log("\n결장 선수 목록:");
    for (const r of absentRows) {
      console.log(`  race_id=${r.dc_race_id}, backNo=${r.back_no}, racerId=${r.racer_id}`);
    }
  }
}

main().catch(console.error);
