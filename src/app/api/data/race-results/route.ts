import { NextRequest, NextResponse } from "next/server";
import { getSupabase, getDistinctYears, fetchAllRows } from "@/lib/supabase";
import { transformRaceWithResults } from "@/lib/db-transformers";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const year = sp.get("year");
    const round = sp.get("round");
    const day = sp.get("day");

    if (!year) {
      const years = await getDistinctYears("races");
      return NextResponse.json({ years });
    }

    const yearNum = parseInt(year, 10);

    if (!round) {
      // Paginate to get ALL races for this year (can exceed 1000)
      const races = await fetchAllRows(
        supabase.from("races").select("round, day").eq("year", yearNum)
      );

      const totalRaces = races.length;
      const roundDayMap = new Map<number, Set<number>>();
      for (const race of races) {
        const r = race as { round: number; day: number };
        if (!roundDayMap.has(r.round)) roundDayMap.set(r.round, new Set());
        roundDayMap.get(r.round)!.add(r.day);
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

    // Fetch races (per round+day, max ~50 rows)
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
    if (raceErr || !raceRows) return NextResponse.json({ error: raceErr?.message || "Data not found" }, { status: 404 });

    if (raceRows.length === 0) {
      return NextResponse.json({ year: yearNum, round: roundNum, day: dayNum, races: [] });
    }

    const raceIds = raceRows.map((r) => r.id);

    // Fetch results — chunk IDs to avoid URI length limits
    let resultRows: Record<string, unknown>[] = [];
    for (let i = 0; i < raceIds.length; i += 200) {
      const chunk = raceIds.slice(i, i + 200);
      const { data, error } = await supabase
        .from("race_results")
        .select("*")
        .in("race_id", chunk)
        .order("back_no", { ascending: true });
      if (error) {
        return NextResponse.json({ error: `race_results query failed: ${error.message}` }, { status: 500 });
      }
      if (data) resultRows.push(...data);
    }

    // Fetch odds
    let oddsRows: Record<string, unknown>[] = [];
    for (let i = 0; i < raceIds.length; i += 200) {
      const chunk = raceIds.slice(i, i + 200);
      const { data, error } = await supabase
        .from("race_odds")
        .select("*")
        .in("race_id", chunk);
      if (error) {
        return NextResponse.json({ error: `race_odds query failed: ${error.message}` }, { status: 500 });
      }
      if (data) oddsRows.push(...data);
    }

    // Fetch training from racer_profiles by name
    const nameSet = new Set(resultRows.map((r) => r.name as string).filter(Boolean));
    const trainingByName = new Map<string, string>();

    if (nameSet.size > 0) {
      const names = Array.from(nameSet);
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

      for (let i = 0; i < names.length; i += 200) {
        const chunk = names.slice(i, i + 200);
        const { data: profileRows } = await supabase
          .from("racer_profiles")
          .select("name, training")
          .eq("year", profileYear)
          .in("name", chunk);
        if (profileRows) {
          for (const r of profileRows) {
            const raw = (r.training as string) || "";
            const location = raw.split("/")[0].trim();
            trainingByName.set(r.name, location);
          }
        }
      }
    }

    // Attach training to result rows
    for (const r of resultRows) {
      (r as Record<string, unknown>).training = trainingByName.get(r.name as string) || "";
    }

    // Group results by race_id
    const resultsByRace = new Map<number, typeof resultRows>();
    for (const r of resultRows) {
      const raceId = r.race_id as number;
      const arr = resultsByRace.get(raceId) || [];
      arr.push(r);
      resultsByRace.set(raceId, arr);
    }

    // Map odds by race_id
    const oddsByRace = new Map<number, (typeof oddsRows)[0]>();
    for (const o of oddsRows) {
      const raceId = o.race_id as number;
      if (raceId) oddsByRace.set(raceId, o);
    }

    // Assemble response
    const races = raceRows.map((race) => {
      const results = resultsByRace.get(race.id) || [];
      const odds = oddsByRace.get(race.id) || null;
      return transformRaceWithResults(race, results as never[], odds as never);
    });

    return NextResponse.json({
      year: yearNum,
      round: roundNum,
      day: dayNum,
      races,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
