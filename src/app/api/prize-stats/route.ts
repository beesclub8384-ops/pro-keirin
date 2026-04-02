import { NextResponse } from "next/server";
import { getSupabase, fetchAllRows } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabase();

    const [yearlyRes, byGradeRes, participationRes, byGradeParticipationRes, allowancesData, gradeGapData, specialRoundsData] =
      await Promise.all([
        supabase.rpc("fn_prize_stats_full"),
        supabase.rpc("fn_prize_by_grade"),
        supabase.rpc("fn_participation_stats"),
        supabase.rpc("fn_participation_by_grade"),
        fetchAllRows(
          supabase
            .from("prize_allowances")
            .select("year, grade, entry_fee_per_day, safety_fee_per_day, prep_fee")
            .order("year")
        ),
        fetchAllRows(
          supabase
            .from("prize_money_standards")
            .select("year, day, grade, rank, amount")
            .eq("day", 1)
            .in("rank", [1, 7])
            .in("grade", ["선발", "우수", "특선"])
            .eq("race_type", "일반")
            .order("year")
        ),
        fetchAllRows(
          supabase
            .from("special_rounds")
            .select("year, round, race_type, grade_scope")
            .order("year")
        ),
      ]);

    if (yearlyRes.error) throw yearlyRes.error;
    if (byGradeRes.error) throw byGradeRes.error;
    if (participationRes.error) throw participationRes.error;
    if (byGradeParticipationRes.error) throw byGradeParticipationRes.error;

    return NextResponse.json({
      yearly: yearlyRes.data,
      byGrade: byGradeRes.data,
      participation: participationRes.data,
      byGradeParticipation: byGradeParticipationRes.data,
      allowances: allowancesData,
      gradeGap: gradeGapData,
      specialRounds: specialRoundsData,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
