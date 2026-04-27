import { getSupabase } from "@/lib/supabase";

/**
 * decision_card_pages에서 (year, round, day)에 해당하는 경주일을 조회.
 * 없으면 null. 형식: "YYYY-MM-DD".
 */
export async function lookupRaceDate(
  year: number,
  round: number,
  day: number,
): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("decision_card_pages")
    .select("date")
    .eq("year", year)
    .eq("round", round)
    .eq("day", day)
    .maybeSingle();
  if (error || !data) return null;
  return (data.date as string) ?? null;
}
