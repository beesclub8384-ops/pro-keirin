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

async function seedDecisionCards() {
  const years = getYears("yearly-decision-card");
  console.log(`Seeding decision cards for ${years.length} years...`);

  for (const year of years) {
    const filePath = path.join(DATA_DIR, "yearly-decision-card", `${year}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const pages = data.pages as Array<{
      year: number;
      round: number;
      day: number;
      date: string;
      races: Array<{
        raceNo: number;
        startTime: string;
        laps: string;
        raceType: string;
        entries: Array<Record<string, unknown>>;
      }>;
    }>;

    console.log(`  ${year}: ${pages.length} pages`);

    // 1. Insert pages
    const pageRows = pages.map((p) => ({
      year: p.year,
      round: p.round,
      day: p.day,
      date: p.date,
    }));

    for (let i = 0; i < pageRows.length; i += BATCH_SIZE) {
      const batch = pageRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("decision_card_pages")
        .upsert(batch, { onConflict: "year,round,day", ignoreDuplicates: true });
      if (error) console.error(`  Error inserting pages batch:`, error.message);
    }

    // 2. Fetch inserted page IDs
    const { data: insertedPages, error: fetchErr } = await supabase
      .from("decision_card_pages")
      .select("id, year, round, day")
      .eq("year", year);

    if (fetchErr || !insertedPages) {
      console.error(`  Error fetching page IDs for ${year}:`, fetchErr?.message);
      continue;
    }

    const pageIdMap = new Map<string, number>();
    for (const p of insertedPages) {
      pageIdMap.set(`${p.year}|${p.round}|${p.day}`, p.id);
    }

    // 3. Insert races
    const raceRows: Array<Record<string, unknown>> = [];
    for (const page of pages) {
      const pageId = pageIdMap.get(`${page.year}|${page.round}|${page.day}`);
      if (!pageId) continue;
      for (const race of page.races) {
        raceRows.push({
          page_id: pageId,
          race_no: race.raceNo,
          start_time: race.startTime || null,
          laps: race.laps || null,
          race_type: race.raceType || null,
        });
      }
    }

    for (let i = 0; i < raceRows.length; i += BATCH_SIZE) {
      const batch = raceRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("decision_card_races")
        .upsert(batch, { onConflict: "page_id,race_no", ignoreDuplicates: true });
      if (error) console.error(`  Error inserting DC races batch:`, error.message);
    }

    // 4. Fetch inserted race IDs (paginated to bypass 1000-row limit)
    const pageIds = Array.from(pageIdMap.values());
    const dcRaceIdMap = new Map<string, number>();

    for (let i = 0; i < pageIds.length; i += 100) {
      const chunk = pageIds.slice(i, i + 100);
      try {
        const insertedRaces = await fetchAllRows<{ id: number; page_id: number; race_no: number }>(
          supabase
            .from("decision_card_races")
            .select("id, page_id, race_no")
            .in("page_id", chunk)
        );
        for (const r of insertedRaces) {
          dcRaceIdMap.set(`${r.page_id}|${r.race_no}`, r.id);
        }
      } catch (e) {
        console.error(`  Error fetching DC race IDs:`, (e as Error).message);
      }
    }

    // 5. Insert entries
    const entryRows: Array<Record<string, unknown>> = [];
    for (const page of pages) {
      const pageId = pageIdMap.get(`${page.year}|${page.round}|${page.day}`);
      if (!pageId) continue;
      for (const race of page.races) {
        const dcRaceId = dcRaceIdMap.get(`${pageId}|${race.raceNo}`);
        if (!dcRaceId) continue;
        for (const entry of race.entries) {
          entryRows.push({
            dc_race_id: dcRaceId,
            back_no: entry.backNo,
            racer_id: entry.racerId || null,
            generation: entry.generation || null,
            age: entry.age || null,
            photo_url: entry.photoUrl || null,
            win_rate_venue: entry.winRateVenue ?? null,
            top2_rate_venue: entry.top2RateVenue ?? null,
            top3_rate_venue: entry.top3RateVenue ?? null,
            win_rate_total: entry.winRateTotal ?? null,
            top2_rate_total: entry.top2RateTotal ?? null,
            top3_rate_total: entry.top3RateTotal ?? null,
            place_1st: entry.place1st ?? null,
            place_2nd: entry.place2nd ?? null,
            place_3rd: entry.place3rd ?? null,
            tactic_preempt_total: entry.tacticPreemptTotal || null,
            tactic_push_total: entry.tacticPushTotal || null,
            tactic_chase_total: entry.tacticChaseTotal || null,
            tactic_mark_total: entry.tacticMarkTotal || null,
            tactic_preempt_round: entry.tacticPreemptRound || null,
            tactic_push_round: entry.tacticPushRound || null,
            tactic_chase_round: entry.tacticChaseRound || null,
            tactic_mark_round: entry.tacticMarkRound || null,
            grade_adjust: entry.gradeAdjust || null,
            recent3_score_venue: entry.recent3ScoreVenue || null,
            recent3_score_total: entry.recent3ScoreTotal || null,
            performance_rank: entry.performanceRank || null,
          });
        }
      }
    }

    console.log(`  ${year}: ${raceRows.length} races, ${entryRows.length} entries`);

    for (let i = 0; i < entryRows.length; i += BATCH_SIZE) {
      const batch = entryRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("decision_card_entries")
        .upsert(batch, { onConflict: "dc_race_id,back_no", ignoreDuplicates: true });
      if (error) console.error(`  Error inserting DC entries batch ${i}:`, error.message);
    }
  }

  console.log("Done seeding decision cards.");
}

seedDecisionCards().catch(console.error);
