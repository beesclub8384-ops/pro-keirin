import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 판정 요약: 동적 라우트(searchParams 의존)라 revalidate 무효 → 응답 Cache-Control 헤더로 캐싱
const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: Request) {
  try {
    const supabase = getSupabase();
    const venue = new URL(request.url).searchParams.get("venue") || "광명";

    // 1. 총 건수 + 판정별 건수
    // count:"exact" 4회(전체+판정3종, 광명 ~3만행 풀카운트) → 단일 RPC
    const { data: countsRaw } = await supabase.rpc("violations_counts_by_venue", {
      p_venue: venue,
    });
    const counts = (countsRaw as {
      total?: number;
      실격?: number;
      경고?: number;
      주의?: number;
    } | null) ?? {};
    const totalCount = counts.total ?? 0;
    const judgmentCounts = {
      실격: counts.실격 ?? 0,
      경고: counts.경고 ?? 0,
      주의: counts.주의 ?? 0,
    };

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

    return NextResponse.json(
      {
        total: totalCount,
        judgmentCounts,
        articleDisqualifications,
        yearlyData,
        recentDisqualifications,
      },
      { headers: { "Cache-Control": CACHE } },
    );
  } catch (error) {
    console.error("violations summary error:", error);
    return NextResponse.json({ error: "Failed to fetch violations summary" }, { status: 500 });
  }
}
