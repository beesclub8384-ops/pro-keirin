import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { assembleDCPages } from "@/lib/db-transformers";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const year = sp.get("year");
    const round = sp.get("round");
    const day = sp.get("day");

    if (!year) {
      // Return available years
      const { data, error } = await supabase
        .from("decision_card_pages")
        .select("year")
        .order("year", { ascending: false });

      if (error) return NextResponse.json({ error: error.message, years: [] }, { status: 500 });
      const years = [...new Set(data.map((r) => r.year))];
      return NextResponse.json({ years });
    }

    const yearNum = parseInt(year, 10);

    if (!round) {
      // Return meta: rounds and days
      const { data: pages, error } = await supabase
        .from("decision_card_pages")
        .select("round, day")
        .eq("year", yearNum);

      if (error || !pages) return NextResponse.json({ error: error?.message || "Data not found" }, { status: 404 });

      const totalPages = pages.length;

      const roundDayMap = new Map<number, Set<number>>();
      for (const p of pages) {
        if (!roundDayMap.has(p.round)) roundDayMap.set(p.round, new Set());
        roundDayMap.get(p.round)!.add(p.day);
      }

      const rounds = Array.from(roundDayMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([r, days]) => ({
          round: r,
          days: Array.from(days).sort((a, b) => a - b),
        }));

      return NextResponse.json({ year: yearNum, totalPages, rounds });
    }

    const roundNum = parseInt(round, 10);
    const dayNum = day ? parseInt(day, 10) : null;

    // Fetch pages
    let pageQuery = supabase
      .from("decision_card_pages")
      .select("id, year, round, day, date")
      .eq("year", yearNum)
      .eq("round", roundNum);

    if (dayNum) {
      pageQuery = pageQuery.eq("day", dayNum);
    }

    const { data: pageRows, error: pageErr } = await pageQuery;
    if (pageErr || !pageRows || pageRows.length === 0) {
      return NextResponse.json({ error: pageErr?.message || "Data not found" }, { status: 404 });
    }

    const pageIds = pageRows.map((p) => p.id);

    // Fetch races for these pages
    const { data: raceRows, error: raceErr } = await supabase
      .from("decision_card_races")
      .select("id, page_id, race_no, start_time, laps, race_type")
      .in("page_id", pageIds);

    if (raceErr) {
      return NextResponse.json({ error: raceErr.message }, { status: 404 });
    }

    const raceIds = (raceRows || []).map((r) => r.id);

    // Fetch entries for these races
    let entryRows: Array<Record<string, unknown>> = [];
    if (raceIds.length > 0) {
      for (let i = 0; i < raceIds.length; i += 200) {
        const chunk = raceIds.slice(i, i + 200);
        const { data: entries } = await supabase
          .from("decision_card_entries")
          .select("*")
          .in("dc_race_id", chunk);
        if (entries) entryRows.push(...entries);
      }
    }

    // Join racer names from racer_ids
    const racerIdSet = new Set(
      entryRows.map((e) => e.racer_id as string).filter(Boolean)
    );
    const nameMap = new Map<string, string>();

    if (racerIdSet.size > 0) {
      const racerIds = Array.from(racerIdSet);
      for (let i = 0; i < racerIds.length; i += 200) {
        const chunk = racerIds.slice(i, i + 200);
        const { data: racerIdRows } = await supabase
          .from("racer_ids")
          .select("racer_id, name")
          .eq("year", yearNum)
          .in("racer_id", chunk);
        if (racerIdRows) {
          for (const r of racerIdRows) {
            nameMap.set(r.racer_id, r.name);
          }
        }
      }
    }

    // Attach names to entries
    const enrichedEntries = entryRows.map((e) => ({
      ...e,
      name: nameMap.get(e.racer_id as string) || "",
    }));

    const pages = assembleDCPages(
      pageRows as Array<{ id: number; year: number; round: number; day: number; date: string }>,
      raceRows as Array<{ id: number; page_id: number; race_no: number; start_time: string | null; laps: string | null; race_type: string | null }>,
      enrichedEntries as Array<{
        dc_race_id: number;
        back_no: number;
        racer_id: string | null;
        generation: number | null;
        age: number | null;
        photo_url: string | null;
        win_rate_venue: number | null;
        top2_rate_venue: number | null;
        top3_rate_venue: number | null;
        win_rate_total: number | null;
        top2_rate_total: number | null;
        top3_rate_total: number | null;
        place_1st: number | null;
        place_2nd: number | null;
        place_3rd: number | null;
        tactic_preempt_total: string | null;
        tactic_push_total: string | null;
        tactic_chase_total: string | null;
        tactic_mark_total: string | null;
        tactic_preempt_round: string | null;
        tactic_push_round: string | null;
        tactic_chase_round: string | null;
        tactic_mark_round: string | null;
        grade_adjust: string | null;
        recent3_score_venue: string | null;
        recent3_score_total: string | null;
        performance_rank: string | null;
        name?: string;
      }>
    );

    return NextResponse.json({
      year: yearNum,
      round: roundNum,
      day: dayNum,
      pages,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
