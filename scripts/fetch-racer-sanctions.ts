// ============================================================
// kcycle 제재선수 이력 크롤링 (/racer/state/sanction) → Supabase racer_sanctions
//
// ⚠️ 심판제재(judge_sanctions, /race/judge/sanctionsracer)와는 다른 페이지.
//
// 요청 방식 (1단계에서 파악):
//   POST https://www.kcycle.or.kr/racer/state/sanction
//   body: pagination.currentPage=N & stndYear= & tms= & pKind= & searchText= & searchFixedYn=
//   (전부 빈 값 = 전체 조회, 페이지당 15건, seq_no 내림차순)
//
// 사용법:
//   npx tsx scripts/fetch-racer-sanctions.ts
//   npx tsx scripts/fetch-racer-sanctions.ts --dry-run   (DB 미적재, 파싱만)
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(또는 ANON_KEY)가 필요합니다.");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const URL = "https://www.kcycle.or.kr/racer/state/sanction";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DELAY_MS = 1000;
const MAX_RETRIES = 3;
const DRY_RUN = process.argv.includes("--dry-run");

// 처리결과 7종 — 긴 것부터 매칭 (경주관여금지/정지가 출전정지보다 먼저)
const CATEGORIES = [
  "경주관여금지",
  "경주관여정지",
  "등록취소",
  "주선제외",
  "출전정지",
  "서면경고",
  "기타",
].sort((a, b) => b.length - a.length);

// ---------- 유틸 ----------
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
function stripTags(s: string): string {
  // <br> 계열은 공백으로 (제재사유 여러 줄 → 한 줄)
  return decode(s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
function categorize(result: string): string | null {
  for (const cat of CATEGORIES) {
    if (result.startsWith(cat)) return cat;
  }
  return null;
}

// ---------- POST fetch (재시도) ----------
async function fetchPage(page: number): Promise<string> {
  const body = new URLSearchParams({
    "pagination.currentPage": String(page),
    stndYear: "",
    tms: "",
    pKind: "",
    searchText: "",
    searchFixedYn: "",
  }).toString();

  let lastErr: unknown;
  for (let t = 0; t < MAX_RETRIES; t++) {
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
        },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await delay(1000 * (t + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------- 파싱 ----------
interface SanctionRow {
  seqNo: number;
  racerName: string | null;
  cohort: string | null;
  racerId: string | null;
  result: string;
  resultCategory: string | null;
  reason: string;
  effectiveDate: string | null; // YYYY-MM-DD
}

// 응답 HTML에서 마지막 페이지 번호 파싱 (하드코딩 금지)
function parseLastPage(html: string): number | null {
  // "마지막" 링크: onclick="fnSearch(160)">마지막
  const m = html.match(/fnSearch\((\d+)\)"[^>]*>\s*마지막/);
  if (m) return parseInt(m[1], 10);
  // 폴백: 노출된 페이지 링크 중 최대값
  const nums = [...html.matchAll(/fnSearch\((\d+)\)/g)].map((x) => parseInt(x[1], 10));
  return nums.length ? Math.max(...nums) : null;
}

function parseRows(html: string): SanctionRow[] {
  const tb = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tb) return [];
  const trs = [...tb[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  const rows: SanctionRow[] = [];

  for (const tr of trs) {
    const inner = tr[1];
    const seqMatch = inner.match(/<th[^>]*>\s*(\d+)\s*<\/th>/);
    if (!seqMatch) continue; // 헤더/빈 행 스킵
    const seqNo = parseInt(seqMatch[1], 10);

    const tds = [...inner.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (tds.length < 4) continue;

    // 셀0: 선수 (이름 / NN기 + racer_id 8자리)
    const racerCell = tds[0];
    const idFromPopup = racerCell.match(/fnRacer\.popup\(&quot;(\d{8})&quot;\)/);
    const idPlain = stripTags(racerCell).match(/\b(\d{8})\b/);
    const racerId = idFromPopup?.[1] ?? idPlain?.[1] ?? null;
    const nameCohort = stripTags(racerCell).match(/([가-힣]+)\s*\/\s*(\d+기)/);
    const racerName = nameCohort?.[1] ?? null;
    const cohort = nameCohort?.[2] ?? null;

    // 셀1: 처리결과 전문
    const result = stripTags(tds[1]);
    const resultCategory = categorize(result);

    // 셀2: 제재사유 전문
    const reason = stripTags(tds[2]);

    // 셀3: 시행일 (2026.08.02 → 2026-08-02)
    const dm = stripTags(tds[3]).match(/(\d{4})\.(\d{2})\.(\d{2})/);
    const effectiveDate = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : null;

    rows.push({
      seqNo,
      racerName,
      cohort,
      racerId,
      result,
      resultCategory,
      reason,
      effectiveDate,
    });
  }
  return rows;
}

// ---------- DB upsert ----------
async function upsertRows(rows: SanctionRow[]): Promise<number> {
  let done = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      seq_no: r.seqNo,
      racer_name: r.racerName,
      cohort: r.cohort,
      racer_id: r.racerId,
      result: r.result,
      result_category: r.resultCategory,
      reason: r.reason,
      effective_date: r.effectiveDate,
    }));
    const { error } = await supabase
      .from("racer_sanctions")
      .upsert(chunk, { onConflict: "seq_no" });
    if (error) throw new Error(`upsert 실패: ${error.message}`);
    done += chunk.length;
  }
  return done;
}

function seqSetEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// ---------- 메인 ----------
async function main() {
  console.log(`=== kcycle 제재선수 크롤링${DRY_RUN ? " (DRY-RUN)" : ""} ===`);

  const all: SanctionRow[] = [];
  const seenSeq = new Set<number>();
  let prevSeqSet: Set<number> | null = null;
  let page = 1;
  let lastPage = Infinity;
  let uncategorized = 0;

  while (page <= lastPage) {
    const html = await fetchPage(page);

    // 매 페이지에서 마지막 페이지 번호 재확인 (하드코딩 금지)
    const lp = parseLastPage(html);
    if (lp && lp !== Infinity) lastPage = lp;

    const rows = parseRows(html);
    if (rows.length === 0) {
      console.error(`  ⚠️ page ${page}: 파싱된 행 0건 → 중단`);
      break;
    }

    const seqSet = new Set(rows.map((r) => r.seqNo));

    // 폴백 방어: 직전 페이지와 seq 집합이 동일하면 중단
    if (prevSeqSet && seqSetEqual(prevSeqSet, seqSet)) {
      throw new Error(
        `중복 감지: page ${page} 의 seq_no 집합이 직전 페이지와 동일 → 파라미터 미반영(폴백) 의심. 중단.`,
      );
    }
    prevSeqSet = seqSet;

    for (const r of rows) {
      if (seenSeq.has(r.seqNo)) continue;
      seenSeq.add(r.seqNo);
      all.push(r);
      if (r.resultCategory === null) uncategorized++;
    }

    if (page % 10 === 0 || page === lastPage) {
      console.log(`  page ${page}/${lastPage === Infinity ? "?" : lastPage} — 누적 ${all.length}건`);
    }

    page++;
    await delay(DELAY_MS);
  }

  console.log(`\n파싱 완료: ${all.length}건 (page 1~${page - 1})`);
  console.log(`  seq_no 범위: ${Math.min(...seenSeq)} ~ ${Math.max(...seenSeq)}`);
  console.log(`  result_category 미분류: ${uncategorized}건`);
  const badId = all.filter((r) => !r.racerId || !/^\d{8}$/.test(r.racerId));
  console.log(`  racer_id 8자리 아님: ${badId.length}건`);
  if (badId.length) {
    for (const b of badId.slice(0, 10)) console.log(`    seq ${b.seqNo}: '${b.racerId}' (${b.racerName})`);
  }

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] DB 미적재. 샘플 3건:");
    for (const r of all.slice(0, 3)) {
      console.log(`  ${r.seqNo} | ${r.racerName} ${r.cohort} ${r.racerId} | ${r.result} [${r.resultCategory}] | ${r.effectiveDate}`);
    }
    return;
  }

  const n = await upsertRows(all);
  console.log(`\n=== 완료: ${n}건 upsert (racer_sanctions) ===`);
}

main().catch((err) => {
  console.error("치명적 에러:", err instanceof Error ? err.message : err);
  process.exit(1);
});
