import { NextRequest, NextResponse } from "next/server";
import { getSupabase, fetchAllRows } from "@/lib/supabase";

// 동적 라우트(searchParams 의존)라 revalidate 무효 → 응답 Cache-Control 헤더로 캐싱
const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const name = sp.get("name");
    const article = sp.get("article");
    const clause = sp.get("clause") || "-";
    const paragraph = sp.get("paragraph") || "-";
    const venue = sp.get("venue") || "광명";

    if (!name) {
      return NextResponse.json({ error: "name parameter required" }, { status: 400 });
    }

    let query = supabase
      .from("violations")
      .select("id, race_id, back_no, name, violation_time, violation_place, article, paragraph, clause, judgment, description, violation_type")
      .eq("venue", venue)
      .eq("name", name);

    if (article) {
      query = query.eq("article", article);
      if (clause !== "-") query = query.eq("clause", clause);
      else query = query.eq("clause", "-");
      if (paragraph !== "-") query = query.eq("paragraph", paragraph);
      else query = query.eq("paragraph", "-");
    }

    // 고유키 정렬 필수 — 없으면 페이지 경계에서 행이 중복·누락된다 (CLAUDE.md 규칙 3)
    query = query.order("id", { ascending: true });

    const violations = await fetchAllRows(query, { orderedBy: "id" });

    // Get race info
    const raceIds = [...new Set(violations.map((v: Record<string, unknown>) => v.race_id as number))];
    const raceMap = new Map<number, { date: string; round: number; day: number; race_no: number; year: number }>();

    for (let i = 0; i < raceIds.length; i += 200) {
      const chunk = raceIds.slice(i, i + 200);
      const { data: races } = await supabase
        .from("races")
        .select("id, date, round, day, race_no, year")
        .in("id", chunk);
      for (const race of races || []) {
        raceMap.set(race.id, { date: race.date, round: race.round, day: race.day, race_no: race.race_no, year: race.year });
      }
    }

    // Build history with race info, sorted by date desc
    const history = (violations as Record<string, unknown>[])
      .map((v) => {
        const race = raceMap.get(v.race_id as number);
        return {
          date: race?.date || "",
          year: race?.year || 0,
          round: race?.round || 0,
          day: race?.day || 0,
          raceNo: race?.race_no || 0,
          backNo: v.back_no,
          violationTime: v.violation_time,
          violationPlace: v.violation_place,
          article: v.article,
          paragraph: v.paragraph,
          clause: v.clause,
          judgment: v.judgment,
          description: v.description,
          violationType: v.violation_type || null,
        };
      })
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

    // Summary counts
    const summary = { 실격: 0, 경고: 0, 주의: 0, total: 0 };
    for (const v of history) {
      summary.total++;
      const j = v.judgment as string;
      if (j === "실격" || j === "경고" || j === "주의") summary[j]++;
    }

    return NextResponse.json(
      { name, summary, history },
      { headers: { "Cache-Control": CACHE } },
    );
  } catch (error) {
    console.error("violations player error:", error);
    return NextResponse.json({ error: "Failed to fetch player violations" }, { status: 500 });
  }
}
