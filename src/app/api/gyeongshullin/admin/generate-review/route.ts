import { NextResponse } from "next/server";
import { generateGyeongshullinReview } from "@/lib/gyeongshullin-generator";

export async function POST(req: Request) {
  let body: {
    restaurantName?: string;
    address?: string;
    menu?: string;
    rawNote?: string;
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
    !body.restaurantName?.trim() ||
    !body.address?.trim() ||
    !body.recommenderName?.trim()
  ) {
    return NextResponse.json(
      { error: "가게 이름, 주소, 추천 선수 이름은 필수입니다" },
      { status: 400 },
    );
  }

  try {
    const review = await generateGyeongshullinReview({
      restaurantName: body.restaurantName,
      address: body.address,
      menu: body.menu,
      rawNote: body.rawNote,
      recommenderName: body.recommenderName,
      recommenderGrade: body.recommenderGrade,
      recommenderRegion: body.recommenderRegion,
    });
    return NextResponse.json({ review });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[gyeongshullin] generate-review failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
