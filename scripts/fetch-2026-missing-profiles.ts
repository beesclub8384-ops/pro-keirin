// ============================================================
// 2026년 racer_profiles 누락 선수 보강 스크립트 (6명 타겟, 일회성)
// 배경: 2026년 프로필 수집 시 아래 6명이 누락되어 is_union 처리가 불가했음.
//      (2024/2025년엔 노조 true로 존재하나 2026년 행 자체가 없었음)
// 동작: kcycle 프로필 popup(2026) 스크래핑 → 연도/이름 검증 → Supabase upsert + is_union=true
// 사용법: npx tsx scripts/fetch-2026-missing-profiles.ts
// 파싱 로직은 scripts/fetch-racer-profile.ts 와 동일 규칙 사용
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
);

const YEAR = 2026;

// 대상 6명 (racer_ids 테이블 조회 결과)
const TARGETS: Array<{ racerId: string; name: string }> = [
  { racerId: "20230002", name: "김로운" },
  { racerId: "20090007", name: "김철민" },
  { racerId: "20220009", name: "김홍일" },
  { racerId: "20000010", name: "안성민" },
  { racerId: "20000028", name: "이정민" },
  { racerId: "20160016", name: "황준하" },
];

// --- 유틸 (fetch-racer-profile.ts 와 동일) ---
function safeNum(val: string): number {
  const n = parseFloat(val.replace(/,/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 1000) / 1000;
}

function decodeHtml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseInfoItems(html: string): { birthYear: string; height: number; weight: number; bloodType: string } {
  const result = { birthYear: "", height: 0, weight: 0, bloodType: "" };
  const items = [...html.matchAll(/<b class="tit">([\s\S]*?)<\/b>\s*<i class="txt">([\s\S]*?)<\/i>/g)];
  for (const m of items) {
    const key = m[1].replace(/<[^>]*>/g, "").trim();
    const val = decodeHtml(m[2].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " ");
    if (key === "출생년도") {
      result.birthYear = val;
    } else if (key.includes("신장") && key.includes("체중")) {
      const hm = val.match(/(\d+)\s*cm/);
      const wm = val.match(/(\d+)\s*kg/);
      if (hm) result.height = parseInt(hm[1]);
      if (wm) result.weight = parseInt(wm[1]);
    } else if (key === "혈액형") {
      result.bloodType = val;
    }
  }
  return result;
}

interface ParsedProfile {
  racerId: string;
  name: string;
  year: number;
  birthYear: string;
  height: number;
  weight: number;
  bloodType: string;
  gradeChange: string;
  grade: string;
  winRate: number;
  top2Rate: number;
  top3Rate: number;
  raceCount: number;
  runDays: number;
  recent3Score: number;
  recent3Rank: number;
  totalAvgScore: number;
  totalRankScore: number;
  recent200m: string;
  training: string;
  tactics: { preemptive: number[]; push: number[]; chase: number[]; mark: number[] };
  violations: Record<string, number>;
  indices: { preemptive: number; push: number; chase: number; mark: number };
}

function parseProfile(html: string, racerId: string, name: string, year: number): ParsedProfile | null {
  const bodyInfo = parseInfoItems(html);
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];
  if (tables.length < 9) return null;

  function getTds(tableIdx: number): string[] {
    const table = tables[tableIdx][1];
    return [...table.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map((m) => decodeHtml(m[1].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " "));
  }

  const t0 = getTds(0);
  const t1 = getTds(1);
  const t2 = getTds(2);
  const t3 = getTds(3);
  const t4 = getTds(4);
  const t6 = getTds(6);

  return {
    racerId,
    name,
    year,
    birthYear: bodyInfo.birthYear,
    height: bodyInfo.height,
    weight: bodyInfo.weight,
    bloodType: bodyInfo.bloodType,
    gradeChange: t0[0] || "",
    grade: ((t0[0] || "").match(/\(현\)\s*([A-Z0-9]+)/)?.[1]) || "",
    winRate: safeNum(t0[1] || "0"),
    top2Rate: safeNum(t0[2] || "0"),
    top3Rate: safeNum(t0[3] || "0"),
    raceCount: safeNum(t0[4] || "0"),
    runDays: safeNum(t0[5] || "0"),
    recent3Score: safeNum(t1[0] || "0"),
    recent3Rank: safeNum(t1[1] || "0"),
    totalAvgScore: safeNum(t1[2] || "0"),
    totalRankScore: safeNum(t1[3] || "0"),
    recent200m: (t1[4] || "").trim(),
    training: (t1[5] || "").trim(),
    tactics: {
      preemptive: [safeNum(t2[0] || "0"), safeNum(t2[1] || "0"), safeNum(t2[2] || "0")],
      push: [safeNum(t2[3] || "0"), safeNum(t2[4] || "0"), safeNum(t2[5] || "0")],
      chase: [safeNum(t3[0] || "0"), safeNum(t3[1] || "0"), safeNum(t3[2] || "0")],
      mark: [safeNum(t3[3] || "0"), safeNum(t3[4] || "0"), safeNum(t3[5] || "0")],
    },
    violations: {
      disqualification: safeNum(t4[0] || "0"),
      warning: safeNum(t4[1] || "0"),
      caution: safeNum(t4[2] || "0"),
      fallWithdraw: safeNum(t4[3] || "0"),
      fallEntry: safeNum(t4[4] || "0"),
      accidentWithdraw: safeNum(t4[5] || "0"),
      accidentEntry: safeNum(t4[6] || "0"),
    },
    indices: {
      preemptive: safeNum(t6[1] || "0"),
      push: safeNum(t6[2] || "0"),
      chase: safeNum(t6[3] || "0"),
      mark: safeNum(t6[4] || "0"),
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`=== 2026년 누락 ${TARGETS.length}명 프로필 보강 시작 ===\n`);
  const rows: Array<Record<string, unknown>> = [];
  const skipped: string[] = [];

  for (const { racerId, name } of TARGETS) {
    const url = `https://www.kcycle.or.kr/racer/info/popup/${racerId}/${YEAR}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  ✗ ${name}(${racerId}): HTTP ${res.status} → 스킵`);
      skipped.push(name);
      continue;
    }
    const html = await res.text();

    // --- kcycle 응답 검증 (필수): 연도 + 이름 일치 확인 ---
    const yearMatch = html.match(/var\s+raceyy\s*=\s*"(\d{4})"/);
    const pageYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const nameMatch = html.match(/<b class="name">([\s\S]*?)<\/b>/);
    const pageName = nameMatch ? nameMatch[1].replace(/<[^>]*>/g, "").trim() : null;

    if (pageYear !== YEAR) {
      console.error(`  ✗ ${name}(${racerId}): 연도 불일치 (요청 ${YEAR}, 응답 ${pageYear}) → 스킵`);
      skipped.push(name);
      continue;
    }
    if (pageName !== name) {
      console.error(`  ✗ ${name}(${racerId}): 이름 불일치 (요청 ${name}, 응답 ${pageName}) → 스킵`);
      skipped.push(name);
      continue;
    }

    const p = parseProfile(html, racerId, name, YEAR);
    if (!p) {
      console.error(`  ✗ ${name}(${racerId}): 프로필 파싱 실패(테이블 부족) → 스킵`);
      skipped.push(name);
      continue;
    }

    rows.push({
      racer_id: p.racerId,
      name: p.name,
      year: p.year,
      birth_year: p.birthYear || null,
      height: p.height || null,
      weight: p.weight || null,
      blood_type: p.bloodType || null,
      grade_change: p.gradeChange || null,
      grade: p.grade || null,
      win_rate: p.winRate ?? null,
      top2_rate: p.top2Rate ?? null,
      top3_rate: p.top3Rate ?? null,
      race_count: p.raceCount ?? null,
      run_days: p.runDays ?? null,
      recent3_score: p.recent3Score ?? null,
      recent3_rank: p.recent3Rank ?? null,
      total_avg_score: p.totalAvgScore ?? null,
      total_rank_score: p.totalRankScore ?? null,
      recent_200m: p.recent200m || null,
      training: p.training || null,
      tactics: p.tactics ?? null,
      violations: p.violations ?? null,
      indices: p.indices ?? null,
      is_union: true, // 6명 전원 노조 조합원
    });

    console.log(`  ✓ ${name}(${racerId}): grade=${p.grade || "-"} 훈련지=${p.training} 검증통과`);
    await delay(500);
  }

  if (rows.length === 0) {
    console.error("\n수집된 프로필이 없습니다. 종료.");
    process.exit(1);
  }

  const { error } = await supabase
    .from("racer_profiles")
    .upsert(rows, { onConflict: "racer_id,year" });
  if (error) {
    console.error("\nUpsert 실패:", error.message);
    process.exit(1);
  }

  console.log(`\n=== 완료: ${rows.length}명 upsert (is_union=true) ===`);
  if (skipped.length) console.log(`스킵(${skipped.length}명): ${skipped.join(", ")}`);
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
