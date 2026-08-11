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

interface AvailabilityRow {
  racer_name: string;
  racer_ids: string[] | null;
  recent30: number;
  recent90: number;
  last_race_date: string | null;
  total_days: number;
  total_entries: number;
}

// 최근 90일 동안 출주표에 등재된 선수의 출전 가용율 계산
// - 기준일: 호출 시점 (서버 시간)
// - is_absent=true (결장) 는 출전으로 카운트하지 않음
// - 이름으로 GROUP BY (동명이인은 합산되며 dupNames에 기록)
//
// 집계는 fn_racer_availability RPC 가 DB에서 수행한다.
// (PostgREST 임베드로 원본 행을 끌어오면 LATERAL 내부 LIMIT 탓에
//  decision_card_entries 전체 Seq Scan 이 걸려 3초 타임아웃에 상시 실패했다.
//  supabase/migrations/20260811_racer_availability_rpc.sql 참고)
export async function computeRacerAvailability(): Promise<AvailabilityResult> {
  const supabase = getSupabase();
  const today = new Date();
  const cutoff90 = new Date(today);
  cutoff90.setDate(cutoff90.getDate() - 90);
  const cutoff30 = new Date(today);
  cutoff30.setDate(cutoff30.getDate() - 30);

  const { data, error } = await supabase.rpc("fn_racer_availability", {
    p_cutoff90: isoDate(cutoff90),
    p_cutoff30: isoDate(cutoff30),
  });
  if (error) throw new Error(`availability rpc failed: ${error.message}`);

  const rows = (data ?? []) as AvailabilityRow[];

  const availability: Record<string, AvailabilityRecord> = {};
  const dupNames: string[] = [];
  for (const r of rows) {
    availability[r.racer_name] = {
      recent30: r.recent30,
      recent90: r.recent90,
      lastRaceDate: r.last_race_date,
      totalDays: r.total_days,
    };
    // 동명이인: 그 이름에 매핑된 racer_id 가 2개 이상
    if ((r.racer_ids?.length ?? 0) > 1) dupNames.push(r.racer_name);
  }
  if (dupNames.length > 0) {
    console.warn(
      `[racer-availability] 동명이인 ${dupNames.length}명 (집계 합산됨): ${dupNames.join(", ")}`
    );
  }

  return {
    availability,
    dupNames,
    asOfDate: isoDate(today),
    // 기간 내 원본 엔트리 수 — 모든 행에 같은 값이 실려 온다
    totalEntries: rows[0]?.total_entries ?? 0,
  };
}
