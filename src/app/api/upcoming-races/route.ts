import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabase();

    // KST 기준 오늘 날짜
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = kstNow.toISOString().slice(0, 10);

    // 14일 후
    const future = new Date(kstNow.getTime() + 14 * 24 * 60 * 60 * 1000);
    const futureStr = future.toISOString().slice(0, 10);

    // decision_card_pages에서 오늘~14일 이내 조회
    const { data: pages, error } = await supabase
      .from("decision_card_pages")
      .select("year, round, day, date")
      .gte("date", today)
      .lte("date", futureStr)
      .order("date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // race_schedule에서 label 조회 (특별경주 이름)
    const years = [...new Set((pages || []).map((p) => p.year))];
    let labelMap = new Map<string, string>();

    if (years.length > 0) {
      const { data: schedules } = await supabase
        .from("race_schedule")
        .select("round, day, label")
        .in("year", years)
        .not("label", "is", null);

      if (schedules) {
        for (const s of schedules) {
          if (s.label) {
            labelMap.set(`${s.round}-${s.day}`, s.label);
          }
        }
      }
    }

    const races = (pages || []).map((p) => ({
      year: p.year,
      round: p.round,
      day: p.day,
      date: p.date,
      label: labelMap.get(`${p.round}-${p.day}`) || null,
    }));

    return NextResponse.json({ races });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
