import { NextRequest, NextResponse } from "next/server";
import {
  getAvailableYears,
  loadYearlyDecisionCard,
} from "@/lib/data-loader";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const year = sp.get("year");
  const round = sp.get("round");
  const day = sp.get("day");

  if (!year) {
    const years = getAvailableYears("yearly-decision-card");
    return NextResponse.json({ years });
  }

  const yearNum = parseInt(year, 10);

  try {
    const data = loadYearlyDecisionCard(yearNum);

    if (!round) {
      // Return meta
      const roundDayMap = new Map<number, Set<number>>();
      for (const page of data.pages) {
        if (!roundDayMap.has(page.round)) roundDayMap.set(page.round, new Set());
        roundDayMap.get(page.round)!.add(page.day);
      }
      const rounds = Array.from(roundDayMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([r, days]) => ({
          round: r,
          days: Array.from(days).sort((a, b) => a - b),
        }));
      return NextResponse.json({ year: yearNum, totalPages: data.totalPages, rounds });
    }

    const roundNum = parseInt(round, 10);
    const dayNum = day ? parseInt(day, 10) : null;

    let pages;
    if (dayNum) {
      pages = data.pages.filter((p) => p.round === roundNum && p.day === dayNum);
    } else {
      pages = data.pages.filter((p) => p.round === roundNum);
    }

    return NextResponse.json({
      year: yearNum,
      round: roundNum,
      day: dayNum,
      pages,
    });
  } catch {
    return NextResponse.json({ error: "Data not found" }, { status: 404 });
  }
}
