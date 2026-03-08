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

function getYears(subDir: string): number[] {
  const dir = path.join(DATA_DIR, subDir);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => parseInt(f.replace(".json", ""), 10))
    .sort((a, b) => a - b);
}

async function seedRacerProfiles() {
  const startYear = parseInt(process.env.START_YEAR || "0", 10);
  const endYear = parseInt(process.env.END_YEAR || "9999", 10);
  const allYears = getYears("yearly-racer-profile");
  const years = startYear ? allYears.filter((y) => y >= startYear && y <= endYear) : allYears;
  console.log(`Seeding racer profiles for ${years.length} years...`);

  for (const year of years) {
    const filePath = path.join(DATA_DIR, "yearly-racer-profile", `${year}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const profiles = data.profiles as Array<Record<string, unknown>>;

    console.log(`  ${year}: ${profiles.length} profiles`);

    const rows = profiles.map((p) => ({
      racer_id: p.racerId,
      name: p.name,
      year: p.year,
      birth_year: p.birthYear || null,
      height: p.height || null,
      weight: p.weight || null,
      blood_type: p.bloodType || null,
      grade_change: p.gradeChange || null,
      win_rate: p.winRate ?? null,
      top2_rate: p.top2Rate ?? null,
      top3_rate: p.top3Rate ?? null,
      race_count: p.raceCount ?? null,
      run_days: p.runDays ?? null,
      recent3_score: p.recent3Score ?? null,
      recent3_rank: p.recent3Rank ?? null,
      total_avg_score: p.totalAvgScore ?? null,
      total_rank_score: p.totalRankScore ?? null,
      recent_200m: p.recent200m || null,
      training: p.training || null,
      tactics: p.tactics ?? null,
      violations: p.violations ?? null,
      indices: p.indices ?? null,
    }));

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("racer_profiles")
        .upsert(batch, { onConflict: "racer_id,year" });
      if (error) console.error(`  Error inserting profiles batch ${i}:`, error.message);
    }
  }

  console.log("Done seeding racer_profiles.");
}

seedRacerProfiles().catch(console.error);
