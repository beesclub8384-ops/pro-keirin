import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { transformRaceWithResults } from "@/lib/db-transformers";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const year = sp.get("year");
  const round = sp.get("round");
  const day = sp.get("day");

  if (!year) {
    // Return available years
    const { data, error } = await supabase
      .from("races")
      .select("year")
      .order("year", { ascending: false });

    if (error) return NextResponse.json({ years: [] });
    const years = [...new Set(data.map((r) => r.year))];
    return NextResponse.json({ years });
  }

  const yearNum = parseInt(year, 10);

  try {
    if (!round) {
      // Return meta: rounds/days + totalRaces
      const { data: races, error } = await supabase
        .from("races")
        .select("round, day")
        .eq("year", yearNum);

      if (error || !races) return NextResponse.json({ error: "Data not found" }, { status: 404 });

      const totalRaces = races.length;
      const roundDayMap = new Map<number, Set<number>>();
      for (const race of races) {
        if (!roundDayMap.has(race.round)) roundDayMap.set(race.round, new Set());
        roundDayMap.get(race.round)!.add(race.day);
      }

      const rounds = Array.from(roundDayMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([r, days]) => ({
          round: r,
          days: Array.from(days).sort((a, b) => a - b),
        }));

      return NextResponse.json({ year: yearNum, totalRaces, rounds });
    }

    const roundNum = parseInt(round, 10);
    const dayNum = day ? parseInt(day, 10) : null;

    // Fetch races
    let raceQuery = supabase
      .from("races")
      .select("*")
      .eq("year", yearNum)
      .eq("round", roundNum)
      .order("race_no", { ascending: true });

    if (dayNum) {
      raceQuery = raceQuery.eq("day", dayNum);
    }

    const { data: raceRows, error: raceErr } = await raceQuery;
    if (raceErr || !raceRows) return NextResponse.json({ error: "Data not found" }, { status: 404 });

    const raceIds = raceRows.map((r) => r.id);

    // Fetch results and odds in parallel
    const [resultsRes, oddsRes] = await Promise.all([
      raceIds.length > 0
        ? supabase
            .from("race_results")
            .select("*")
            .in("race_id", raceIds)
            .order("back_no", { ascending: true })
        : { data: [], error: null },
      raceIds.length > 0
        ? supabase
            .from("race_odds")
            .select("*")
            .in("race_id", raceIds)
        : { data: [], error: null },
    ]);

    const resultRows = resultsRes.data || [];
    const oddsRows = oddsRes.data || [];

    // Group results by race_id
    const resultsByRace = new Map<number, typeof resultRows>();
    for (const r of resultRows) {
      const arr = resultsByRace.get(r.race_id) || [];
      arr.push(r);
      resultsByRace.set(r.race_id, arr);
    }

    // Map odds by race_id
    const oddsByRace = new Map<number, (typeof oddsRows)[0]>();
    for (const o of oddsRows) {
      if (o.race_id) oddsByRace.set(o.race_id, o);
    }

    // Assemble response
    const races = raceRows.map((race) => {
      const results = resultsByRace.get(race.id) || [];
      const odds = oddsByRace.get(race.id) || null;
      return transformRaceWithResults(race, results, odds);
    });

    return NextResponse.json({
      year: yearNum,
      round: roundNum,
      day: dayNum,
      races,
    });
  } catch {
    return NextResponse.json({ error: "Data not found" }, { status: 404 });
  }
}
