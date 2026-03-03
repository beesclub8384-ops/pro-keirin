import { NextRequest, NextResponse } from "next/server";
import {
  getAvailableYears,
  loadDividendStats,
  loadSalesStats,
  loadHighDividend,
  loadNoHitRaces,
} from "@/lib/data-loader";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const type = sp.get("type");
  const year = sp.get("year");

  if (!type) {
    return NextResponse.json({
      dividendYears: getAvailableYears("yearly-dividend-stats"),
      salesYears: getAvailableYears("yearly-sales-stats"),
      highDividendYears: getAvailableYears("yearly-high-dividend"),
    });
  }

  try {
    if (type === "no-hit") {
      const data = loadNoHitRaces();
      return NextResponse.json({ data });
    }

    if (!year) {
      return NextResponse.json({ error: "year is required" }, { status: 400 });
    }

    const yearNum = parseInt(year, 10);

    if (type === "dividend") {
      const all = loadDividendStats();
      const found = all.find((d) => d.year === yearNum);
      if (!found) return NextResponse.json({ error: "Data not found" }, { status: 404 });
      return NextResponse.json({ data: found });
    }

    if (type === "sales") {
      const all = loadSalesStats();
      const found = all.find((d) => d.year === yearNum);
      if (!found) return NextResponse.json({ error: "Data not found" }, { status: 404 });
      return NextResponse.json({ data: found });
    }

    if (type === "high-dividend") {
      const all = loadHighDividend();
      const found = all.find((d) => d.year === yearNum);
      if (!found) return NextResponse.json({ error: "Data not found" }, { status: 404 });
      return NextResponse.json({ data: found });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Data not found" }, { status: 404 });
  }
}
