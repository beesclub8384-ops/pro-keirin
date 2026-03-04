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

async function seedRankings() {
  const filePath = path.join(DATA_DIR, "ranking-data.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Array<{
    year: number;
    totalRacers: number;
    rankings: Array<Record<string, unknown>>;
  }>;

  console.log(`Seeding rankings for ${data.length} years...`);

  for (const yearData of data) {
    console.log(`  ${yearData.year}: ${yearData.rankings.length} rankings`);

    const rows = yearData.rankings.map((r) => ({
      year: yearData.year,
      rank: r.rank,
      name: r.name,
      generation: r.generation ?? null,
      grade: r.grade || null,
      run_days: r.runDays ?? null,
      avg_score: r.avgScore ?? null,
      avg_score_gm: r.avgScoreGM ?? null,
      avg_score_cw: r.avgScoreCW ?? null,
      avg_score_bs: r.avgScoreBS ?? null,
      recent3: r.recent3 ?? null,
      recent3_gm: r.recent3GM ?? null,
      recent3_cw: r.recent3CW ?? null,
      recent3_bs: r.recent3BS ?? null,
      win_rate: r.winRate ?? null,
      top2_rate: r.top2Rate ?? null,
      top3_rate: r.top3Rate ?? null,
    }));

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("rankings")
        .upsert(batch, { onConflict: "year,rank", ignoreDuplicates: true });
      if (error) console.error(`  Error inserting rankings batch ${i}:`, error.message);
    }
  }

  console.log("Done seeding rankings.");
}

seedRankings().catch(console.error);
