// ============================================================
// 부산 심판제재선수 수집 + Supabase(judge_sanctions) 적재
// 데이터 소스: https://www.spo1.or.kr/racer/racerSanction.do (SSR 게시판)
//
// 사용법:
//   npx tsx scripts/fetch-busan-sanctions.ts
//
// 설계:
//   - GET /racer/racerSanction.do?pageIndex={1-base} → SSR HTML, 10건/페이지
//   - 1페이지 최상단 번호 = 누적 총건수 → totalPages = ceil(maxNo/10)
//   - spo1 인증서 체인 문제 → NODE_TLS_REJECT_UNAUTHORIZED=0
//   - judge_sanctions 에 venue='부산' upsert
//   - onConflict: no,race_year,venue
//     (2026-05-19 마이그레이션으로 venue 포함 — 없으면 광명/(no,race_year) 충돌)
//
// 컬럼: 번호 | 제재선수 | 제재내용 | 제재사유 | 작성일 | 자료관리부서 | 최근업데이트
// 제재사유 마커: ○해당경주: 26년 제1회차 2일 5경주 / ○시행규정: ... / ○제재사유: ...
// ============================================================

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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

const VENUE = "부산";
const BASE = "https://www.spo1.or.kr/racer/racerSanction.do";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DELAY_MS = 500;
const BATCH = 50;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function strip(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
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

const SANCTION_TYPES = [
  "출전정지",
  "서면경고",
  "주선제외",
  "경주관여금지",
  "경주관여정지",
  "등록취소",
  "기타",
];

function parseSanctionContent(raw: string): {
  sanction_type: string | null;
  sanction_value: string | null;
  sanction_days: number | null;
  sanction_unit: string | null;
} {
  let sanction_type: string | null = null;
  for (const t of SANCTION_TYPES) {
    if (raw.includes(t)) {
      sanction_type = t;
      break;
    }
  }
  const m = raw.match(/(\d+)\s*(일|회|개월)/);
  return {
    sanction_type,
    sanction_value: raw.trim() || null,
    sanction_days: m ? parseInt(m[1], 10) : null,
    sanction_unit: m ? m[2] : null,
  };
}

// ○해당경주: 26년 제1회차 2일 5경주  → year/round/day/race_no
function parseRaceInfo(s: string): {
  race_year: number | null;
  round: number | null;
  day: number | null;
  race_no: number | null;
} {
  const y = s.match(/(\d{2})\s*년/);
  const r = s.match(/제\s*(\d+)\s*회?\s*차/) || s.match(/제\s*(\d+)\s*회/);
  const d = s.match(/(\d+)\s*일/);
  const rn = s.match(/(\d+)\s*경주/);
  return {
    race_year: y ? 2000 + parseInt(y[1], 10) : null,
    round: r ? parseInt(r[1], 10) : null,
    day: d ? parseInt(d[1], 10) : null,
    race_no: rn ? parseInt(rn[1], 10) : null,
  };
}

// 작성일 "2026-03-18" → ISO (KST 자정)
function dateToIso(s: string): string | null {
  const m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T00:00:00+09:00`;
}

// 제재사유 셀: ○해당경주: ... ○시행규정: ... ○제재사유: ...
function splitReason(content: string): {
  raceInfoText: string | null;
  regulation: string | null;
  reason: string | null;
} {
  const grab = (label: string) => {
    const re = new RegExp(`○\\s*${label}\\s*[:：]\\s*([\\s\\S]*?)(?=○|$)`);
    const m = content.match(re);
    return m ? m[1].replace(/\s+/g, " ").trim() : null;
  };
  return {
    raceInfoText: grab("해당경주"),
    regulation: grab("시행규정"),
    reason: grab("제재사유"),
  };
}

function parsePage(html: string): { rows: SanctionRow[]; topNo: number } {
  const rows: SanctionRow[] = [];
  let topNo = 0;
  const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  for (const tr of trs) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
    if (tds.length < 5) continue;
    const no = parseInt(strip(tds[0][1]), 10);
    if (isNaN(no)) continue; // 데이터행 아님 (헤더/안내)

    const racer_name = strip(tds[1][1]) || null;
    const contentCell = strip(tds[2][1]); // 제재내용
    const reasonCell = decodeEntities(tds[3][1].replace(/<[^>]*>/g, " ")).replace(
      /[ \t]+/g,
      " ",
    ); // 제재사유 (○ 마커 보존 위해 줄바꿈만 정리)
    const writeDate = strip(tds[4][1]);

    const { raceInfoText, regulation, reason } = splitReason(reasonCell);
    const ri = parseRaceInfo(raceInfoText || reasonCell);
    const s = parseSanctionContent(contentCell);

    if (no > topNo) topNo = no;
    rows.push({
      no,
      racer_name,
      generation: null,
      racer_id: null, // spo1 게시판은 선수ID 미제공
      race_info: raceInfoText,
      race_year: ri.race_year,
      venue: VENUE,
      round: ri.round,
      day: ri.day,
      race_no: ri.race_no,
      regulation,
      reason: reason || (reasonCell.trim() || null),
      sanction_type: s.sanction_type,
      sanction_value: s.sanction_value,
      sanction_days: s.sanction_days,
      sanction_unit: s.sanction_unit,
      scraped_at: dateToIso(writeDate),
    });
  }
  return { rows, topNo };
}

async function fetchPage(pageIndex: number): Promise<string> {
  const res = await fetch(`${BASE}?pageIndex=${pageIndex}`, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (pageIndex=${pageIndex})`);
  return res.text();
}

async function main() {
  console.log("=== 부산 심판제재선수 수집 (spo1) ===");

  const firstHtml = await fetchPage(1);
  const first = parsePage(firstHtml);
  if (first.rows.length === 0) {
    console.log("  1페이지에 데이터 없음 → 종료");
    return;
  }
  const totalPages = Math.max(1, Math.ceil(first.topNo / 10));
  console.log(`  최상단 번호=${first.topNo} → ${totalPages}페이지 추정`);

  const all: SanctionRow[] = [...first.rows];
  for (let p = 2; p <= totalPages; p++) {
    await delay(DELAY_MS);
    try {
      const { rows } = parsePage(await fetchPage(p));
      if (rows.length === 0) {
        console.log(`  page ${p}: 데이터 없음 → 중단`);
        break;
      }
      all.push(...rows);
      console.log(`  page ${p}/${totalPages}: 누적 ${all.length}건`);
    } catch (err) {
      console.error(`  ERROR page ${p}:`, err instanceof Error ? err.message : String(err));
    }
  }

  // race_year 누락 행은 onConflict(no,race_year,venue) 키 불완전 → 스킵
  const rows = all.filter((r) => r.race_year !== null);
  const skipped = all.length - rows.length;
  console.log(`  매핑: ${rows.length}건 (스킵 ${skipped}건: race_year 파싱 실패)`);

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
  console.log(`  DB 재조회 (venue=부산): ${count}건`);
  console.log("=== 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
