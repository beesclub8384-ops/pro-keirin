// ============================================================
// 경주별 승식별 매출액 수집 (현재 연도, CI 자동화 전용 / 자체완결)
// 사용법:
//   npx tsx scripts/fetch-race-sales-current.ts            # 올해(KST)
//   npx tsx scripts/fetch-race-sales-current.ts --year 2026
//
// 기존 fetch-race-sales.ts 는 src/data/race-detail-data.json(gitignore) 에
// 의존하여 CI 러너에서 동작 불가 → 이 스크립트는 경주 목록을 Supabase
// races 테이블에서 직접 가져오고, race_sales 에 없는 경주만 증분 수집한다.
// 소스: kcycle.or.kr 최종배당률 페이지
//   /race/dividendrate/final/{year}/{round}/{day}/001/{raceNo}
// 대상: 광명(meet_cd=001) 전용
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 설정 ---
const MEET_CD = "001"; // 광명
const MEET_NAME = "광명";
const DELAY_MS = 1500;
const MAX_RETRIES = 3;
const BATCH_SIZE = 500;
const UPSERT_EVERY = 30; // 30건 수집마다 중간 업로드 (장시간 실행 안전)

// --- CLI / 연도 ---
function resolveYear(): number {
  const idx = process.argv.indexOf("--year");
  if (idx >= 0 && process.argv[idx + 1]) return parseInt(process.argv[idx + 1], 10);
  if (process.env.YEAR) return parseInt(process.env.YEAR, 10);
  // KST 기준 현재 연도
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.getUTCFullYear();
}
const YEAR = resolveYear();

// --- 유틸 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAmount(str: string): number {
  const n = parseInt(str.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
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

const GRADE_KEYWORDS = ["선발", "우수", "특선"];

// <h2>광명 01경주 (선발 12 : 55)</h2> → { grade, raceNo }
function parseHeader(html: string): { grade: string | null; raceNo: number | null } {
  const decoded = decodeHtml(html);
  const m = decoded.match(/<h2>\s*광명\s*(\d+)\s*경주\s*\(([^)]*)\)<\/h2>/);
  if (!m) return { grade: null, raceNo: null };
  const raceNo = parseInt(m[1], 10);
  let grade: string | null = null;
  for (const g of GRADE_KEYWORDS) {
    if (m[2].includes(g)) { grade = g; break; }
  }
  return { grade, raceNo: isNaN(raceNo) ? null : raceNo };
}

interface Sales {
  단승: number; 연승: number; 쌍승: number; 복승: number;
  삼복승: number; 쌍복승: number; 삼쌍승: number; 합계: number;
}

const HEADER_MAP: Record<string, keyof Sales> = {
  단승식: "단승", 연승식: "연승", 쌍승식: "쌍승", 복승식: "복승",
  삼복승식: "삼복승", 쌍복승식: "쌍복승", 삼쌍승식: "삼쌍승", 합계: "합계",
};

function parseSales(html: string): Sales | null {
  const decoded = decodeHtml(html);
  const salesIdx = decoded.indexOf("매출액</h2>");
  if (salesIdx < 0) return null;

  const theadStart = decoded.indexOf("<thead>", salesIdx);
  const theadEnd = decoded.indexOf("</thead>", theadStart);
  const tbodyStart = decoded.indexOf("<tbody>", salesIdx);
  const tbodyEnd = decoded.indexOf("</tbody>", tbodyStart);
  if (theadStart < 0 || tbodyStart < 0 || tbodyEnd < 0) return null;

  const thead = decoded.substring(theadStart, theadEnd);
  const headers = [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/<[^>]*>/g, "").trim()
  );
  const tbody = decoded.substring(tbodyStart, tbodyEnd);
  const tds = [...tbody.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
    m[1].replace(/<[^>]*>/g, "").trim()
  );
  if (headers.length < 3 || tds.length < 3) return null;

  const sales: Sales = { 단승: 0, 연승: 0, 쌍승: 0, 복승: 0, 삼복승: 0, 쌍복승: 0, 삼쌍승: 0, 합계: 0 };
  for (let i = 0; i < headers.length && i < tds.length; i++) {
    const key = HEADER_MAP[headers[i]];
    if (key) sales[key] = parseAmount(tds[i]);
  }
  return sales.합계 > 0 ? sales : null;
}

interface RaceKey { round: number; day: number; raceNo: number; }

// --- 페이지네이션 헬퍼 ---
async function fetchAllRows<T>(
  table: string,
  cols: string,
  filters: (q: any) => any
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await filters(
      supabase.from(table).select(cols).range(from, from + 999)
    );
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

// --- 단일 경주 매출 요청 (+검증) ---
async function fetchOne(round: number, day: number, raceNo: number): Promise<{ sales: Sales; grade: string | null } | null> {
  const rr = String(round).padStart(2, "0");
  const rn = String(raceNo).padStart(2, "0");
  const url = `https://www.kcycle.or.kr/race/dividendrate/final/${YEAR}/${rr}/${day}/${MEET_CD}/${rn}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      // 검증: 페이지 헤더의 경주번호가 요청값과 일치하는지 (엉뚱한 경주 저장 방지)
      const header = parseHeader(html);
      if (header.raceNo !== null && header.raceNo !== raceNo) {
        console.warn(`  ⚠ ${rr}-${day}-${rn}: 경주번호 불일치(응답 ${header.raceNo}) → 스킵`);
        return null;
      }

      const sales = parseSales(html);
      if (!sales) return null; // 배당률 미게시(3~5일 지연) 등 → 다음 실행에서 재시도
      return { sales, grade: header.grade };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        await delay((attempt + 1) * 2000);
      } else {
        console.error(`  ERROR ${rr}-${day}-${rn}: ${msg}`);
        return null;
      }
    }
  }
  return null;
}

function toRow(k: RaceKey, sales: Sales, grade: string | null) {
  return {
    year: YEAR,
    round: k.round,
    day: k.day,
    race_no: k.raceNo,
    meet_cd: MEET_CD,
    meet_name: MEET_NAME,
    grade: grade || null,
    s_단승: sales.단승,
    s_연승: sales.연승,
    s_쌍승: sales.쌍승,
    s_복승: sales.복승,
    s_삼복승: sales.삼복승,
    s_쌍복승: sales.쌍복승,
    s_삼쌍승: sales.삼쌍승,
    s_합계: sales.합계,
  };
}

async function upsertRows(rows: Array<Record<string, unknown>>): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("race_sales")
      .upsert(batch, { onConflict: "year,round,day,race_no" });
    if (error) throw new Error(`race_sales upsert 실패: ${error.message}`);
  }
}

async function main() {
  console.log(`=== race_sales 자동 수집 (${YEAR}년, 광명) ===`);

  // 1) races(현재 연도, 광명) 경주 목록
  const races = await fetchAllRows<{ round: string; day: number; race_no: number }>(
    "races",
    "round, day, race_no",
    (q) => q.eq("year", YEAR).eq("venue", MEET_NAME)
  );
  console.log(`  races(${YEAR}, 광명): ${races.length}건`);
  if (races.length === 0) {
    console.log("  대상 경주 없음 → 종료");
    return;
  }

  // 2) 이미 수집된 race_sales 키 집합
  const existing = await fetchAllRows<{ round: number; day: number; race_no: number }>(
    "race_sales",
    "round, day, race_no",
    (q) => q.eq("year", YEAR)
  );
  const seen = new Set(existing.map((e) => `${e.round}|${e.day}|${e.race_no}`));
  console.log(`  기수집 race_sales: ${existing.length}건`);

  // 3) 미수집 경주만 추출
  const missing: RaceKey[] = [];
  for (const r of races) {
    const round = Number(r.round);
    if (!Number.isFinite(round)) continue;
    const key = `${round}|${r.day}|${r.race_no}`;
    if (seen.has(key)) continue;
    missing.push({ round, day: r.day, raceNo: r.race_no });
  }
  // 오래된 경주부터
  missing.sort((a, b) => a.round - b.round || a.day - b.day || a.raceNo - b.raceNo);
  console.log(`  미수집 대상: ${missing.length}건\n`);
  if (missing.length === 0) {
    console.log("  새로 수집할 경주 없음 → 종료");
    return;
  }

  let collected = 0;
  let noDividend = 0;
  const buffer: Array<Record<string, unknown>> = [];

  for (let i = 0; i < missing.length; i++) {
    const k = missing[i];
    const result = await fetchOne(k.round, k.day, k.raceNo);
    if (result) {
      buffer.push(toRow(k, result.sales, result.grade));
      collected++;
    } else {
      noDividend++;
    }

    if (buffer.length >= UPSERT_EVERY) {
      await upsertRows(buffer);
      console.log(`  진행 ${i + 1}/${missing.length} | 수집 ${collected} | 배당미게시/스킵 ${noDividend}`);
      buffer.length = 0;
    }

    await delay(DELAY_MS);
  }

  if (buffer.length > 0) await upsertRows(buffer);

  console.log(`\n=== 완료: 신규 ${collected}건 upsert / 미게시·스킵 ${noDividend}건 ===`);
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
