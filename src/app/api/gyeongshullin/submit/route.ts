import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase";
import { extractRegion } from "@/lib/gyeongshullin";

export async function POST(req: Request) {
  let body: {
    name?: string;
    address?: string;
    menu?: string;
    menuDescription?: string;
    otherNote?: string;
    recommenderName?: string;
    recommenderGrade?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.address?.trim() || !body.recommenderName?.trim()) {
    return NextResponse.json(
      { error: "가게 이름, 주소, 추천 선수 이름은 필수입니다" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();

  const { data: profile } = await sb
    .from("racer_profiles")
    .select("training")
    .eq("name", body.recommenderName.trim())
    .eq("is_union", true)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: "조합원 명단에서 이름을 찾을 수 없습니다. 이름을 다시 확인해주세요." },
      { status: 400 },
    );
  }

  const training = (profile.training as string | null) ?? "";
  const region = training ? String(training).split("/")[0].trim() : "";

  const noteLines: string[] = [];
  if (body.menu?.trim()) noteLines.push(`[메뉴] ${body.menu.trim()}`);
  if (body.menuDescription?.trim())
    noteLines.push(`[메뉴 특징] ${body.menuDescription.trim()}`);
  if (body.otherNote?.trim()) noteLines.push(`[기타] ${body.otherNote.trim()}`);
  const rawNote = noteLines.join("\n\n");

  const insertPayload = {
    name: body.name.trim(),
    address: body.address.trim(),
    region: extractRegion(body.address),
    menu: body.menu?.trim() ?? null,
    memo: null,
    raw_note: rawNote || null,
    food_photos: [],
    menu_photos: [],
    recommender_name: body.recommenderName.trim(),
    recommender_grade: body.recommenderGrade?.trim() ?? null,
    recommender_region: region,
    status: "draft" as const,
  };

  const { data, error } = await sb
    .from("gyeongshullin_restaurants")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/interview/gyeongshullin/admin");

  return NextResponse.json({ success: true, id: data.id });
}
