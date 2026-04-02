import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const [
      yearlyRes,
      byGradeRes,
      participationRes,
      byGradeParticipationRes,
      allowancesRes,
      gradeGapRes,
      specialRoundsRes,
    ] = await Promise.all([
      supabase.rpc("fn_prize_stats_full"),
      supabase.rpc("fn_prize_by_grade"),
      supabase.rpc("fn_participation_stats"),
      supabase.rpc("fn_participation_by_grade"),
      supabase
        .from("prize_allowances")
        .select("year, grade, entry_fee_per_day, safety_fee_per_day, prep_fee")
        .order("year"),
      supabase
        .from("prize_money_standards")
        .select("year, day, grade, rank, amount")
        .eq("day", 1)
        .in("rank", [1, 7])
        .in("grade", ["선발", "우수", "특선"])
        .eq("race_type", "일반")
        .order("year"),
      supabase
        .from("special_rounds")
        .select("year, round, race_type, grade_scope")
        .order("year"),
    ]);

    // 에러 체크
    const errors: { query: string; error: unknown }[] = [];
    if (yearlyRes.error) errors.push({ query: "fn_prize_stats_full", error: yearlyRes.error });
    if (byGradeRes.error) errors.push({ query: "fn_prize_by_grade", error: byGradeRes.error });
    if (participationRes.error) errors.push({ query: "fn_participation_stats", error: participationRes.error });
    if (byGradeParticipationRes.error) errors.push({ query: "fn_participation_by_grade", error: byGradeParticipationRes.error });
    if (allowancesRes.error) errors.push({ query: "prize_allowances", error: allowancesRes.error });
    if (gradeGapRes.error) errors.push({ query: "prize_money_standards", error: gradeGapRes.error });
    if (specialRoundsRes.error) errors.push({ query: "special_rounds", error: specialRoundsRes.error });

    if (errors.length > 0) {
      return NextResponse.json(
        { error: "쿼리 실패", details: errors.map(e => ({ query: e.query, message: JSON.stringify(e.error) })) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      yearly: yearlyRes.data,
      byGrade: byGradeRes.data,
      participation: participationRes.data,
      byGradeParticipation: byGradeParticipationRes.data,
      allowances: allowancesRes.data,
      gradeGap: gradeGapRes.data,
      specialRounds: specialRoundsRes.data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e) ?? String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
