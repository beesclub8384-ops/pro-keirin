import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DATA_DIR = path.join(process.cwd(), "src", "data");
const BATCH_SIZE = 500;

async function seedRaceOdds() {
  const filePath = path.join(DATA_DIR, "race-data.json");
  console.log("Loading race-data.json...");
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Array<{
    id: number;
    date: string;
    venue: string;
    gradeGroup: string;
    raceNo: number;
    odds: Record<string, number>;
  }>;

  console.log(`Loaded ${data.length} race odds records.`);

  // Build a map of races for linking race_id
  // Fetch all races from DB in batches by year
  const years = [...new Set(data.map((r) => parseInt(r.date.substring(0, 4), 10)))];
  const raceIdMap = new Map<string, number>();

  for (const year of years) {
    const { data: races, error } = await supabase
      .from("races")
      .select("id, date, race_no")
      .eq("year", year);
    if (error) {
      console.error(`Error fetching races for ${year}:`, error.message);
      continue;
    }
    for (const r of races || []) {
      raceIdMap.set(`${r.date}|${r.race_no}`, r.id);
    }
  }

  console.log(`Mapped ${raceIdMap.size} races for linking.`);

  const rows = data.map((r) => ({
    race_id: raceIdMap.get(`${r.date}|${r.raceNo}`) || null,
    date: r.date,
    race_no: r.raceNo,
    venue: r.venue || null,
    grade_group: r.gradeGroup || null,
    odds_win: r.odds?.["단승"] ?? null,
    odds_place_1st: r.odds?.["연승1착"] ?? null,
    odds_place_2nd: r.odds?.["연승2착"] ?? null,
    odds_exacta: r.odds?.["쌍승"] ?? null,
    odds_quinella: r.odds?.["복승"] ?? null,
    odds_trio: r.odds?.["삼복승"] ?? null,
    odds_trifecta: r.odds?.["삼쌍승"] ?? null,
    odds_duet: r.odds?.["쌍복승"] ?? null,
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("race_odds")
      .upsert(batch, { onConflict: "date,race_no", ignoreDuplicates: true });
    if (error) {
      console.error(`Error inserting odds batch ${i}:`, error.message);
    }
    if (i % 5000 === 0) {
      console.log(`  Inserted ${i}/${rows.length} odds...`);
    }
  }

  console.log("Done seeding race_odds.");
}

seedRaceOdds().catch(console.error);
