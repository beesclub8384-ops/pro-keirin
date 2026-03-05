import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { transformRacerProfile, transformRanking } from "@/lib/db-transformers";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const sp = request.nextUrl.searchParams;
    const q = sp.get("q");
    const year = sp.get("year");

    if (!q) {
      // Return available years
      const { data, error } = await supabase
        .from("racer_profiles")
        .select("year")
        .order("year", { ascending: false });

      if (error) return NextResponse.json({ error: error.message, years: [] }, { status: 500 });
      const years = [...new Set(data.map((r) => r.year))];
      return NextResponse.json({ years });
    }

    const query = q.trim();
    if (query.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Search racer profiles with name matching
    let profileQuery = supabase
      .from("racer_profiles")
      .select("*")
      .ilike("name", `%${query}%`)
      .order("year", { ascending: false })
      .limit(200);

    if (year) {
      profileQuery = profileQuery.eq("year", parseInt(year, 10));
    }

    const { data: profiles, error: profileErr } = await profileQuery;

    if (profileErr || !profiles) {
      return NextResponse.json({ error: profileErr?.message, query, results: [] }, { status: 500 });
    }

    // Get ranking data for matched profiles
    const nameYearPairs = profiles.map((p) => ({ name: p.name, year: p.year }));
    const uniqueYears = [...new Set(nameYearPairs.map((p) => p.year))];

    // Fetch rankings for the relevant years
    const rankingMap = new Map<string, ReturnType<typeof transformRanking>>();

    for (const y of uniqueYears) {
      const names = nameYearPairs.filter((p) => p.year === y).map((p) => p.name);
      const { data: rankings } = await supabase
        .from("rankings")
        .select("*")
        .eq("year", y)
        .in("name", names);

      if (rankings) {
        for (const r of rankings) {
          const transformed = transformRanking(r);
          rankingMap.set(`${r.name}|${r.year}`, transformed);
        }
      }
    }

    const results = profiles.map((p) => {
      const profile = transformRacerProfile(p);
      const rKey = `${p.name}|${p.year}`;
      const ranking = rankingMap.get(rKey);
      return { ...profile, ranking: ranking ? (({ year: _y, ...rest }) => rest)(ranking) : undefined };
    });

    return NextResponse.json({ query, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
