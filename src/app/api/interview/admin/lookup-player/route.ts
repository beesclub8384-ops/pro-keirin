import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

function extractGrade(raceType: string | null): string | null {
  if (!raceType) return null;
  if (raceType.startsWith("선발")) return "선발";
  if (raceType.startsWith("우수")) return "우수";
  if (raceType.startsWith("특선")) return "특선";
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get("name") ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name 파라미터가 필요합니다" }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: profile } = await sb
    .from("racer_profiles")
    .select("racer_id, training, year")
    .eq("name", name)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "선수를 찾을 수 없습니다" }, { status: 404 });
  }

  const region = profile.training
    ? String(profile.training).split("/")[0].trim()
    : null;
  const racerId = profile.racer_id as string | null;

  let grade: string | null = null;
  if (racerId) {
    const { data: entry } = await sb
      .from("decision_card_entries")
      .select("dc_race_id")
      .eq("racer_id", racerId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (entry) {
      const { data: race } = await sb
        .from("decision_card_races")
        .select("race_type")
        .eq("id", entry.dc_race_id)
        .maybeSingle();

      grade = extractGrade(race?.race_type as string | null);
    }
  }

  return NextResponse.json({
    playerName: name,
    grade,
    region,
    racerId,
  });
}
