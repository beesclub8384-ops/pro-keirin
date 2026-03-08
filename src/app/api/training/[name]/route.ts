import { NextRequest, NextResponse } from "next/server";
import { getSupabase, fetchAllRows } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const decoded = decodeURIComponent(name);
    const supabase = getSupabase();

    // 최신 연도 조회
    const { data: yearRow } = await supabase
      .from("racer_profiles")
      .select("year")
      .order("year", { ascending: false })
      .limit(1);

    if (!yearRow?.length) {
      return NextResponse.json({ racers: [] });
    }

    const latestYear = yearRow[0].year;

    // 해당 훈련지 선수 조회 (training이 "대전 / ..." 형태이므로 ilike 사용)
    const rows = await fetchAllRows(
      supabase
        .from("racer_profiles")
        .select("racer_id, name, grade_change, win_rate, top2_rate, top3_rate, year, training")
        .eq("year", latestYear)
        .ilike("training", `${decoded} /%`)
    );

    // "대전" 처럼 슬래시 없이 정확히 일치하는 경우도 포함
    const exactRows = await fetchAllRows(
      supabase
        .from("racer_profiles")
        .select("racer_id, name, grade_change, win_rate, top2_rate, top3_rate, year, training")
        .eq("year", latestYear)
        .eq("training", decoded)
    );

    // 중복 제거 후 합침
    const seen = new Set<string>();
    const allRows: Record<string, unknown>[] = [];
    for (const r of [...rows, ...exactRows]) {
      const id = r.racer_id as string;
      if (!seen.has(id)) {
        seen.add(id);
        allRows.push(r);
      }
    }

    const racers = allRows
      .map((r) => ({
        racerId: r.racer_id as string,
        name: r.name as string,
        gradeChange: (r.grade_change as string) || "",
        winRate: (r.win_rate as number) || 0,
        top2Rate: (r.top2_rate as number) || 0,
        top3Rate: (r.top3_rate as number) || 0,
        year: r.year as number,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));

    return NextResponse.json({ name: decoded, year: latestYear, racers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
