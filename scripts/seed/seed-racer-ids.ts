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

async function seedRacerIds() {
  const years = getYears("racer-ids");
  console.log(`Seeding racer IDs for ${years.length} years...`);

  for (const year of years) {
    const filePath = path.join(DATA_DIR, "racer-ids", `${year}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Array<{
      racerId: string;
      name: string;
      rank: number;
    }>;

    console.log(`  ${year}: ${data.length} racer IDs`);

    const rows = data.map((r) => ({
      racer_id: r.racerId,
      name: r.name,
      rank: r.rank ?? null,
      year,
    }));

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("racer_ids")
        .upsert(batch, { onConflict: "racer_id,year", ignoreDuplicates: true });
      if (error) console.error(`  Error inserting racer IDs batch ${i}:`, error.message);
    }
  }

  console.log("Done seeding racer_ids.");
}

seedRacerIds().catch(console.error);
