import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  rowToRestaurant,
  type GyeongshullinRow,
} from "@/lib/gyeongshullin";

export const revalidate = 3600;

export async function GET() {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("gyeongshullin_restaurants")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as GyeongshullinRow[];
  return NextResponse.json(rows.map(rowToRestaurant));
}
