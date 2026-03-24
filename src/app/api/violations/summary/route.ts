import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabase();

    // 1. 총 건수 + 판정별 건수
    const { count: totalCount } = await supabase
      .from("violations")
      .select("*", { count: "exact", head: true });

    const judgmentCounts = await Promise.all(
      ["실격", "경고", "주의"].map(async (j) => {
        const { count } = await supabase
          .from("violations")
          .select("*", { count: "exact", head: true })
          .eq("judgment", j);
        return { judgment: j, count: count || 0 };
      })
    );

    // 2. 조항별 실격 건수
    const { data: articleDisqRows } = await supabase
      .from("violations")
      .select("article, paragraph, clause")
      .eq("judgment", "실격");

    const articleDisqMap = new Map<string, { article: string; paragraph: string; clause: string; count: number }>();
    for (const row of articleDisqRows || []) {
      const key = `${row.article}|${row.paragraph}|${row.clause}`;
      const existing = articleDisqMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        articleDisqMap.set(key, { article: row.article, paragraph: row.paragraph, clause: row.clause, count: 1 });
      }
    }
    const articleDisqualifications = Array.from(articleDisqMap.values()).sort((a, b) => b.count - a.count);

    // 3. 연도별 판정 건수 (races join)
    const { data: yearRows } = await supabase
      .from("violations")
      .select("race_id, judgment");

    // Get race years for violations
    const raceIds = [...new Set((yearRows || []).map((r) => r.race_id))];
    const yearMap = new Map<number, number>();

    // Fetch race years in chunks
    for (let i = 0; i < raceIds.length; i += 200) {
      const chunk = raceIds.slice(i, i + 200);
      const { data: races } = await supabase
        .from("races")
        .select("id, year")
        .in("id", chunk);
      for (const race of races || []) {
        yearMap.set(race.id, race.year);
      }
    }

    const yearlyStats = new Map<number, { total: number; 실격: number; 경고: number; 주의: number }>();
    for (const row of yearRows || []) {
      const year = yearMap.get(row.race_id);
      if (!year) continue;
      if (!yearlyStats.has(year)) yearlyStats.set(year, { total: 0, 실격: 0, 경고: 0, 주의: 0 });
      const stat = yearlyStats.get(year)!;
      stat.total++;
      if (row.judgment === "실격" || row.judgment === "경고" || row.judgment === "주의") {
        stat[row.judgment]++;
      }
    }
    const yearlyData = Array.from(yearlyStats.entries())
      .map(([year, stats]) => ({ year, ...stats }))
      .sort((a, b) => a.year - b.year);

    // 4. 최근 실격 5건
    const { data: recentDisqViolations } = await supabase
      .from("violations")
      .select("race_id, name, article, paragraph, clause, judgment, description")
      .eq("judgment", "실격")
      .order("id", { ascending: false })
      .limit(20);

    const recentDisqRaceIds = [...new Set((recentDisqViolations || []).map((r) => r.race_id))];
    const recentRaceMap = new Map<number, { date: string; round: number; day: number; race_no: number }>();
    if (recentDisqRaceIds.length > 0) {
      const { data: races } = await supabase
        .from("races")
        .select("id, date, round, day, race_no")
        .in("id", recentDisqRaceIds);
      for (const race of races || []) {
        recentRaceMap.set(race.id, { date: race.date, round: race.round, day: race.day, race_no: race.race_no });
      }
    }

    const recentDisqualifications = (recentDisqViolations || [])
      .map((v) => {
        const race = recentRaceMap.get(v.race_id);
        return race
          ? {
              date: race.date,
              round: race.round,
              day: race.day,
              raceNo: race.race_no,
              name: v.name,
              article: v.article,
              paragraph: v.paragraph,
              clause: v.clause,
              description: v.description,
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b!.date > a!.date ? 1 : -1))
      .slice(0, 5);

    return NextResponse.json({
      total: totalCount || 0,
      judgmentCounts: Object.fromEntries(judgmentCounts.map((j) => [j.judgment, j.count])),
      articleDisqualifications,
      yearlyData,
      recentDisqualifications,
    });
  } catch (error) {
    console.error("violations summary error:", error);
    return NextResponse.json({ error: "Failed to fetch violations summary" }, { status: 500 });
  }
}
