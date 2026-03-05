import { NextRequest, NextResponse } from "next/server";
import { getSupabase, getDistinctYears, fetchAllRows } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const year = sp.get("year");

    if (!year) {
      const years = await getDistinctYears("races");
      return NextResponse.json({ years });
    }

    const yearNum = parseInt(year, 10);

    // Get all dates for the year (can exceed 1000)
    const data = await fetchAllRows(
      supabase
        .from("races")
        .select("date, round, day")
        .eq("year", yearNum)
        .order("date", { ascending: true })
    );

    // Deduplicate by date
    const dateMap = new Map<string, { round: number; day: number }>();
    for (const r of data as Array<{ date: string; round: number; day: number }>) {
      if (!dateMap.has(r.date)) {
        dateMap.set(r.date, { round: r.round, day: r.day });
      }
    }

    const dates = Array.from(dateMap.entries())
      .map(([date, meta]) => ({ date, round: meta.round, day: meta.day }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ year: yearNum, dates });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
