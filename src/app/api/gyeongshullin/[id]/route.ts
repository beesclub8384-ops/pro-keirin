import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  rowToRestaurant,
  type GyeongshullinRow,
} from "@/lib/gyeongshullin";

export const dynamic = "force-dynamic";

// published 맛집 단건 조회 — 상세 페이지가 전체 목록을 받지 않고 필요한 1건만 가져오도록.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("gyeongshullin_restaurants")
    .select("*")
    .eq("id", numId)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(rowToRestaurant(data as GyeongshullinRow));
}
