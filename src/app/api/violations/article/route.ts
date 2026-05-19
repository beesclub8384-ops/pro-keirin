import { NextRequest, NextResponse } from "next/server";
import { getSupabase, fetchAllRows } from "@/lib/supabase";

// 조항별 판정 집계: 1시간 캐시
export const revalidate = 3600;

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const article = sp.get("article");
    const clause = sp.get("clause") || "-";
    const paragraph = sp.get("paragraph") || "-";
    const judgment = sp.get("judgment"); // 실격/경고/주의 필터
    const year = sp.get("year");
    const violationType = sp.get("violationType"); // A/B 유형 필터
    const venue = sp.get("venue") || "광명";

    if (!article) {
      return NextResponse.json({ error: "article parameter required" }, { status: 400 });
    }

    // Base query - violations matching article/clause/paragraph
    let query = supabase
      .from("violations")
      .select("id, race_id, back_no, name, violation_time, violation_place, judgment, article, paragraph, clause, description")
      .eq("venue", venue)
      .eq("article", article);

    if (clause !== "-") query = query.eq("clause", clause);
    else query = query.eq("clause", "-");

    if (paragraph !== "-") query = query.eq("paragraph", paragraph);
    else query = query.eq("paragraph", "-");

    if (judgment) query = query.eq("judgment", judgment);
    if (violationType) query = query.eq("violation_type", violationType);

    const allViolations = await fetchAllRows(query);

    // Get race info for year filtering and display
    const raceIds = [...new Set(allViolations.map((v: Record<string, unknown>) => v.race_id as number))];
    const raceMap = new Map<number, { year: number; date: string; round: number; day: number; race_no: number }>();

    for (let i = 0; i < raceIds.length; i += 200) {
      const chunk = raceIds.slice(i, i + 200);
      const { data: races } = await supabase
        .from("races")
        .select("id, year, date, round, day, race_no")
        .in("id", chunk);
      for (const race of races || []) {
        raceMap.set(race.id, { year: race.year, date: race.date, round: race.round, day: race.day, race_no: race.race_no });
      }
    }

    // Filter by year if specified
    let filtered = allViolations as Record<string, unknown>[];
    if (year) {
      const yearNum = parseInt(year, 10);
      filtered = filtered.filter((v) => {
        const race = raceMap.get(v.race_id as number);
        return race && race.year === yearNum;
      });
    }

    // 1. 선수별 집계
    const playerMap = new Map<string, { name: string; 실격: number; 경고: number; 주의: number; total: number; lastDate: string }>();
    for (const v of filtered) {
      const name = v.name as string;
      const j = v.judgment as string;
      const race = raceMap.get(v.race_id as number);
      const date = race?.date || "";

      if (!playerMap.has(name)) {
        playerMap.set(name, { name, 실격: 0, 경고: 0, 주의: 0, total: 0, lastDate: "" });
      }
      const p = playerMap.get(name)!;
      if (j === "실격" || j === "경고" || j === "주의") p[j]++;
      p.total++;
      if (date > p.lastDate) p.lastDate = date;
    }
    const playerRanking = Array.from(playerMap.values()).sort((a, b) => b.total - a.total);

    // 2. 위반장소별 집계
    const placeMap = new Map<string, number>();
    for (const v of filtered) {
      const place = (v.violation_place as string) || "미상";
      placeMap.set(place, (placeMap.get(place) || 0) + 1);
    }
    const placeStats = Array.from(placeMap.entries())
      .map(([place, count]) => ({ place, count }))
      .sort((a, b) => b.count - a.count);

    // 3. 연도별 집계
    const yearStatsMap = new Map<number, { total: number; 실격: number; 경고: number; 주의: number }>();
    for (const v of allViolations as Record<string, unknown>[]) {
      const race = raceMap.get(v.race_id as number);
      if (!race) continue;
      if (!yearStatsMap.has(race.year)) yearStatsMap.set(race.year, { total: 0, 실격: 0, 경고: 0, 주의: 0 });
      const stat = yearStatsMap.get(race.year)!;
      stat.total++;
      const j = v.judgment as string;
      if (j === "실격" || j === "경고" || j === "주의") stat[j]++;
    }
    const yearlyData = Array.from(yearStatsMap.entries())
      .map(([y, stats]) => ({ year: y, ...stats }))
      .sort((a, b) => a.year - b.year);

    // Available years for filter
    const availableYears = Array.from(yearStatsMap.keys()).sort((a, b) => b - a);

    return NextResponse.json({
      playerRanking,
      placeStats,
      yearlyData,
      availableYears,
      totalFiltered: filtered.length,
    });
  } catch (error) {
    console.error("violations article error:", error);
    return NextResponse.json({ error: "Failed to fetch article violations" }, { status: 500 });
  }
}
