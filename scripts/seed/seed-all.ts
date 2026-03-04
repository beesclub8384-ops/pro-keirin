import { config } from "dotenv";
config({ path: ".env.local" });
import { execSync } from "child_process";

const steps = [
  { name: "races + race_results", script: "scripts/seed/seed-races.ts" },
  { name: "race_odds", script: "scripts/seed/seed-race-odds.ts" },
  { name: "decision_cards", script: "scripts/seed/seed-decision-cards.ts" },
  { name: "entries", script: "scripts/seed/seed-entries.ts" },
  { name: "racer_ids", script: "scripts/seed/seed-racer-ids.ts" },
  { name: "racer_profiles", script: "scripts/seed/seed-racer-profiles.ts" },
  { name: "rankings", script: "scripts/seed/seed-rankings.ts" },
  { name: "sanctions", script: "scripts/seed/seed-sanctions.ts" },
  { name: "statistics", script: "scripts/seed/seed-statistics.ts" },
  { name: "reference", script: "scripts/seed/seed-reference.ts" },
];

async function seedAll() {
  console.log("=== Starting full seed ===\n");
  const start = Date.now();

  for (const step of steps) {
    console.log(`\n--- Seeding: ${step.name} ---`);
    const stepStart = Date.now();
    try {
      execSync(`npx tsx ${step.script}`, { stdio: "inherit" });
      console.log(`--- Done: ${step.name} (${((Date.now() - stepStart) / 1000).toFixed(1)}s) ---`);
    } catch (err) {
      console.error(`--- FAILED: ${step.name} ---`);
      console.error(err);
      process.exit(1);
    }
  }

  console.log(`\n=== Full seed complete (${((Date.now() - start) / 1000).toFixed(1)}s) ===`);
}

seedAll().catch(console.error);
