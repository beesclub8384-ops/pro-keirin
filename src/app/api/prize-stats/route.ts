import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabase();

    const [
      yearlyRes, byGradeRes, participationRes, byGradeParticipationRes,
      allowancesRes, gradeGapRes, specialRoundsRes,
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

    if (yearlyRes.error) throw yearlyRes.error;
    if (byGradeRes.error) throw byGradeRes.error;
    if (participationRes.error) throw participationRes.error;
    if (byGradeParticipationRes.error) throw byGradeParticipationRes.error;
    if (allowancesRes.error) throw allowancesRes.error;
    if (gradeGapRes.error) throw gradeGapRes.error;
    if (specialRoundsRes.error) throw specialRoundsRes.error;

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
    console.error("prize-stats API error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
