import { NextRequest, NextResponse } from "next/server";
import { lookupRaceDate } from "@/lib/race-date";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const year = Number(sp.get("year"));
  const round = Number(sp.get("round"));
  const day = Number(sp.get("day"));

  if (!Number.isFinite(year) || !Number.isFinite(round) || !Number.isFinite(day)
      || year <= 0 || round <= 0 || day <= 0) {
    return NextResponse.json(
      { error: "year, round, day are required positive integers" },
      { status: 400 },
    );
  }

  // venue 미지정 시 광명 (기존 호출자 호환)
  const venueParam = sp.get("venue");
  const venue =
    venueParam === "창원" || venueParam === "부산" || venueParam === "광명"
      ? venueParam
      : "광명";

  const date = await lookupRaceDate(year, round, day, venue);
  if (!date) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ date });
}
