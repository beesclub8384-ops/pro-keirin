import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from("decision_card_entries")
    .select("is_absent")
    .limit(1);
  if (error) {
    console.log("ERROR:", error.message);
    console.log("Column 'is_absent' does not exist. Run migration first.");
  } else {
    console.log("Column 'is_absent' exists. Sample:", data);
  }
}

main().catch(console.error);
