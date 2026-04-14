import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function totalCount(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) { console.log(`  ❌ ${table}: ${error.message}`); return -1; }
  return count ?? 0;
}

async function countByYear(table: string, yearCol = "year") {
  // First get distinct years
  const { data: yearData, error: yearErr } = await supabase
    .from(table)
    .select(yearCol)
    .order(yearCol, { ascending: true })
    .limit(1);

  if (yearErr) {
    console.log(`  ❌ ${table}: ${yearErr.message}`);
    return;
  }

  // Get total count
  const total = await totalCount(table);

  // Get distinct years by querying min and max, then checking each
  const { data: minRow } = await supabase.from(table).select(yearCol).order(yearCol, { ascending: true }).limit(1);
  const { data: maxRow } = await supabase.from(table).select(yearCol).order(yearCol, { ascending: false }).limit(1);

  if (!minRow?.length || !maxRow?.length) {
    console.log(`  ⚠️  ${table}: 0건`);
    return;
  }

  const minYear = minRow[0][yearCol];
  const maxYear = maxRow[0][yearCol];

  console.log(`  ✅ ${table} (총 ${total}건):`);

  for (let y = minYear; y <= maxYear; y++) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(yearCol, y);
    if (error) continue;
    if (count && count > 0) {
      console.log(`     ${y}년: ${count}건`);
    }
  }
}

async function countByForeignYear(table: string, fkTable: string, fkCol: string) {
  const total = await totalCount(table);
  console.log(`  ✅ ${table} (총 ${total}건) — ${fkTable} 참조`);
}

async function countStatsByType() {
  const types = ["dividend", "sales", "high-dividend", "no-hit"];
  console.log(`  ✅ statistics_data:`);
  for (const type of types) {
    const { count } = await supabase
      .from("statistics_data")
      .select("*", { count: "exact", head: true })
      .eq("stat_type", type);

    // Get years for this type
    const { data } = await supabase
      .from("statistics_data")
      .select("year")
      .eq("stat_type", type)
      .not("year", "is", null)
      .order("year");

    const years = data?.map(r => r.year) || [];
    console.log(`     ${type}: ${count}건 (${years.length > 0 ? `${years[0]}~${years[years.length-1]}` : "null"})`);
  }
}

async function main() {
  console.log("=== Supabase DB 데이터 점검 ===\n");

  console.log("📊 경주 관련:");
  await countByYear("races");
  await countByForeignYear("race_results", "races", "race_id");
  await countByForeignYear("race_odds", "races", "race_id");

  console.log("\n📋 출주표(Decision Card):");
  await countByYear("decision_card_pages");
  const dcRaceTotal = await totalCount("decision_card_races");
  console.log(`  ✅ decision_card_races: ${dcRaceTotal}건`);
  const dcEntryTotal = await totalCount("decision_card_entries");
  console.log(`  ✅ decision_card_entries: ${dcEntryTotal}건`);

  console.log("\n👤 선수 관련:");
  await countByYear("racer_profiles");
  await countByYear("rankings");
  await countByYear("racer_ids");

  console.log("\n📈 통계:");
  await countStatsByType();

  console.log("\n📋 기타:");
  await countByYear("entries");

  console.log("\n=== 점검 완료 ===");
}

main().catch(console.error);
