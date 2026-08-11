import { NextRequest, NextResponse } from "next/server";
import { getSupabase, fetchAllRows } from "@/lib/supabase";
import { assembleDCPages } from "@/lib/db-transformers";

// 동적 라우트(searchParams 의존)라 revalidate 무효 → 응답 Cache-Control 헤더로 캐싱
const CACHE = "public, s-maxage=300, stale-while-revalidate=3600";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const year = sp.get("year");
    const round = sp.get("round");
    const day = sp.get("day");
    const venue = sp.get("venue") || "광명";

    if (!year) {
      // venue별 연도 목록: DISTINCT RPC 단일 호출
      const { data: yearRows, error: yearErr } = await supabase.rpc(
        "decision_card_years_by_venue",
        { p_venue: venue }
      );
      if (yearErr) {
        return NextResponse.json({ error: yearErr.message }, { status: 500 });
      }
      const years =
        (yearRows as Array<{ year: number }> | null)?.map((r) => r.year) ?? [];
      return NextResponse.json(
        { years },
        { headers: { "Cache-Control": CACHE } },
      );
    }

    const yearNum = parseInt(year, 10);

    if (!round) {
      // Return meta: rounds and days
      const { data: pages, error } = await supabase
        .from("decision_card_pages")
        .select("round, day")
        .eq("year", yearNum)
        .eq("venue", venue);

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

      return NextResponse.json(
        { year: yearNum, totalPages, rounds },
        { headers: { "Cache-Control": CACHE } },
      );
    }

    const roundNum = parseInt(round, 10);
    const dayNum = day ? parseInt(day, 10) : null;

    // Fetch pages
    let pageQuery = supabase
      .from("decision_card_pages")
      .select("id, year, round, day, date")
      .eq("year", yearNum)
      .eq("round", roundNum)
      .eq("venue", venue);

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
    const entryRows: Array<Record<string, unknown>> = [];
    if (raceIds.length > 0) {
      for (let i = 0; i < raceIds.length; i += 200) {
        const chunk = raceIds.slice(i, i + 200);
        const chunkEntries = await fetchAllRows(
          supabase
            .from("decision_card_entries")
            .select("*")
            .in("dc_race_id", chunk)
            // 고유키 정렬 필수 — 없으면 페이지 경계에서 행이 중복·누락된다 (CLAUDE.md 규칙 3)
            // assembleDCPages 는 이 순서를 그대로 출전 순서로 쓴다 (id = 적재 순 = 배번 순)
            .order("id", { ascending: true })
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
    const unionTypeMap = new Map<string, string>();

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
          .select("racer_id, training, union_type")
          .eq("year", profileYear)
          .in("racer_id", chunk);
        if (profileRows) {
          for (const r of profileRows) {
            const raw = (r.training as string) || "";
            const location = raw.split("/")[0].trim();
            trainingMap.set(r.racer_id, location);
            if (r.union_type) unionTypeMap.set(r.racer_id, r.union_type as string);
          }
        }
      }
    }

    // Attach names + training to entries
    const enrichedEntries = entryRows.map((e) => ({
      ...e,
      name: nameMap.get(e.racer_id as string) || "",
      training: trainingMap.get(e.racer_id as string) || "",
      union_type: unionTypeMap.get(e.racer_id as string) ?? null,
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
        union_type?: string | null;
      }>
    );

    return NextResponse.json(
      {
        year: yearNum,
        round: roundNum,
        day: dayNum,
        pages,
      },
      { headers: { "Cache-Control": CACHE } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
