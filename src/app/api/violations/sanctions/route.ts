import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const year = sp.get("year");
    const sanctionType = sp.get("sanctionType");
    const search = sp.get("search");
    const page = parseInt(sp.get("page") || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("judge_sanctions")
      .select("*", { count: "exact" })
      .order("no", { ascending: false });

    if (year) query = query.eq("race_year", parseInt(year));
    if (sanctionType) query = query.eq("sanction_type", sanctionType);
    if (search) query = query.ilike("racer_name", `%${search}%`);

    const { data, count, error } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    const { data: years } = await supabase
      .from("judge_sanctions")
      .select("race_year")
      .not("race_year", "is", null)
      .order("race_year", { ascending: false });
    const uniqueYears = [...new Set((years || []).map((r) => r.race_year))];

    const { data: types } = await supabase
      .from("judge_sanctions")
      .select("sanction_type")
      .not("sanction_type", "is", null);
    const uniqueTypes = [...new Set((types || []).map((r) => r.sanction_type))];

    const { data: typeCounts } = await supabase
      .from("judge_sanctions")
      .select("sanction_type");
    const typeCountMap: Record<string, number> = {};
    for (const r of typeCounts || []) {
      if (r.sanction_type) {
        typeCountMap[r.sanction_type] = (typeCountMap[r.sanction_type] || 0) + 1;
      }
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
      availableYears: uniqueYears,
      availableTypes: uniqueTypes,
      typeCountMap,
    });
  } catch (error) {
    console.error("sanctions error:", error);
    return NextResponse.json({ error: "Failed to fetch sanctions" }, { status: 500 });
  }
}
