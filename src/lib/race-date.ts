import { getSupabase } from "@/lib/supabase";

/**
 * (venue, year, round, day)에 해당하는 경주일을 조회. 없으면 null. 형식: "YYYY-MM-DD".
 * lib/interview-client.lookupRaceDate의 서버 버전 — 두 곳을 같이 고칠 것.
 *
 * ⚠️ venue 필터는 필수다. 3개장이 같은 (year, round, day)를 쓰므로
 *    필터가 없으면 maybeSingle()이 여러 행을 받아 에러를 내고 조용히 null이 된다
 *    (2026-08-23 실측: 2026/30/1 → 광명 07-24, 창원 08-07, 부산 08-21 세 행).
 *
 * ⚠️ 부산만 출처가 다르다. decision_card_pages의 부산 날짜는 실제와 어긋난다
 *    (races와 조인되는 622행 중 367행 불일치 — 부산 2026/30/1이 08-07로 들어가 있으나
 *    실제는 08-21). 부산은 spo1에서 직접 수집한 races 테이블을 쓴다.
 */
export async function lookupRaceDate(
  year: number,
  round: number,
  day: number,
  venue: "광명" | "창원" | "부산" = "광명",
): Promise<string | null> {
  const sb = getSupabase();

  if (venue === "부산") {
    // races.round는 text 컬럼이라 문자열로 비교한다
    const { data, error } = await sb
      .from("races")
      .select("date")
      .eq("venue", venue)
      .eq("year", year)
      .eq("round", String(round))
      .eq("day", day)
      .limit(1);
    if (error || !data?.length) return null;
    return (data[0].date as string) ?? null;
  }

  const { data, error } = await sb
    .from("decision_card_pages")
    .select("date")
    .eq("venue", venue)
    .eq("year", year)
    .eq("round", round)
    .eq("day", day)
    .maybeSingle();
  if (error || !data) return null;
  return (data.date as string) ?? null;
}
