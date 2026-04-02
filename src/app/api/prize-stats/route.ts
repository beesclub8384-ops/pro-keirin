import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabase();

    // 개별 테스트용 로그 (디버깅 후 제거)
    const test1 = await supabase.rpc("fn_prize_stats_full");
    console.log("fn_prize_stats_full:", test1.error ? JSON.stringify(test1.error) : `OK (${test1.data?.length} rows)`);

    const test2 = await supabase.rpc("fn_prize_by_grade");
    console.log("fn_prize_by_grade:", test2.error ? JSON.stringify(test2.error) : `OK (${test2.data?.length} rows)`);

    const test3 = await supabase.rpc("fn_participation_stats");
    console.log("fn_participation_stats:", test3.error ? JSON.stringify(test3.error) : `OK (${test3.data?.length} rows)`);

    const test4 = await supabase.rpc("fn_participation_by_grade");
    console.log("fn_participation_by_grade:", test4.error ? JSON.stringify(test4.error) : `OK (${test4.data?.length} rows)`);

    const test5 = await supabase.from("prize_allowances").select("*").limit(1);
    console.log("prize_allowances:", test5.error ? JSON.stringify(test5.error) : `OK (${test5.data?.length} rows)`);

    const test6 = await supabase.from("prize_money_standards").select("year, day, grade, rank, amount").eq("day", 1).in("rank", [1, 7]).in("grade", ["선발", "우수", "특선"]).eq("race_type", "일반").limit(1);
    console.log("prize_money_standards:", test6.error ? JSON.stringify(test6.error) : `OK (${test6.data?.length} rows)`);

    const test7 = await supabase.from("special_rounds").select("*").limit(1);
    console.log("special_rounds:", test7.error ? JSON.stringify(test7.error) : `OK (${test7.data?.length} rows)`);

    // 에러가 있는 쿼리 찾기
    const errors = [
      test1.error && { query: "fn_prize_stats_full", error: test1.error },
      test2.error && { query: "fn_prize_by_grade", error: test2.error },
      test3.error && { query: "fn_participation_stats", error: test3.error },
      test4.error && { query: "fn_participation_by_grade", error: test4.error },
      test5.error && { query: "prize_allowances", error: test5.error },
      test6.error && { query: "prize_money_standards", error: test6.error },
      test7.error && { query: "special_rounds", error: test7.error },
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error("Failed queries:", JSON.stringify(errors, null, 2));
      return NextResponse.json({ error: "Query failed", details: errors }, { status: 500 });
    }

    // 본 쿼리 실행 (테스트 통과 후)
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
    console.error("prize-stats API error:", JSON.stringify(e, null, 2));
    let msg = "Unknown error";
    if (e instanceof Error) {
      msg = e.message;
    } else if (typeof e === "object" && e !== null) {
      msg = JSON.stringify(e);
    } else {
      msg = String(e);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
