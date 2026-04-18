import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase";
import {
  extractRegion,
  rowToRestaurant,
  type GyeongshullinRow,
} from "@/lib/gyeongshullin";

export async function GET() {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("gyeongshullin_restaurants")
    .select("*")
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as GyeongshullinRow[];
  return NextResponse.json(rows.map(rowToRestaurant));
}

export async function POST(req: Request) {
  let body: {
    name?: string;
    address?: string;
    menu?: string;
    memo?: string;
    rawNote?: string;
    foodPhotos?: string[];
    menuPhotos?: string[];
    recommenderName?: string;
    recommenderGrade?: string;
    recommenderRegion?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  if (
    !body.name?.trim() ||
    !body.address?.trim() ||
    !body.recommenderName?.trim()
  ) {
    return NextResponse.json(
      { error: "가게 이름, 주소, 추천 선수 이름은 필수입니다" },
      { status: 400 },
    );
  }
  const sb = createAdminClient();
  const insertPayload = {
    name: body.name.trim(),
    address: body.address.trim(),
    region: extractRegion(body.address),
    menu: body.menu?.trim() ?? null,
    memo: body.memo?.trim() ?? null,
    raw_note: body.rawNote?.trim() ?? null,
    food_photos: body.foodPhotos ?? [],
    menu_photos: body.menuPhotos ?? [],
    recommender_name: body.recommenderName.trim(),
    recommender_grade: body.recommenderGrade?.trim() ?? null,
    recommender_region: body.recommenderRegion?.trim() ?? null,
    status: "draft" as const,
  };
  const { data, error } = await sb
    .from("gyeongshullin_restaurants")
    .insert(insertPayload)
    .select("*")
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/interview/gyeongshullin");
  return NextResponse.json(rowToRestaurant(data as GyeongshullinRow));
}
