import { getSupabase } from "@/lib/supabase";

export interface AvailabilityRecord {
  recent30: number;
  recent90: number;
  lastRaceDate: string | null;
  totalDays: number;
}

export interface AvailabilityResult {
  availability: Record<string, AvailabilityRecord>;
  dupNames: string[];
  asOfDate: string;
  totalEntries: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 최근 90일 동안 출주표에 등재된 선수의 광명 출전 가용율 계산
// - 기준일: 호출 시점 (서버 시간)
// - is_absent=true (결장) 는 출전으로 카운트하지 않음
// - 이름으로 GROUP BY (동명이인은 합산되며 dupNames에 기록)
export async function computeRacerAvailability(): Promise<AvailabilityResult> {
  const supabase = getSupabase();
  const today = new Date();
  const cutoff90 = new Date(today);
  cutoff90.setDate(cutoff90.getDate() - 90);
  const cutoff30 = new Date(today);
  cutoff30.setDate(cutoff30.getDate() - 30);
  const cutoff90Str = isoDate(cutoff90);
  const cutoff30Str = isoDate(cutoff30);

  // 1) racer_id → name 매핑 (year>=2024 만으로도 최근 90일 출전자 전원 커버됨)
  const idToName = new Map<string, string>();
  const nameToIds = new Map<string, Set<string>>();
  {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("racer_ids")
        .select("racer_id, name")
        .gte("year", 2024)
        .range(offset, offset + 999);
      if (error) throw new Error(`racer_ids fetch failed: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const r of data) {
        if (!r.racer_id || !r.name) continue;
        // kcycle 페이지의 2글자 이름은 "허  남"처럼 공백이 들어있음 → 정규화된 이름과 매칭되도록 공백 제거
        const name = r.name.replace(/\s+/g, "");
        if (!idToName.has(r.racer_id)) idToName.set(r.racer_id, name);
        if (!nameToIds.has(name)) nameToIds.set(name, new Set());
        nameToIds.get(name)!.add(r.racer_id);
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  // 2) 최근 90일 출주표 entries (decision_card_pages.date >= cutoff90)
  //    PostgREST inner-embed + 임베디드 컬럼 필터로 한 번에 처리
  interface RawEntry {
    racer_id: string | null;
    is_absent: boolean | null;
    decision_card_races: {
      decision_card_pages: { date: string };
    } | null;
  }
  const entries: RawEntry[] = [];
  {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("decision_card_entries")
        .select(
          "racer_id, is_absent, decision_card_races!inner(decision_card_pages!inner(date))"
        )
        .gte("decision_card_races.decision_card_pages.date", cutoff90Str)
        .range(offset, offset + 999);
      if (error) throw new Error(`entries fetch failed: ${error.message}`);
      if (!data || data.length === 0) break;
      entries.push(...(data as unknown as RawEntry[]));
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  // 3) 이름으로 GROUP BY 집계
  const tally = new Map<
    string,
    { recent30: number; recent90: number; dates: Set<string>; maxDate: string | null }
  >();
  for (const e of entries) {
    if (e.is_absent) continue;
    if (!e.racer_id) continue;
    const name = idToName.get(e.racer_id);
    if (!name) continue;
    const date = e.decision_card_races?.decision_card_pages?.date;
    if (!date) continue;

    let rec = tally.get(name);
    if (!rec) {
      rec = { recent30: 0, recent90: 0, dates: new Set(), maxDate: null };
      tally.set(name, rec);
    }
    rec.recent90++;
    if (date >= cutoff30Str) rec.recent30++;
    rec.dates.add(date);
    if (!rec.maxDate || date > rec.maxDate) rec.maxDate = date;
  }

  // 4) 동명이인 탐지: 90일 출전 기록이 있는 이름 중 racer_id가 2개 이상
  const dupNames: string[] = [];
  for (const name of tally.keys()) {
    const ids = nameToIds.get(name);
    if (ids && ids.size > 1) dupNames.push(name);
  }
  if (dupNames.length > 0) {
    console.warn(
      `[racer-availability] 동명이인 ${dupNames.length}명 (집계 합산됨): ${dupNames.join(", ")}`
    );
  }

  const availability: Record<string, AvailabilityRecord> = {};
  for (const [name, rec] of tally.entries()) {
    availability[name] = {
      recent30: rec.recent30,
      recent90: rec.recent90,
      lastRaceDate: rec.maxDate,
      totalDays: rec.dates.size,
    };
  }

  return {
    availability,
    dupNames,
    asOfDate: isoDate(today),
    totalEntries: entries.length,
  };
}
