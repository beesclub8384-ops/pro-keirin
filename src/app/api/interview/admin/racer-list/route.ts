import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

interface Racer {
  racerId: string;
  name: string;
  region: string;
  photoUrl: string | null;
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

  const racers: Racer[] = (data ?? []).map((row) => {
    const training = row.training as string | null;
    const region = training ? String(training).split("/")[0].trim() : "기타";
    return {
      racerId: row.racer_id as string,
      name: row.name as string,
      region,
      photoUrl: (row.photo_url as string | null) ?? null,
    };
  });

  return NextResponse.json({ racers, year: maxYear });
}
