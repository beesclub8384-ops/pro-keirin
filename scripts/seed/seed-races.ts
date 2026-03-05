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
const PAGE_SIZE = 1000;

/** Paginated fetch to bypass PostgREST 1000-row limit */
async function fetchAllRows<T = Record<string, unknown>>(
  query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }
): Promise<T[]> {
  let all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

function getYears(subDir: string): number[] {
  const dir = path.join(DATA_DIR, subDir);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => parseInt(f.replace(".json", ""), 10))
    .sort((a, b) => a - b);
}

async function seedRaces() {
  const years = getYears("yearly-race-detail");
  console.log(`Seeding races for ${years.length} years...`);

  for (const year of years) {
    const filePath = path.join(DATA_DIR, "yearly-race-detail", `${year}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const races = data.races as Array<{
      year: number;
      round: number;
      day: number;
      raceNo: number;
      date: string;
      environment: Record<string, string>;
      results: Array<Record<string, unknown>>;
    }>;

    console.log(`  ${year}: ${races.length} races`);

    // Insert races in batches
    const raceRows = races.map((r) => ({
      year: r.year,
      round: r.round,
      day: r.day,
      race_no: r.raceNo,
      date: r.date,
      env_time: r.environment?.time || null,
      env_weather: r.environment?.weather || null,
      env_wind_dir: r.environment?.windDir || null,
      env_wind_speed: r.environment?.windSpeed || null,
      env_temp: r.environment?.temp || null,
      env_humidity: r.environment?.humidity || null,
      env_rainfall: r.environment?.rainfall || null,
      env_record_200m: r.environment?.record200m || null,
      env_last_lap: r.environment?.lastLap || null,
    }));

    for (let i = 0; i < raceRows.length; i += BATCH_SIZE) {
      const batch = raceRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("races")
        .upsert(batch, { onConflict: "year,round,day,race_no", ignoreDuplicates: true });
      if (error) {
        console.error(`  Error inserting races batch ${i}:`, error.message);
      }
    }

    // Now fetch ALL race IDs for this year to link results (paginated)
    let insertedRaces: Array<{ id: number; year: number; round: number; day: number; race_no: number }>;
    try {
      insertedRaces = await fetchAllRows(
        supabase.from("races").select("id, year, round, day, race_no").eq("year", year)
      );
    } catch (e) {
      console.error(`  Error fetching race IDs for ${year}:`, (e as Error).message);
      continue;
    }

    const raceIdMap = new Map<string, number>();
    for (const r of insertedRaces) {
      raceIdMap.set(`${r.year}|${r.round}|${r.day}|${r.race_no}`, r.id);
    }

    // Insert race results
    const resultRows: Array<Record<string, unknown>> = [];
    for (const race of races) {
      const raceId = raceIdMap.get(`${race.year}|${race.round}|${race.day}|${race.raceNo}`);
      if (!raceId) continue;
      for (const res of race.results || []) {
        resultRows.push({
          race_id: raceId,
          back_no: res.backNo,
          name: res.name,
          rank: res.rank || null,
          gap: res.gap || null,
          race_time: res.raceTime || null,
          tactic: res.tactic || null,
          disqualified: res.disqualified || null,
          warning: res.warning || null,
          caution: res.caution || null,
          withdrawal: res.withdrawal || null,
          finish: res.finish || null,
          record_200m: res.record200m || null,
          speed_200m: res.speed200m || null,
        });
      }
    }

    console.log(`  ${year}: ${resultRows.length} results`);

    for (let i = 0; i < resultRows.length; i += BATCH_SIZE) {
      const batch = resultRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("race_results")
        .upsert(batch, { onConflict: "race_id,back_no", ignoreDuplicates: true });
      if (error) {
        console.error(`  Error inserting results batch ${i}:`, error.message);
      }
    }
  }

  console.log("Done seeding races + race_results.");
}

seedRaces().catch(console.error);
