import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase";
import {
  extractRegion,
  rowToRestaurant,
  type GyeongshullinRow,
  type GyeongshullinStatus,
} from "@/lib/gyeongshullin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
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
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(rowToRestaurant(data as GyeongshullinRow));
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
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
    status?: GyeongshullinStatus;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.address !== undefined) {
    update.address = body.address.trim();
    update.region = extractRegion(body.address);
  }
  if (body.menu !== undefined) update.menu = body.menu.trim() || null;
  if (body.memo !== undefined) update.memo = body.memo.trim() || null;
  if (body.rawNote !== undefined) update.raw_note = body.rawNote.trim() || null;
  if (body.foodPhotos !== undefined) update.food_photos = body.foodPhotos;
  if (body.menuPhotos !== undefined) update.menu_photos = body.menuPhotos;
  if (body.recommenderName !== undefined)
    update.recommender_name = body.recommenderName.trim();
  if (body.recommenderGrade !== undefined)
    update.recommender_grade = body.recommenderGrade.trim() || null;
  if (body.recommenderRegion !== undefined)
    update.recommender_region = body.recommenderRegion.trim() || null;
  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "published") {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    update.status = body.status;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "no fields to update" },
      { status: 400 },
    );
  }
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("gyeongshullin_restaurants")
    .update(update)
    .eq("id", numId)
    .select("*")
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/interview/gyeongshullin");
  revalidatePath(`/interview/gyeongshullin/${numId}`);
  return NextResponse.json(rowToRestaurant(data as GyeongshullinRow));
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const sb = createAdminClient();
  const { error } = await sb
    .from("gyeongshullin_restaurants")
    .delete()
    .eq("id", numId);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/interview/gyeongshullin");
  return NextResponse.json({ success: true });
}
