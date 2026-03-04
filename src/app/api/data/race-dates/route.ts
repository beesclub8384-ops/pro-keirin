import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const year = sp.get("year");

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

  // Get distinct dates with round/day for the year
  const { data, error } = await supabase
    .from("races")
    .select("date, round, day")
    .eq("year", yearNum)
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json({ year: yearNum, dates: [] });
  }

  // Deduplicate by date
  const dateMap = new Map<string, { round: number; day: number }>();
  for (const r of data) {
    if (!dateMap.has(r.date)) {
      dateMap.set(r.date, { round: r.round, day: r.day });
    }
  }

  const dates = Array.from(dateMap.entries())
    .map(([date, meta]) => ({ date, round: meta.round, day: meta.day }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ year: yearNum, dates });
}
