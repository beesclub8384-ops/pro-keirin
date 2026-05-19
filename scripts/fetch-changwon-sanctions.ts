// ============================================================
// 창원 심판제재선수 수집 + Supabase(judge_sanctions) 적재
// 데이터 소스: https://www.lepopark.or.kr/api/racer/penalty (JSON)
//
// 사용법:
//   npx tsx scripts/fetch-changwon-sanctions.ts
//
// 설계:
//   - GET /api/racer/penalty?page={0-base}&size=100 → { content:[], totalElements }
//   - 전체 페이지 순회 (총 ~630건)
//   - judge_sanctions 에 venue='창원' 으로 upsert
//   - onConflict: no,race_year,venue
//     (2026-05-19 마이그레이션으로 unique 제약에 venue 추가 — venue 없으면
//      광명 행과 (no,race_year) 충돌하여 광명 데이터를 덮어쓰는 무음 손상 발생)
//
// 필드 매핑 (lepopark API → judge_sanctions):
//   kname→racer_name, racerid→racer_id, rcyear→race_year, venue='창원',
//   rctimes→round, rcdays→day, raceno→race_no, penaltynm→sanction_type,
//   penout1(회)/penout2(일)→sanction_value, penbasenm→regulation,
//   pendetail→reason (penreasonnm 은 날짜류 코드라 부적합), pendetail→race_info,
//   seqviol→no(onConflict 키), rcdate→scraped_at
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(또는 ANON_KEY)가 필요합니다.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const VENUE = "창원";
const API = "https://www.lepopark.or.kr/api/racer/penalty";
const PAGE_SIZE = 100;
const DELAY_MS = 500;
const BATCH = 50;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface PenaltyItem {
  seqviol: number;
  rcdate: string | null; // YYYYMMDD
  racerid: string | null;
  rcyear: number | null;
  rctimes: number | string | null;
  rcdays: number | string | null;
  raceno: number | string | null;
  kname: string | null;
  pendetail: string | null;
  penout1: string | number | null;
  penout2: string | number | null;
  penaltynm: string | null;
  penbasenm: string | null;
  penreasonnm: string | null;
}

interface SanctionRow {
  no: number;
  racer_name: string | null;
  generation: string | null;
  racer_id: string | null;
  race_info: string | null;
  race_year: number | null;
  venue: string;
  round: number | null;
  day: number | null;
  race_no: number | null;
  regulation: string | null;
  reason: string | null;
  sanction_type: string | null;
  sanction_value: string | null;
  sanction_days: number | null;
  sanction_unit: string | null;
  scraped_at: string | null;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

// rcdate(YYYYMMDD) → ISO (KST 자정)
function rcdateToIso(rcdate: string | null): string | null {
  if (!rcdate || !/^\d{8}$/.test(rcdate)) return null;
  return `${rcdate.slice(0, 4)}-${rcdate.slice(4, 6)}-${rcdate.slice(6, 8)}T00:00:00+09:00`;
}

function mapItem(it: PenaltyItem): SanctionRow {
  const p1 = it.penout1 !== null && it.penout1 !== undefined && String(it.penout1) !== "";
  const p2 = it.penout2 !== null && it.penout2 !== undefined && String(it.penout2) !== "";
  const sanction_value =
    `${it.penaltynm || ""} ${p1 ? it.penout1 + "회" : ""}${p2 ? it.penout2 + "일" : ""}`
      .replace(/\s+/g, " ")
      .trim() || null;
  // sanction_days/unit: 일 우선, 없으면 회
  let sanction_days: number | null = null;
  let sanction_unit: string | null = null;
  if (p2) {
    sanction_days = toInt(it.penout2);
    sanction_unit = "일";
  } else if (p1) {
    sanction_days = toInt(it.penout1);
    sanction_unit = "회";
  }

  return {
    no: it.seqviol,
    racer_name: it.kname || null,
    generation: null, // lepopark API 미제공
    racer_id: it.racerid ? String(it.racerid) : null,
    race_info: it.pendetail || null,
    race_year: toInt(it.rcyear),
    venue: VENUE,
    round: toInt(it.rctimes),
    day: toInt(it.rcdays),
    race_no: toInt(it.raceno),
    regulation: it.penbasenm || null,
    // pendetail 이 서술형 사유 텍스트("창원 제14회 2일째 4경주 7번 … 위반점 50점").
    // penreasonnm 은 날짜류 코드값이라 reason 으로 부적합 → pendetail 우선
    reason: it.pendetail || it.penreasonnm || null,
    sanction_type: it.penaltynm || null,
    sanction_value,
    sanction_days,
    sanction_unit,
    scraped_at: rcdateToIso(it.rcdate),
  };
}

async function fetchPage(page: number): Promise<{ content: PenaltyItem[]; total: number }> {
  const url = `${API}?boardid=&name=&page=${page}&size=${PAGE_SIZE}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} (page=${page})`);
  const j = (await res.json()) as { content?: PenaltyItem[]; totalElements?: number };
  return { content: j.content || [], total: j.totalElements || 0 };
}

async function main() {
  console.log("=== 창원 심판제재선수 수집 (lepopark) ===");

  const first = await fetchPage(0);
  const total = first.total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  console.log(`  총 ${total}건 / ${totalPages}페이지 (size=${PAGE_SIZE})`);

  const all: PenaltyItem[] = [...first.content];
  for (let p = 1; p < totalPages; p++) {
    await delay(DELAY_MS);
    try {
      const { content } = await fetchPage(p);
      all.push(...content);
      console.log(`  page ${p + 1}/${totalPages}: 누적 ${all.length}건`);
    } catch (err) {
      console.error(`  ERROR page ${p}:`, err instanceof Error ? err.message : String(err));
    }
  }

  // seqviol 누락 / race_year 누락 행은 onConflict 키 불완전 → 스킵 (무음 손상 방지)
  const rows: SanctionRow[] = [];
  let skipped = 0;
  for (const it of all) {
    if (it.seqviol === null || it.seqviol === undefined || toInt(it.rcyear) === null) {
      skipped++;
      continue;
    }
    rows.push(mapItem(it));
  }
  console.log(`  매핑: ${rows.length}건 (스킵 ${skipped}건: no/race_year 누락)`);

  let saved = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("judge_sanctions")
      .upsert(batch, { onConflict: "no,race_year,venue" });
    if (error) {
      console.error(`  upsert 에러 (batch ${i}):`, error.message);
    } else {
      saved += batch.length;
    }
  }
  console.log(`  저장 완료: ${saved}건`);

  const { count } = await supabase
    .from("judge_sanctions")
    .select("*", { count: "exact", head: true })
    .eq("venue", VENUE);
  console.log(`  DB 재조회 (venue=창원): ${count}건`);
  console.log("=== 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
