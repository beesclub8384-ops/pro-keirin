import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 판정 요약: 1시간 캐시 (집계성 데이터, 실시간성 불필요)
export const revalidate = 3600;

export async function GET(request: Request) {
  try {
    const supabase = getSupabase();
    const venue = new URL(request.url).searchParams.get("venue") || "광명";

    // 1. 총 건수 + 판정별 건수
    const { count: totalCount } = await supabase
      .from("violations")
      .select("*", { count: "exact", head: true })
      .eq("venue", venue);

    const judgmentCounts = await Promise.all(
      ["실격", "경고", "주의"].map(async (j) => {
        const { count } = await supabase
          .from("violations")
          .select("*", { count: "exact", head: true })
          .eq("venue", venue)
          .eq("judgment", j);
        return { judgment: j, count: count || 0 };
      })
    );

    // 2. 조항별 실격 건수
    const { data: articleDisqRows } = await supabase
      .from("violations")
      .select("article, paragraph, clause")
      .eq("venue", venue)
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

    // 3. 연도별 판정 건수
    // 기존: violations 전체행 fetch(~3만) + race_id 청크 매핑(~30쿼리)
    // 변경: races JOIN GROUP BY 서버측 집계 RPC 단일 호출
    const { data: yearlyRows } = await supabase.rpc("violations_yearly_by_venue", {
      p_venue: venue,
    });
    const yearlyData = (
      (yearlyRows as Array<{
        year: number;
        total: number;
        disq: number;
        warn: number;
        caution: number;
      }> | null) ?? []
    )
      .map((r) => ({
        year: r.year,
        total: Number(r.total),
        실격: Number(r.disq),
        경고: Number(r.warn),
        주의: Number(r.caution),
      }))
      .sort((a, b) => a.year - b.year);

    // 4. 최근 실격 5건
    const { data: recentDisqViolations } = await supabase
      .from("violations")
      .select("race_id, name, article, paragraph, clause, judgment, description")
      .eq("venue", venue)
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
              venue,
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
