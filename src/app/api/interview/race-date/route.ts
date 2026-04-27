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

  const date = await lookupRaceDate(year, round, day);
  if (!date) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ date });
}
