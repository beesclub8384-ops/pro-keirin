import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const type = sp.get("type");
    const year = sp.get("year");

    if (!type) {
      // Return available years for each stat type
      const [dividend, sales, highDividend] = await Promise.all([
        supabase
          .from("statistics_data")
          .select("year")
          .eq("stat_type", "dividend")
          .not("year", "is", null)
          .order("year", { ascending: false }),
        supabase
          .from("statistics_data")
          .select("year")
          .eq("stat_type", "sales")
          .not("year", "is", null)
          .order("year", { ascending: false }),
        supabase
          .from("statistics_data")
          .select("year")
          .eq("stat_type", "high-dividend")
          .not("year", "is", null)
          .order("year", { ascending: false }),
      ]);

      return NextResponse.json({
        dividendYears: (dividend.data || []).map((r) => r.year),
        salesYears: (sales.data || []).map((r) => r.year),
        highDividendYears: (highDividend.data || []).map((r) => r.year),
      });
    }

    if (type === "avg-entries") {
      // 연도별 선수 1인당 평균 출주횟수 (racer_profiles.race_count 기반)
      const { data: rows, error } = await supabase.rpc("get_avg_entries_per_racer");

      if (error) {
        // RPC 없으면 직접 집계 (racer_profiles에서 연도별 AVG)
        const allRows: { year: number; race_count: number }[] = [];
        let offset = 0;
        while (true) {
          const { data: batch } = await supabase
            .from("racer_profiles")
            .select("year, race_count")
            .gte("year", 2003)
            .lte("year", 2025)
            .gt("race_count", 0)
            // 고유키 정렬 필수 — 없으면 페이지 경계에서 행이 중복·누락된다 (CLAUDE.md 규칙 3)
            .order("id", { ascending: true })
            .range(offset, offset + 999);
          if (!batch || batch.length === 0) break;
          allRows.push(...batch);
          if (batch.length < 1000) break;
          offset += 1000;
        }

        const yearStats = new Map<number, { count: number; sum: number }>();
        for (const r of allRows) {
          if (!yearStats.has(r.year)) yearStats.set(r.year, { count: 0, sum: 0 });
          const s = yearStats.get(r.year)!;
          s.count++;
          s.sum += r.race_count;
        }

        const result = Array.from(yearStats.entries())
          .map(([year, s]) => ({
            year,
            racer_count: s.count,
            avg_race_count: Math.round((s.sum / s.count) * 10) / 10,
          }))
          .sort((a, b) => a.year - b.year);

        return NextResponse.json({ data: result });
      }

      return NextResponse.json({ data: rows });
    }

    if (type === "no-hit") {
      const { data, error } = await supabase
        .from("statistics_data")
        .select("data")
        .eq("stat_type", "no-hit")
        .is("year", null)
        .single();

      if (error || !data) return NextResponse.json({ error: error?.message || "Data not found" }, { status: 404 });
      return NextResponse.json({ data: data.data });
    }

    if (!year) {
      return NextResponse.json({ error: "year is required" }, { status: 400 });
    }

    const yearNum = parseInt(year, 10);

    if (type === "dividend" || type === "sales" || type === "high-dividend") {
      const { data, error } = await supabase
        .from("statistics_data")
        .select("data")
        .eq("stat_type", type)
        .eq("year", yearNum)
        .single();

      if (error || !data) return NextResponse.json({ error: error?.message || "Data not found" }, { status: 404 });
      return NextResponse.json({ data: data.data });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
