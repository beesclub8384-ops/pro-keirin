import { NextRequest, NextResponse } from "next/server";
import { getSupabase, getDistinctYears, fetchAllRows } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const year = sp.get("year");

    if (!year) {
      const years = await getDistinctYears("race_schedule");
      return NextResponse.json({ years });
    }

    const yearNum = parseInt(year, 10);

    // race_schedule 테이블에서 일정 조회
    const data = await fetchAllRows(
      supabase
        .from("race_schedule")
        .select("date, round, day, label")
        .eq("year", yearNum)
        .order("date", { ascending: true })
    );

    const dates = (data as Array<{ date: string; round: number; day: number; label: string | null }>).map(
      (r) => ({ date: r.date, round: r.round, day: r.day, label: r.label || "" })
    );

    return NextResponse.json({ year: yearNum, dates });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
