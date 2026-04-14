import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const ids = Array.from({ length: 20 }, (_, i) =>
    "202500" + String(i + 1).padStart(2, "0")
  );

  const { data } = await supabase
    .from("racer_ids")
    .select("racer_id, name, year")
    .in("racer_id", ids)
    .order("racer_id");

  console.log("=== 20250xxx in racer_ids ===");
  if (data) {
    for (const r of data) {
      console.log(`  ${r.racer_id}: ${r.name} (year=${r.year})`);
    }
  }
  console.log(`Total: ${data?.length}`);
}

main().catch(console.error);
