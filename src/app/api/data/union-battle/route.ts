import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 매일 새 경주 반영 (혼합 SSG, 1시간 캐시)
export const revalidate = 3600;

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("get_union_battle_stats");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
