import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase";

interface RaceSalesRow {
  year: number;
  grade: string;
  s_합계: number;
}

export async function GET() {
  try {
    const supabase = getSupabase();

    const rows = await fetchAllRows<RaceSalesRow>(
      supabase
        .from("race_sales")
        .select("year, grade, s_합계")
        .order("year", { ascending: true })
    );

    // 연도별 집계
    const yearMap = new Map<
      number,
      {
        총매출: number;
        선발매출: number;
        우수매출: number;
        특선매출: number;
        선발경주수: number;
        우수경주수: number;
        특선경주수: number;
      }
    >();

    for (const r of rows) {
      if (!yearMap.has(r.year)) {
        yearMap.set(r.year, {
          총매출: 0,
          선발매출: 0,
          우수매출: 0,
          특선매출: 0,
          선발경주수: 0,
          우수경주수: 0,
          특선경주수: 0,
        });
      }
      const s = yearMap.get(r.year)!;
      const amt = r.s_합계 || 0;
      s.총매출 += amt;

      if (r.grade === "선발") {
        s.선발매출 += amt;
        s.선발경주수++;
      } else if (r.grade === "우수") {
        s.우수매출 += amt;
        s.우수경주수++;
      } else if (r.grade === "특선") {
        s.특선매출 += amt;
        s.특선경주수++;
      }
    }

    const data = Array.from(yearMap.entries())
      .map(([year, s]) => ({
        year,
        총매출: s.총매출,
        선발매출: s.선발매출,
        우수매출: s.우수매출,
        특선매출: s.특선매출,
        선발경주수: s.선발경주수,
        우수경주수: s.우수경주수,
        특선경주수: s.특선경주수,
        선발평균: s.선발경주수 > 0 ? Math.round(s.선발매출 / s.선발경주수) : 0,
        우수평균: s.우수경주수 > 0 ? Math.round(s.우수매출 / s.우수경주수) : 0,
        특선평균: s.특선경주수 > 0 ? Math.round(s.특선매출 / s.특선경주수) : 0,
      }))
      .sort((a, b) => a.year - b.year);

    return NextResponse.json({ data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
