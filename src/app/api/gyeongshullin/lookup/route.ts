import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get("name") ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name 파라미터가 필요합니다" }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: profile } = await sb
    .from("racer_profiles")
    .select("training, year")
    .eq("name", name)
    .eq("is_union", true)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ found: false });
  }

  const training = (profile.training as string | null) ?? "";
  const region = training ? String(training).split("/")[0].trim() : "";

  return NextResponse.json({ found: true, region });
}
