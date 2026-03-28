import { NextRequest, NextResponse } from "next/server";
import { getSupabase, getDistinctYears, fetchAllRows } from "@/lib/supabase";
import { assembleDCPages } from "@/lib/db-transformers";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const year = sp.get("year");
    const round = sp.get("round");
    const day = sp.get("day");

    if (!year) {
      const years = await getDistinctYears("decision_card_pages");
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
    const raceRows = await fetchAllRows(
      supabase
        .from("decision_card_races")
        .select("id, page_id, race_no, start_time, laps, race_type")
        .in("page_id", pageIds)
    );

    const raceIds = raceRows.map((r) => (r as { id: number }).id);

    // Fetch entries for these races (chunked to avoid query size limits)
    let entryRows: Array<Record<string, unknown>> = [];
    if (raceIds.length > 0) {
      for (let i = 0; i < raceIds.length; i += 200) {
        const chunk = raceIds.slice(i, i + 200);
        const chunkEntries = await fetchAllRows(
          supabase
            .from("decision_card_entries")
            .select("*")
            .in("dc_race_id", chunk)
        );
        entryRows.push(...chunkEntries);
      }
    }

    // Join racer names + training from racer_ids / racer_profiles (fallback to closest previous year)
    const racerIdSet = new Set(
      entryRows.map((e) => e.racer_id as string).filter(Boolean)
    );
    const nameMap = new Map<string, string>();
    const trainingMap = new Map<string, string>();
    const unionMap = new Map<string, boolean>();

    if (racerIdSet.size > 0) {
      const racerIds = Array.from(racerIdSet);

      // Determine which year to use: try yearNum first, fallback to latest available
      let nameYear = yearNum;
      const { count } = await supabase
        .from("racer_ids")
        .select("*", { count: "exact", head: true })
        .eq("year", yearNum);
      if (!count || count === 0) {
        const { data: fallbackRow } = await supabase
          .from("racer_ids")
          .select("year")
          .lt("year", yearNum)
          .order("year", { ascending: false })
          .limit(1);
        if (fallbackRow?.length) {
          nameYear = fallbackRow[0].year;
        }
      }

      for (let i = 0; i < racerIds.length; i += 200) {
        const chunk = racerIds.slice(i, i + 200);
        const { data: racerIdRows } = await supabase
          .from("racer_ids")
          .select("racer_id, name")
          .eq("year", nameYear)
          .in("racer_id", chunk);
        if (racerIdRows) {
          for (const r of racerIdRows) {
            nameMap.set(r.racer_id, r.name);
          }
        }
      }

      // Fetch training from racer_profiles (same year logic)
      let profileYear = yearNum;
      const { count: profileCount } = await supabase
        .from("racer_profiles")
        .select("*", { count: "exact", head: true })
        .eq("year", yearNum);
      if (!profileCount || profileCount === 0) {
        const { data: fallbackRow } = await supabase
          .from("racer_profiles")
          .select("year")
          .lt("year", yearNum)
          .order("year", { ascending: false })
          .limit(1);
        if (fallbackRow?.length) {
          profileYear = fallbackRow[0].year;
        }
      }

      for (let i = 0; i < racerIds.length; i += 200) {
        const chunk = racerIds.slice(i, i + 200);
        const { data: profileRows } = await supabase
          .from("racer_profiles")
          .select("racer_id, training, is_union")
          .eq("year", profileYear)
          .in("racer_id", chunk);
        if (profileRows) {
          for (const r of profileRows) {
            const raw = (r.training as string) || "";
            const location = raw.split("/")[0].trim();
            trainingMap.set(r.racer_id, location);
            if (r.is_union) unionMap.set(r.racer_id, true);
          }
        }
      }
    }

    // Attach names + training to entries
    const enrichedEntries = entryRows.map((e) => ({
      ...e,
      name: nameMap.get(e.racer_id as string) || "",
      training: trainingMap.get(e.racer_id as string) || "",
      is_union: unionMap.get(e.racer_id as string) ?? false,
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
        is_absent: boolean | null;
        name?: string;
        training?: string;
        is_union?: boolean;
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
