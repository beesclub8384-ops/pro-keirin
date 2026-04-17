import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

interface Player {
  racerId: string;
  name: string;
}

interface RegionGroup {
  region: string;
  players: Player[];
}

export async function GET() {
  const sb = createAdminClient();

  const { data: maxYearRow } = await sb
    .from("racer_profiles")
    .select("year")
    .eq("is_union", true)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxYear = (maxYearRow?.year as number) ?? new Date().getFullYear();

  const { data, error } = await sb
    .from("racer_profiles")
    .select("racer_id, name, training")
    .eq("is_union", true)
    .eq("year", maxYear)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const regionMap = new Map<string, Player[]>();
  for (const row of data ?? []) {
    const training = row.training as string | null;
    const region = training ? String(training).split("/")[0].trim() : "기타";
    const players = regionMap.get(region) ?? [];
    players.push({
      racerId: row.racer_id as string,
      name: row.name as string,
    });
    regionMap.set(region, players);
  }

  const regions: RegionGroup[] = [...regionMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ko"))
    .map(([region, players]) => ({ region, players }));

  return NextResponse.json({ regions, year: maxYear });
}
