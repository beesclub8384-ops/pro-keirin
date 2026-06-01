import { NextResponse } from "next/server";
import { computeRacerAvailability } from "@/lib/racer-availability";

export const revalidate = 1800; // 30분 (출주표 갱신 주기)

export async function GET() {
  try {
    const result = await computeRacerAvailability();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
