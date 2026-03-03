import { NextRequest, NextResponse } from "next/server";
import {
  getAvailableYears,
  loadYearlyRacerProfiles,
  loadRankingData,
  type RacerProfile,
  type RankingEntry,
} from "@/lib/data-loader";

// Cache ranking data
let rankingCache: Map<string, RankingEntry> | null = null;

function getRankingMap(): Map<string, RankingEntry> {
  if (rankingCache) return rankingCache;
  const data = loadRankingData();
  rankingCache = new Map();
  for (const yearData of data) {
    for (const r of yearData.rankings) {
      rankingCache.set(`${r.name}|${yearData.year}`, r);
    }
  }
  return rankingCache;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = sp.get("q");
  const year = sp.get("year");

  if (!q) {
    const years = getAvailableYears("yearly-racer-profile");
    return NextResponse.json({ years });
  }

  const query = q.trim();
  if (query.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const rankingMap = getRankingMap();
  const results: (RacerProfile & { ranking?: RankingEntry })[] = [];

  if (year) {
    // Search specific year
    const yearNum = parseInt(year, 10);
    try {
      const profiles = loadYearlyRacerProfiles(yearNum);
      for (const p of profiles) {
        if (p.name.includes(query)) {
          const rKey = `${p.name}|${p.year}`;
          results.push({ ...p, ranking: rankingMap.get(rKey) });
        }
      }
    } catch {
      // year not found
    }
  } else {
    // Search across all years (most recent first, limit results)
    const years = getAvailableYears("yearly-racer-profile");
    for (const y of years) {
      try {
        const profiles = loadYearlyRacerProfiles(y);
        for (const p of profiles) {
          if (p.name.includes(query)) {
            const rKey = `${p.name}|${p.year}`;
            results.push({ ...p, ranking: rankingMap.get(rKey) });
          }
        }
      } catch {
        continue;
      }
      if (results.length >= 200) break;
    }
  }

  return NextResponse.json({ query, results: results.slice(0, 200) });
}
