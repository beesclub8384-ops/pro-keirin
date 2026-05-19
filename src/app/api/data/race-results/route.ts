import { NextRequest, NextResponse } from "next/server";
import { getSupabase, fetchAllRows } from "@/lib/supabase";
import { transformRaceWithResults } from "@/lib/db-transformers";

// 동적 라우트(searchParams 의존)라 revalidate 무효 → 응답 Cache-Control 헤더로 캐싱
// 연도/회차 목록: 1시간 / 경주 상세: 5분
const CACHE_LIST = "public, s-maxage=3600, stale-while-revalidate=86400";
const CACHE_DETAIL = "public, s-maxage=300, stale-while-revalidate=3600";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const year = sp.get("year");
    const round = sp.get("round");
    const day = sp.get("day");
    const venue = sp.get("venue") || "광명";

    if (!year) {
      // 선택한 경기장(venue)에 데이터가 있는 연도만 반환
      // 연도별 count 24회 → 서버측 DISTINCT RPC 단일 호출 (idx_races_year_venue)
      const { data: yearRows, error: yearErr } = await supabase.rpc(
        "race_years_by_venue",
        { p_venue: venue }
      );
      if (yearErr) {
        return NextResponse.json({ error: yearErr.message }, { status: 500 });
      }
      const years = (yearRows as Array<{ year: number }> | null)?.map(
        (r) => r.year
      ) ?? [];
      return NextResponse.json(
        { years },
        { headers: { "Cache-Control": CACHE_LIST } },
      );
    }

    const yearNum = parseInt(year, 10);

    if (!round) {
      // Paginate to get ALL races for this year (can exceed 1000)
      const races = await fetchAllRows(
        supabase.from("races").select("round, day").eq("year", yearNum).eq("venue", venue)
      );

      const totalRaces = races.length;
      const roundDayMap = new Map<string, Set<number>>();
      for (const race of races) {
        const r = race as { round: string; day: number };
        if (!roundDayMap.has(r.round)) roundDayMap.set(r.round, new Set());
        roundDayMap.get(r.round)!.add(r.day);
      }

      const rounds = Array.from(roundDayMap.entries())
        // round 는 text 컬럼 (예: "18A" 보강회차) — 숫자 인식 텍스트 정렬
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([r, days]) => ({
          round: r,
          days: Array.from(days).sort((a, b) => a - b),
        }));

      return NextResponse.json(
        { year: yearNum, totalRaces, rounds },
        { headers: { "Cache-Control": CACHE_LIST } },
      );
    }

    const dayNum = day ? parseInt(day, 10) : null;

    // Fetch races (per round+day, max ~50 rows)
    // round 는 text 컬럼 → 문자열 그대로 필터 ("18A" 등 보강회차 대응)
    let raceQuery = supabase
      .from("races")
      .select("*")
      .eq("year", yearNum)
      .eq("round", round)
      .eq("venue", venue)
      .order("race_no", { ascending: true });

    if (dayNum) {
      raceQuery = raceQuery.eq("day", dayNum);
    }

    const { data: raceRows, error: raceErr } = await raceQuery;
    if (raceErr || !raceRows) return NextResponse.json({ error: raceErr?.message || "Data not found" }, { status: 404 });

    if (raceRows.length === 0) {
      return NextResponse.json(
        { year: yearNum, round, day: dayNum, races: [] },
        { headers: { "Cache-Control": CACHE_DETAIL } },
      );
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
    const unionByName = new Map<string, boolean>();

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
          .select("name, training, is_union")
          .eq("year", profileYear)
          .in("name", chunk);
        if (profileRows) {
          for (const r of profileRows) {
            const raw = (r.training as string) || "";
            const location = raw.split("/")[0].trim();
            trainingByName.set(r.name, location);
            if (r.is_union) unionByName.set(r.name, true);
          }
        }
      }
    }

    // Attach training to result rows
    for (const r of resultRows) {
      (r as Record<string, unknown>).training = trainingByName.get(r.name as string) || "";
      (r as Record<string, unknown>).is_union = unionByName.get(r.name as string) ?? false;
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

    return NextResponse.json(
      {
        year: yearNum,
        round,
        day: dayNum,
        races,
      },
      { headers: { "Cache-Control": CACHE_DETAIL } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
