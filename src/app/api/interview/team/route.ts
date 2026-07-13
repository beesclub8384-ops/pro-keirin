import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

interface Player {
  racerId: string;
  name: string;
  photoUrl: string | null;
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
    .select("racer_id, name, training, photo_url")
    .eq("is_union", true)
    .eq("year", maxYear)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 사진 carry-forward: maxYear 행에 photo_url이 없으면(신규 노조 연도 등)
  // 해당 선수의 과거 연도 최신 photo_url로 대체 (사진은 racer_id별로 안정적)
  const photoFallback = new Map<string, string>();
  const racerIds = (data ?? []).map((r) => r.racer_id as string);
  if (racerIds.length > 0) {
    const { data: photoRows } = await sb
      .from("racer_profiles")
      .select("racer_id, photo_url, year")
      .in("racer_id", racerIds)
      .not("photo_url", "is", null)
      .order("year", { ascending: false });
    for (const r of photoRows ?? []) {
      const id = r.racer_id as string;
      if (!photoFallback.has(id)) photoFallback.set(id, r.photo_url as string);
    }
  }

  const regionMap = new Map<string, Player[]>();
  for (const row of data ?? []) {
    const training = row.training as string | null;
    const region = training ? String(training).split("/")[0].trim() : "기타";
    const players = regionMap.get(region) ?? [];
    players.push({
      racerId: row.racer_id as string,
      name: row.name as string,
      photoUrl: (row.photo_url as string | null) ?? photoFallback.get(row.racer_id as string) ?? null,
    });
    regionMap.set(region, players);
  }

  const regions: RegionGroup[] = [...regionMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ko"))
    .map(([region, players]) => ({ region, players }));

  return NextResponse.json({ regions, year: maxYear });
}
