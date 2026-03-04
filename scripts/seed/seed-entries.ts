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

async function seedEntries() {
  const years = getYears("yearly-entry");
  console.log(`Seeding entries for ${years.length} years...`);

  for (const year of years) {
    const filePath = path.join(DATA_DIR, "yearly-entry", `${year}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Array<Record<string, unknown>>;

    console.log(`  ${year}: ${data.length} entries`);

    const rows = data.map((e) => ({
      date: e.date,
      venue: e.venue || null,
      week: e.week ?? null,
      day: e.day ?? null,
      race_no: e.raceNo,
      back_no: e.backNo,
      color: e.color || null,
      racer_name: e.racerName || null,
      racer_age: e.racerAge ?? null,
      grade: e.grade || null,
      grade_code: e.gradeCode || null,
      grade_prev: e.gradePrev || null,
      training: e.training || null,
      gear_rate: e.gearRate ?? null,
      race_len: e.raceLen ?? null,
      win_rate: e.winRate ?? null,
      top2_rate: e.top2Rate ?? null,
      avg_score: e.avgScore ?? null,
      rec_200m: e.rec200m || null,
    }));

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("entries")
        .upsert(batch, { onConflict: "date,race_no,back_no", ignoreDuplicates: true });
      if (error) console.error(`  Error inserting entries batch ${i}:`, error.message);
    }
  }

  console.log("Done seeding entries.");
}

seedEntries().catch(console.error);
