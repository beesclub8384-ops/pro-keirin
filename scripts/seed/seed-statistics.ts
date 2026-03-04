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

async function seedStatistics() {
  console.log("Seeding statistics_data...");

  const rows: Array<{ stat_type: string; year: number | null; data: unknown }> = [];

  // 1. Dividend stats (yearly)
  const dividendPath = path.join(DATA_DIR, "dividend-stats-data.json");
  if (fs.existsSync(dividendPath)) {
    const data = JSON.parse(fs.readFileSync(dividendPath, "utf-8")) as Array<{ year: number }>;
    for (const d of data) {
      rows.push({ stat_type: "dividend", year: d.year, data: d });
    }
    console.log(`  dividend: ${data.length} years`);
  }

  // 2. Sales stats (yearly)
  const salesPath = path.join(DATA_DIR, "sales-stats-data.json");
  if (fs.existsSync(salesPath)) {
    const data = JSON.parse(fs.readFileSync(salesPath, "utf-8")) as Array<{ year: number }>;
    for (const d of data) {
      rows.push({ stat_type: "sales", year: d.year, data: d });
    }
    console.log(`  sales: ${data.length} years`);
  }

  // 3. High dividend (yearly)
  const highDivPath = path.join(DATA_DIR, "high-dividend-data.json");
  if (fs.existsSync(highDivPath)) {
    const data = JSON.parse(fs.readFileSync(highDivPath, "utf-8")) as Array<{ year: number }>;
    for (const d of data) {
      rows.push({ stat_type: "high-dividend", year: d.year, data: d });
    }
    console.log(`  high-dividend: ${data.length} years`);
  }

  // 4. No-hit races (single entry, no year)
  const noHitPath = path.join(DATA_DIR, "no-hit-races-data.json");
  if (fs.existsSync(noHitPath)) {
    const data = JSON.parse(fs.readFileSync(noHitPath, "utf-8"));
    rows.push({ stat_type: "no-hit", year: null, data });
    console.log(`  no-hit: 1 record`);
  }

  console.log(`  Total: ${rows.length} statistics rows`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("statistics_data")
      .upsert(batch, { onConflict: "stat_type,year", ignoreDuplicates: true });
    if (error) console.error(`Error inserting statistics batch:`, error.message);
  }

  console.log("Done seeding statistics_data.");
}

seedStatistics().catch(console.error);
