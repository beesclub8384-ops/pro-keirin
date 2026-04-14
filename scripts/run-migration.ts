import { config } from "dotenv";
config({ path: ".env.local" });
import * as fs from "fs";

async function main() {
  const sql = fs.readFileSync("scripts/migrations/add-is-absent.sql", "utf-8");
  console.log("Running migration:\n", sql);

  // Extract project ref from URL: https://xxx.supabase.co → xxx
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const projectRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Use Supabase PostgREST pg/query endpoint (available with service role key)
  // Try the SQL API endpoint
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "return=minimal",
    },
  });

  // Alternative: use the pg_net or direct connection
  // Actually, let's just try inserting a test row with is_absent to see if column exists
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceKey);

  // Test if column already exists
  const { data, error } = await supabase
    .from("decision_card_entries")
    .select("is_absent")
    .limit(1);

  if (data !== null) {
    console.log("Column 'is_absent' already exists! No migration needed.");
    console.log("Sample:", data);
    return;
  }

  if (error && error.message.includes("is_absent")) {
    console.log("Column does not exist yet. Need to run migration manually.");
    console.log("\nPlease run in Supabase SQL Editor (https://supabase.com/dashboard):\n");
    console.log(sql);
    return;
  }

  console.log("Query result:", { data, error: error?.message });
}

main().catch(console.error);
