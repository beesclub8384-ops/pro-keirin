// ============================================================
// kcycle 선수별 연도별 출주횟수 수집 (/racer/info) → Supabase racer_yearly_starts
//
// ⚠️ decision_card_* 와 완전히 독립적인 검증용 소스. 기존 테이블 미수정.
//
// 수집 방식 (1단계에서 파악):
//   - 명단: POST /racer/info (retiredYn=N/Y) → fnMoveTo('/racer/info','NNNNNNNN')
//   - 연도별: GET /racer/info/popup/{racerNo}/{year} → var raceyy + 경주성적 표
//   - 기본 popup /racer/info/popup/{racerNo} 의 raceyy = 마지막 활동연도
//
// 저장 규칙 (엄수):
//   raceyy != 요청연도            → 폴백 → 저장 안 함
//   raceyy == 요청연도 & 출주일수 0 → 미출전 → 저장 안 함 (0으로 채우지 않음)
//   raceyy == 요청연도 & 출주일수 > 0 → 저장
//
// 사용법:
//   npx tsx scripts/fetch-racer-yearly-stats.ts
//   (중단되면 다시 실행 — 체크포인트로 재개)
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(또는 ANON_KEY)가 필요합니다.");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const BASE = "https://www.kcycle.or.kr";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DELAY_MS = 1000;
const MAX_RETRIES = 3;
const START_YEAR = 2010;
const END_YEAR = 2026;
const CHECKPOINT = path.resolve(process.cwd(), ".racer-stats-progress.json"); // 완료 선수 목록 (gitignore)

// ---------- 유틸 ----------
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function strip(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  let lastErr: unknown;
  for (let t = 0; t < MAX_RETRIES; t++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, ...init });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await delay(1000 * (t + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------- 명단 ----------
async function fetchRoster(retiredYn: "N" | "Y"): Promise<string[]> {
  const body = new URLSearchParams({
    retiredYn,
    fstLet: "",
    racerNo: "",
    racerTerm: "",
    racerGrdCd: "",
    gisu: "",
    trngPlcCd: "",
    searchRacer: "",
  }).toString();
  const html = await fetchText(`${BASE}/racer/info`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body,
  });
  const ids = new Set<string>();
  for (const m of html.matchAll(/fnMoveTo\(&#39;\/racer\/info&#39;,\s*&quot;(\d{8})&quot;\)/g)) {
    ids.add(m[1]);
  }
  return [...ids];
}

// ---------- 파싱 ----------
function parseRaceyy(html: string): number | null {
  const m = html.match(/var\s+raceyy\s*=\s*"(\d{4})"/);
  return m ? parseInt(m[1], 10) : null;
}

// 경주성적 표: 데이터 행의 마지막 셀=출주일수, 마지막-1=출주횟수
function parseStats(html: string): { startCount: number; startDays: number } | null {
  const tables = [...html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/g)].map((m) => m[0]);
  for (const t of tables) {
    if (!/출주횟수/.test(strip(t))) continue;
    const trs = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    for (const tr of trs) {
      const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]));
      if (cells.length < 6) continue;
      const last = cells[cells.length - 1];
      const secondLast = cells[cells.length - 2];
      // 데이터 행: 마지막 두 셀이 숫자 (헤더 행은 '출주일수' 텍스트라 스킵됨)
      if (/^\d+$/.test(last) && /^\d+$/.test(secondLast)) {
        return { startCount: parseInt(secondLast, 10), startDays: parseInt(last, 10) };
      }
    }
  }
  return null;
}

// ---------- 체크포인트 ----------
function loadDone(): Set<string> {
  try {
    if (fs.existsSync(CHECKPOINT)) {
      const j = JSON.parse(fs.readFileSync(CHECKPOINT, "utf-8"));
      if (Array.isArray(j.done)) return new Set(j.done as string[]);
    }
  } catch {
    /* 무시 */
  }
  return new Set();
}
function saveDone(done: Set<string>): void {
  fs.writeFileSync(CHECKPOINT, JSON.stringify({ done: [...done] }), "utf-8");
}

// 이미 적재된 (racer_id, year) 로드 (재개 시 중복 요청 방지)
async function loadExisting(): Promise<Set<string>> {
  const set = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("racer_yearly_starts")
      .select("racer_id, year")
      .range(from, from + 999);
    if (error) throw new Error(`기존 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as { racer_id: string; year: number }[]) set.add(`${r.racer_id}-${r.year}`);
    if (data.length < 1000) break;
    from += 1000;
  }
  return set;
}

// ---------- 메인 ----------
async function main() {
  console.log("=== kcycle 선수별 연도별 출주횟수 수집 ===");

  const active = await fetchRoster("N");
  await delay(DELAY_MS);
  const retired = await fetchRoster("Y");
  await delay(DELAY_MS);
  console.log(`명단: 현역 ${active.length} + 은퇴 ${retired.length} = ${active.length + retired.length}명`);

  // 중복 제거 (현역/은퇴 겹치면 현역 우선), is_retired 플래그
  const roster = new Map<string, boolean>(); // racerId -> isRetired
  for (const id of retired) roster.set(id, true);
  for (const id of active) roster.set(id, false); // 현역이 우선
  const ids = [...roster.keys()];

  const done = loadDone();
  const existing = await loadExisting();
  console.log(`재개: 완료 선수 ${done.size}명 / 기존 적재행 ${existing.size}건\n`);

  let processed = 0;
  let stored = 0;
  let requests = 0;
  let skippedOld = 0; // raceyy<2010 선수

  for (const racerId of ids) {
    if (done.has(racerId)) {
      processed++;
      continue;
    }
    const isRetired = roster.get(racerId)!;

    try {
      // 1) 기본 popup → 마지막 활동연도
      const baseHtml = await fetchText(`${BASE}/racer/info/popup/${racerId}`);
      requests++;
      await delay(DELAY_MS);
      const lastYear = parseRaceyy(baseHtml);

      if (lastYear === null || lastYear < START_YEAR) {
        skippedOld++;
      } else {
        // 2) 2010 ~ min(lastYear, 2026) 연도별 조회
        const upto = Math.min(lastYear, END_YEAR);
        const rowsToUpsert: {
          racer_id: string;
          year: number;
          start_count: number;
          start_days: number;
          is_retired: boolean;
        }[] = [];

        for (let year = START_YEAR; year <= upto; year++) {
          if (existing.has(`${racerId}-${year}`)) continue; // 이미 적재 → 스킵
          const html = await fetchText(`${BASE}/racer/info/popup/${racerId}/${year}`);
          requests++;
          await delay(DELAY_MS);

          const yy = parseRaceyy(html);
          if (yy !== year) continue; // 폴백 → 저장 안 함
          const stats = parseStats(html);
          if (!stats) continue;
          if (stats.startDays <= 0) continue; // 미출전 → 저장 안 함 (0 미저장)

          rowsToUpsert.push({
            racer_id: racerId,
            year,
            start_count: stats.startCount,
            start_days: stats.startDays,
            is_retired: isRetired,
          });
        }

        if (rowsToUpsert.length > 0) {
          const { error } = await supabase
            .from("racer_yearly_starts")
            .upsert(rowsToUpsert, { onConflict: "racer_id,year" });
          if (error) throw new Error(`upsert 실패 (${racerId}): ${error.message}`);
          stored += rowsToUpsert.length;
          for (const r of rowsToUpsert) existing.add(`${r.racer_id}-${r.year}`);
        }
      }

      done.add(racerId);
    } catch (e) {
      console.error(`  ERROR ${racerId}: ${e instanceof Error ? e.message : String(e)}`);
      // 완료로 표시하지 않음 → 다음 실행에서 재시도
    }

    processed++;
    if (processed % 50 === 0 || processed === ids.length) {
      saveDone(done);
      console.log(
        `  진행 ${processed}/${ids.length}명 | 적재 ${stored}행 | 요청 ${requests} | 2010이전은퇴 스킵 ${skippedOld}`,
      );
    }
  }

  saveDone(done);
  console.log(`\n=== 완료: ${stored}행 적재 (요청 ${requests}건, 처리 ${processed}명) ===`);
}

main().catch((err) => {
  console.error("치명적 에러:", err instanceof Error ? err.message : err);
  process.exit(1);
});
