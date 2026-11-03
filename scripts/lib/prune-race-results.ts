// ============================================================
// race_results 정리(prune): 원본 페이지에 없는 배번 행 삭제
//
// 배경 (2026-10-13 seed-races.ts 사고 후속):
//   광명 결과가 같은 (year,round,day,race_no) 키의 창원·부산 race_id 에 덮어써졌다.
//   재수집은 upsert(race_id,back_no) 라서, 광명 사본에는 있었지만 실제 경주에는 없는
//   배번 행이 그대로 남는다 (창원 복구 후 26행 잔존 — 2026-11-03 실측).
//
// 동작: 방금 원본에서 파싱한 경주별 배번 집합(keep)에 없는 행만 삭제한다.
// 안전장치:
//   - 호출자는 upsert 가 에러 없이 끝난 경우에만 호출해야 한다
//   - 원본 배번이 0개인 경주는 건드리지 않는다 (파싱 실패를 "전부 삭제"로 오인 방지)
//   - 한 경주에서 기존 행의 절반 넘게 지우게 되면 삭제하지 않고 경고만 낸다
//   - 삭제 전 대상 행(id, 배번, 이름)을 모두 로그로 남긴다
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PruneTarget {
  raceId: number;
  label: string; // 로그용 (예: "부산 2022-06-17 3R")
  keepBackNos: number[];
}

export async function pruneRaceResults(
  supabase: SupabaseClient,
  targets: PruneTarget[],
): Promise<{ deleted: number; skipped: number }> {
  let deleted = 0;
  let skipped = 0;
  for (const t of targets) {
    if (t.keepBackNos.length === 0) {
      console.warn(`  ⚠️ prune 건너뜀 (원본 배번 0개): ${t.label}`);
      skipped++;
      continue;
    }
    const { data, error } = await supabase
      .from("race_results")
      .select("id, back_no, name")
      .eq("race_id", t.raceId)
      .order("id", { ascending: true });
    if (error || !data) {
      console.error(`  prune 조회 에러 (${t.label}):`, error?.message);
      skipped++;
      continue;
    }
    const keep = new Set(t.keepBackNos);
    const extra = data.filter((r) => !keep.has(r.back_no));
    if (extra.length === 0) continue;
    if (extra.length * 2 > data.length) {
      console.warn(
        `  ⚠️ prune 건너뜀 (삭제 ${extra.length}/${data.length}행 — 절반 초과): ${t.label}`,
      );
      skipped++;
      continue;
    }
    for (const r of extra) {
      console.log(`  prune 삭제: ${t.label} id=${r.id} 배번 ${r.back_no} ${r.name}`);
    }
    const { error: delErr } = await supabase
      .from("race_results")
      .delete()
      .in("id", extra.map((r) => r.id));
    if (delErr) {
      console.error(`  prune 삭제 에러 (${t.label}):`, delErr.message);
      skipped++;
      continue;
    }
    deleted += extra.length;
  }
  console.log(`  → prune: 삭제 ${deleted}행 / 건너뜀 ${skipped}경주`);
  return { deleted, skipped };
}
