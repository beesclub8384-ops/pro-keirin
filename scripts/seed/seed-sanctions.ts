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

async function seedSanctions() {
  const filePath = path.join(DATA_DIR, "sanction-data.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Array<{
    year: number;
    totalRecords: number;
    sanctions: Array<Record<string, unknown>>;
  }>;

  console.log(`Seeding sanctions for ${data.length} years...`);

  // Store each year's sanctions as a single JSONB row
  const rows = data.map((yearData) => ({
    year: yearData.year,
    data: { totalRecords: yearData.totalRecords, sanctions: yearData.sanctions },
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("sanctions")
      .upsert(batch, { onConflict: "year", ignoreDuplicates: true });
    if (error) console.error(`Error inserting sanctions batch:`, error.message);
  }

  console.log("Done seeding sanctions.");
}

seedSanctions().catch(console.error);
