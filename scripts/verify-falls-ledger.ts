/**
 * 낙차 대장 교차검증 — buildFallsReport 결과를 SQL로 확정한 값과 비교한다.
 *
 * 읽기 전용. 왜 필요한가:
 *   낙차 대장의 위험은 전부 "에러 없이 조용히 틀리는" 쪽이다
 *   (빈값 '-' vs NULL, 1000행 제한, 출주표 조인 실패).
 *   건수 검증만으로는 안 걸리므로, 사람이 SQL로 직접 확인한 값을 못 박아두고
 *   로직이 그 값을 재현하는지 본다.
 *
 * 실행: npx tsx scripts/verify-falls-ledger.ts   (npm run verify:falls)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { buildFallsReport } from "../src/lib/falls-query";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

let pass = true;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) pass = false;
  console.log(
    `${ok ? "✅" : "❌"} ${label}\n     실제=${JSON.stringify(actual)} 기대=${JSON.stringify(expected)}`,
  );
}

async function main() {
  // 1) 2025-07-11 광명 → 4건 (김규윤·김범중·이상경·황무현)
  {
    const r = await buildFallsReport(sb, { from: "2025-07-11", to: "2025-07-11", venue: "광명" });
    check("2025-07-11 광명 건수", r.rows.length, 4);
    check("2025-07-11 광명 선수", r.rows.map((x) => x.name).sort(), ["김규윤", "김범중", "이상경", "황무현"]);
    const t = r.totals.find((x) => x.venue === "광명")!;
    check("2025-07-11 광명 분모(경주/행)", [t.raceCount, t.entryCount], [16, 112]);
    check("2025-07-11 racer_id 전부 확정", r.rows.every((x) => x.matched), true);
  }

  // 2) 2025-07-12 → 광명 2 + 창원 1. 창원 박민오는 withdrawal 만 있고 나머지는 NULL
  {
    const r = await buildFallsReport(sb, { from: "2025-07-12", to: "2025-07-12", venue: "all" });
    check("2025-07-12 광명 건수", r.rows.filter((x) => x.venue === "광명").length, 2);
    check("2025-07-12 창원 건수", r.rows.filter((x) => x.venue === "창원").length, 1);
    const pmo = r.rows.find((x) => x.name === "박민오");
    check("박민오 행 존재 (NULL 빈값 처리 검증)", pmo !== undefined, true);
    check("박민오 [낙차, 실격, 골인후]", [pmo?.fallType, pmo?.isDisqualified, pmo?.finishNote], ["낙차", false, null]);
    // 완주 후 낙차는 착순이 있고 fallType 이 null 이어야 한다 (경주 중 낙차와 섞이면 통계가 틀린다)
    const kyg = r.rows.find((x) => x.name === "김용규");
    check("김용규 골인후낙차 [착순, 골인후, 낙차]", [kyg?.rank, kyg?.finishNote, kyg?.fallType], [4, "골인후낙차", null]);
  }

  // 3) 사고 0건 날짜 3개 — 0건이면서 분모는 존재해야 한다
  for (const [d, expectedEntries] of [["2025-05-02", 196], ["2025-06-07", 195], ["2025-06-14", 194]] as const) {
    const r = await buildFallsReport(sb, { from: d, to: d, venue: "all" });
    const races = r.totals.reduce((s, t) => s + t.raceCount, 0);
    const entries = r.totals.reduce((s, t) => s + t.entryCount, 0);
    check(`${d} 사고 0건`, r.rows.length, 0);
    check(`${d} 분모(경주/행)`, [races, entries], [28, expectedEntries]);
  }

  // 4) 부산 2025 월별 — withdrawal/finish/disqualified 중 하나라도 값 있는 행
  {
    const expected = [2, 6, 13, 11, 1, 9, 10, 9, 1, 12, 11, 4];
    const got: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const from = `2025-${String(m).padStart(2, "0")}-01`;
      const to = new Date(Date.UTC(2025, m, 0)).toISOString().slice(0, 10);
      const r = await buildFallsReport(sb, { from, to, venue: "부산" });
      got.push(r.rows.filter((x) => x.fallType !== null || x.isDisqualified || x.finishNote !== null).length);
    }
    check("부산 2025 월별 합계", got, expected);
  }

  // 5) 경고 줄 — 출주표/결과 불일치
  {
    const r = await buildFallsReport(sb, { from: "2026-08-17", to: "2026-10-11", venue: "all" });
    const w = (d: string, v: string) => r.warnings.find((x) => x.date === d && x.venue === v);
    check("경고 2026-09-11 광명 [출주표, 결과, 종류]", [w("2026-09-11", "광명")?.dcEntryCount, w("2026-09-11", "광명")?.entryCount, w("2026-09-11", "광명")?.kind], [112, 0, "결과 누락"]);
    check("경고 2026-08-28 부산 [출주표, 결과]", [w("2026-08-28", "부산")?.dcEntryCount, w("2026-08-28", "부산")?.entryCount], [42, 0]);
    check("경고 2026-08-28 창원 [출주표, 결과]", [w("2026-08-28", "창원")?.dcEntryCount, w("2026-08-28", "창원")?.entryCount], [42, 0]);
    check("경고 2026-09-19 창원 결과없는엔트리", w("2026-09-19", "창원")?.missingResults, 1);
    check("경고 2026-08-23 부산 종류", w("2026-08-23", "부산")?.kind, "출주표 누락");
    check("2026-10-11 광명은 그룹에 없음(개최 미확정)", r.totals.some((t) => t.date === "2026-10-11" && t.venue === "광명"), false);
    console.log(`     경고 ${r.warnings.length}건: ${r.warnings.map((x) => `${x.date} ${x.venue} ${x.kind}`).join(" / ")}`);
  }

  console.log(pass ? "\n🎉 교차검증 전부 통과" : "\n⚠️ 불일치 있음");
  process.exit(pass ? 0 : 1);
}

void main();
