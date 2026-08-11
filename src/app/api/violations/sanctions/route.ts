import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 동적 라우트(searchParams 의존)라 revalidate 무효 → 응답 Cache-Control 헤더로 캐싱
const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const year = sp.get("year");
    const sanctionType = sp.get("sanctionType");
    const regulation = sp.get("regulation");
    const search = sp.get("search");
    const venue = sp.get("venue") || "광명";
    const page = parseInt(sp.get("page") || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("judge_sanctions")
      .select("*", { count: "exact" })
      .eq("venue", venue)
      // no 는 고유하지 않다(1,874행 / 920개 값) → 표시 순서용 no 를 앞에 두고 고유키를 뒤에 덧붙인다.
      // 없으면 페이지를 넘길 때 같은 행이 두 번 나오거나 빠진다 (CLAUDE.md 규칙 3)
      .order("no", { ascending: false })
      .order("id", { ascending: false });

    if (year) query = query.eq("race_year", parseInt(year));
    if (sanctionType) query = query.eq("sanction_type", sanctionType);
    if (regulation) query = query.eq("regulation", regulation);
    if (search) query = query.ilike("racer_name", `%${search}%`);

    const { data, count, error } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    const { data: years } = await supabase
      .from("judge_sanctions")
      .select("race_year")
      .eq("venue", venue)
      .not("race_year", "is", null)
      .order("race_year", { ascending: false });
    const uniqueYears = [...new Set((years || []).map((r) => r.race_year))];

    const { data: types } = await supabase
      .from("judge_sanctions")
      .select("sanction_type")
      .eq("venue", venue)
      .not("sanction_type", "is", null);
    const uniqueTypes = [...new Set((types || []).map((r) => r.sanction_type))];

    const { data: typeCounts } = await supabase
      .from("judge_sanctions")
      .select("sanction_type")
      .eq("venue", venue);
    const typeCountMap: Record<string, number> = {};
    for (const r of typeCounts || []) {
      if (r.sanction_type) {
        typeCountMap[r.sanction_type] = (typeCountMap[r.sanction_type] || 0) + 1;
      }
    }

    // regulation별 집계
    const { data: regCounts } = await supabase
      .from("judge_sanctions")
      .select("regulation")
      .eq("venue", venue)
      .not("regulation", "is", null);
    const regulationStats: { regulation: string; count: number }[] = [];
    const regMap = new Map<string, number>();
    for (const r of regCounts || []) {
      if (r.regulation) {
        regMap.set(r.regulation, (regMap.get(r.regulation) || 0) + 1);
      }
    }
    for (const [reg, cnt] of regMap) {
      regulationStats.push({ regulation: reg, count: cnt });
    }
    regulationStats.sort((a, b) => b.count - a.count);

    return NextResponse.json(
      {
        data: data || [],
        total: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / limit),
        availableYears: uniqueYears,
        availableTypes: uniqueTypes,
        typeCountMap,
        regulationStats,
      },
      { headers: { "Cache-Control": CACHE } },
    );
  } catch (error) {
    console.error("sanctions error:", error);
    return NextResponse.json({ error: "Failed to fetch sanctions" }, { status: 500 });
  }
}
