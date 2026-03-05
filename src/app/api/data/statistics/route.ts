import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const type = sp.get("type");
  const year = sp.get("year");

  const supabase = getSupabase();

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

  try {
    if (type === "no-hit") {
      const { data, error } = await supabase
        .from("statistics_data")
        .select("data")
        .eq("stat_type", "no-hit")
        .is("year", null)
        .single();

      if (error || !data) return NextResponse.json({ error: "Data not found" }, { status: 404 });
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

      if (error || !data) return NextResponse.json({ error: "Data not found" }, { status: 404 });
      return NextResponse.json({ data: data.data });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Data not found" }, { status: 404 });
  }
}
