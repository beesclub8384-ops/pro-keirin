import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchAndSeedLatest } from "@/lib/decision-card-latest";

export const maxDuration = 60;

export async function GET(request: Request) {
  // CRON_SECRET 헤더 검증
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Supabase 클라이언트: SERVICE_ROLE_KEY 우선, 없으면 ANON_KEY fallback
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const result = await fetchAndSeedLatest(supabase);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
