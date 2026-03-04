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

// Reference data files: small datasets stored as JSONB
const REFERENCE_FILES: { dataType: string; fileName: string; hasYear: boolean }[] = [
  { dataType: "fall-injury", fileName: "fall-injury-data.json", hasYear: false },
  { dataType: "prize-info", fileName: "prize-info-data.json", hasYear: false },
  { dataType: "win-streaks", fileName: "win-streaks-data.json", hasYear: false },
  { dataType: "most-win-streaks", fileName: "most-win-streaks-data.json", hasYear: false },
  { dataType: "win-accrued", fileName: "win-accrued-data.json", hasYear: false },
  { dataType: "special-promotion", fileName: "special-promotion-data.json", hasYear: false },
  { dataType: "training-change", fileName: "training-change-data.json", hasYear: false },
];

// Yearly reference files
const YEARLY_REFERENCE_FILES: { dataType: string; fileName: string }[] = [
  { dataType: "win-top30", fileName: "win-top30-data.json" },
  { dataType: "prize-ranking", fileName: "prize-ranking-data.json" },
];

async function seedReference() {
  console.log("Seeding reference_data...");

  const rows: Array<{ data_type: string; year: number | null; data: unknown }> = [];

  // Non-yearly reference data
  for (const ref of REFERENCE_FILES) {
    const filePath = path.join(DATA_DIR, ref.fileName);
    if (!fs.existsSync(filePath)) {
      console.log(`  Skipping ${ref.dataType}: file not found`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    rows.push({ data_type: ref.dataType, year: null, data });
    console.log(`  ${ref.dataType}: 1 record`);
  }

  // Yearly reference data (arrays with year field)
  for (const ref of YEARLY_REFERENCE_FILES) {
    const filePath = path.join(DATA_DIR, ref.fileName);
    if (!fs.existsSync(filePath)) {
      console.log(`  Skipping ${ref.dataType}: file not found`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Array<{ year: number }>;
    for (const d of data) {
      rows.push({ data_type: ref.dataType, year: d.year, data: d });
    }
    console.log(`  ${ref.dataType}: ${data.length} years`);
  }

  console.log(`  Total: ${rows.length} reference rows`);

  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("reference_data")
      .upsert(batch, { onConflict: "data_type,year", ignoreDuplicates: true });
    if (error) console.error(`Error inserting reference batch:`, error.message);
  }

  console.log("Done seeding reference_data.");
}

seedReference().catch(console.error);
