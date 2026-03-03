import { NextRequest, NextResponse } from "next/server";
import {
  getAvailableYears,
  loadYearlyRaceDetail,
  loadRaceData,
  type RaceDetailRace,
  type RaceDataRecord,
} from "@/lib/data-loader";

// Cache race-data odds lookup map
let oddsCache: Map<string, RaceDataRecord> | null = null;

function getOddsMap(): Map<string, RaceDataRecord> {
  if (oddsCache) return oddsCache;
  const data = loadRaceData();
  oddsCache = new Map();
  for (const r of data) {
    oddsCache.set(`${r.date}|${r.raceNo}`, r);
  }
  return oddsCache;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const year = sp.get("year");
  const round = sp.get("round");
  const day = sp.get("day");

  if (!year) {
    const years = getAvailableYears("yearly-race-detail");
    return NextResponse.json({ years });
  }

  const yearNum = parseInt(year, 10);

  try {
    const data = loadYearlyRaceDetail(yearNum);

    // If only year, return meta (rounds/days)
    if (!round) {
      const roundDayMap = new Map<number, Set<number>>();
      for (const race of data.races) {
        if (!roundDayMap.has(race.round)) roundDayMap.set(race.round, new Set());
        roundDayMap.get(race.round)!.add(race.day);
      }
      const rounds = Array.from(roundDayMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([r, days]) => ({
          round: r,
          days: Array.from(days).sort((a, b) => a - b),
        }));
      return NextResponse.json({ year: yearNum, totalRaces: data.totalRaces, rounds });
    }

    const roundNum = parseInt(round, 10);
    const dayNum = day ? parseInt(day, 10) : null;

    // Filter races
    let races: RaceDetailRace[];
    if (dayNum) {
      races = data.races.filter((r) => r.round === roundNum && r.day === dayNum);
    } else {
      races = data.races.filter((r) => r.round === roundNum);
    }

    // Attach odds
    const oddsMap = getOddsMap();
    const racesWithOdds = races.map((race) => {
      const key = `${race.date}|${race.raceNo}`;
      const oddsRecord = oddsMap.get(key);
      return {
        ...race,
        odds: oddsRecord?.odds ?? null,
      };
    });

    return NextResponse.json({
      year: yearNum,
      round: roundNum,
      day: dayNum,
      races: racesWithOdds,
    });
  } catch {
    return NextResponse.json({ error: "Data not found" }, { status: 404 });
  }
}
