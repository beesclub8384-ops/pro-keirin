// ============================================================
// 심판판정 수집 스크립트 (violations 조인 → CSV)
//
// 사용법:
//   npx tsx scripts/collect-judgments.ts <목록파일> [출력CSV]
//   예) npx tsx scripts/collect-judgments.ts 판정대상.txt 판정수집.csv
//
// 목록파일 형식 (한 줄에 경주 1건, 아래 형태 모두 인식):
//   2026 15 2 7 광명 매우심함
//   2026년 15회 2일차 7경주 광명 - 심함
//   2026,15,2,7,광명,심함
//   # 로 시작하는 줄과 빈 줄은 무시
//
// 규칙:
//   - DB(violations)에 근거가 있는 것만 채운다. 추측 금지.
//   - races 에 경주 자체가 없으면 판정여부='미수집' + 사유 기록
//   - races 에는 있으나 violations 0건이면 판정여부='N'
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const MEET_CD: Record<string, string> = { 광명: "001", 창원: "002", 부산: "003" };
const VENUES = Object.keys(MEET_CD);

type Target = {
  lineNo: number;
  raw: string;
  year: number;
  round: number;
  day: number;
  raceNo: number;
  venue: string;
  memo: string;
};

type ParseError = { lineNo: number; raw: string; error: string };

// --- 목록 파싱 ---
function parseLine(raw: string, lineNo: number): Target | ParseError {
  const line = raw.trim();

  // 경기장 (명시 없으면 광명)
  const venue = VENUES.find((v) => line.includes(v)) ?? "광명";
  let rest = line.replace(venue, " ");

  let year: number;
  let round: number;
  let day: number;
  let raceNo: number;

  // 1) 라벨 있는 형태 우선 (2026년 15회 2일차 7경주)
  const mYear = rest.match(/(\d{4})\s*년/);
  const mRound = rest.match(/(\d{1,2})\s*회/);
  const mDay = rest.match(/(\d{1,2})\s*일\s*차?/);
  const mRace = rest.match(/(\d{1,2})\s*경주/);

  if (mYear && mRound && mDay && mRace) {
    year = +mYear[1];
    round = +mRound[1];
    day = +mDay[1];
    raceNo = +mRace[1];
    for (const m of [mYear, mRound, mDay, mRace]) rest = rest.replace(m[0], " ");
  } else {
    // 2) 라벨 없는 형태 — 앞에서부터 숫자 4개 (연도 회차 일차 경주번호)
    const tokens = rest.split(/[\s,\t|/]+/).filter(Boolean);
    const nums: number[] = [];
    const leftover: string[] = [];
    for (const t of tokens) {
      if (/^\d{1,4}$/.test(t) && nums.length < 4) nums.push(+t);
      else leftover.push(t);
    }
    if (nums.length < 4) {
      return { lineNo, raw: line, error: "연도/회차/일차/경주번호 4개를 인식하지 못함" };
    }
    [year, round, day, raceNo] = nums;
    rest = leftover.join(" ");
  }

  if (year < 2000 || year > 2100) return { lineNo, raw: line, error: `연도 비정상(${year})` };

  const memo = rest.replace(/[-–—:]/g, " ").replace(/\s+/g, " ").trim();
  return { lineNo, raw: line, year, round, day, raceNo, venue, memo };
}

// --- 조문 표기 ---
function formatArticle(article: string | null, paragraph: string | null, clause: string | null): string {
  const parts: string[] = [];
  if (article && article !== "-") parts.push(`제${article}조`);
  if (paragraph && paragraph !== "-") parts.push(`제${paragraph}항`);
  if (clause && clause !== "-") parts.push(`제${clause}호`);
  return parts.join(" ");
}

// --- CSV ---
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type RaceRow = {
  id: number;
  year: number;
  round: string;
  day: number;
  race_no: number;
  date: string;
  venue: string;
};

type ViolRow = {
  id: number;
  race_id: number;
  back_no: number | null;
  name: string | null;
  article: string | null;
  paragraph: string | null;
  clause: string | null;
  judgment: string | null;
  description: string | null;
};

async function main() {
  const listPath = process.argv[2];
  const outPath = process.argv[3] || "판정수집.csv";
  if (!listPath) {
    console.error("사용법: npx tsx scripts/collect-judgments.ts <목록파일> [출력CSV]");
    process.exit(1);
  }

  const lines = readFileSync(listPath, "utf-8").replace(/^﻿/, "").split(/\r?\n/);
  const targets: Target[] = [];
  const parseErrors: ParseError[] = [];

  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (!t || t.startsWith("#")) return;
    const r = parseLine(raw, i + 1);
    if ("error" in r) parseErrors.push(r);
    else targets.push(r);
  });

  console.log(`목록 파싱: ${targets.length}건 인식, ${parseErrors.length}건 실패`);
  for (const e of parseErrors) console.log(`  [줄 ${e.lineNo}] ${e.error} :: ${e.raw}`);

  // --- races 매칭 ---
  // 주의: races.round 는 "01" 과 "1" 두 형태가 섞여 있다. 한쪽만 매칭하면
  // 경주를 못 찾고 조용히 '미수집' 으로 찍힌다. 반드시 두 형태 모두 조회.
  const byYearVenue = new Map<string, Target[]>();
  for (const t of targets) {
    const k = `${t.year}|${t.venue}`;
    if (!byYearVenue.has(k)) byYearVenue.set(k, []);
    byYearVenue.get(k)!.push(t);
  }

  const raceByKey = new Map<string, RaceRow>();

  for (const [k, group] of byYearVenue) {
    const [yearStr, venue] = k.split("|");
    const roundVariants = [
      ...new Set(group.flatMap((t) => [String(t.round), String(t.round).padStart(2, "0")])),
    ];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("races")
        .select("id, year, round, day, race_no, date, venue")
        .eq("year", +yearStr)
        .eq("venue", venue)
        .in("round", roundVariants)
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error(`races 조회 실패 (${k}): ${error.message}`);
      const rows = (data || []) as RaceRow[];
      for (const r of rows) {
        raceByKey.set(`${r.year}|${r.venue}|${parseInt(r.round, 10)}|${r.day}|${r.race_no}`, r);
      }
      if (rows.length < 1000) break;
      from += 1000;
    }
  }

  // --- (경기장, 연도) 별 violations 수집 여부 ---
  // violations 는 광명 2022~, 창원/부산 2020~ 만 적재돼 있다. 그 이전 경주는
  // '판정 없음(N)' 이 아니라 '미수집' 이다. 구분하지 않으면 무음 실패가 된다.
  const coverage = new Map<string, number>();
  for (const k of byYearVenue.keys()) {
    const [yearStr, venue] = k.split("|");
    const { count, error } = await supabase
      .from("violations")
      .select("id, races!inner(year, venue)", { count: "exact", head: true })
      .eq("races.year", +yearStr)
      .eq("races.venue", venue);
    if (error) throw new Error(`violations 커버리지 조회 실패 (${k}): ${error.message}`);
    coverage.set(k, count || 0);
    if ((count || 0) === 0) console.log(`  ⚠ ${venue} ${yearStr}년: violations 미수집 구간`);
  }

  // --- violations 조회 ---
  // 대상 경주뿐 아니라 같은 회차 전체를 조회한다. 일차 단위 판정 0건을
  // 판별해서 '정말 판정이 없었던 것'과 '해당 일차가 통째로 미수집인 것'을 구분한다.
  const raceIds = [...new Set([...raceByKey.values()].map((r) => r.id))];

  const violByRace = new Map<number, ViolRow[]>();

  for (let i = 0; i < raceIds.length; i += 100) {
    const chunk = raceIds.slice(i, i + 100);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("violations")
        .select("id, race_id, back_no, name, article, paragraph, clause, judgment, description")
        .in("race_id", chunk)
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error(`violations 조회 실패: ${error.message}`);
      const rows = (data || []) as ViolRow[];
      for (const v of rows) {
        if (!violByRace.has(v.race_id)) violByRace.set(v.race_id, []);
        violByRace.get(v.race_id)!.push(v);
      }
      if (rows.length < 1000) break;
      from += 1000;
    }
  }

  // --- CSV 작성 ---
  const header = [
    "연도", "회차", "일차", "경주번호", "날짜", "경주장", "URL",
    "판정여부", "제재선수명", "배번", "심판판정_유형", "적용조문", "설명", "태양메모", "미수집사유",
  ];
  const out: string[][] = [header];
  let yCount = 0;
  let nCount = 0;
  let missCount = 0;
  let rowCount = 0;
  const missReasons: string[] = [];

  // 일차 단위로 판정이 1건이라도 있었는지 (회차 전체 조회분 기준)
  const dayHasViolation = new Set<string>();
  for (const r of raceByKey.values()) {
    if ((violByRace.get(r.id) || []).length > 0) {
      dayHasViolation.add(`${r.year}|${r.venue}|${parseInt(r.round, 10)}|${r.day}`);
    }
  }

  for (const t of targets) {
    const race = raceByKey.get(`${t.year}|${t.venue}|${t.round}|${t.day}|${t.raceNo}`);
    const meet = MEET_CD[t.venue] || "001";
    const url = `https://www.kcycle.or.kr/race/result/general/${t.year}/${String(t.round).padStart(2, "0")}/${t.day}/${meet}/${String(t.raceNo).padStart(2, "0")}`;
    const base = [t.year, t.round, t.day, t.raceNo].map(String);

    const label = `${t.year}년 ${t.round}회 ${t.day}일차 ${t.raceNo}경주 (${t.venue})`;

    if (!race) {
      missCount++;
      rowCount++;
      const reason = "races 테이블에 해당 경주 없음 (경주 자체가 미수집)";
      missReasons.push(`  ${label} — ${reason}`);
      out.push([...base, "", t.venue, url, "미수집", "", "", "", "", "", t.memo, reason]);
      continue;
    }

    // 해당 경기장·연도가 통째로 미수집이면 'N' 이 아니라 '미수집'
    if ((coverage.get(`${t.year}|${t.venue}`) || 0) === 0) {
      missCount++;
      rowCount++;
      const reason = `violations 미수집 구간 (${t.venue} ${t.year}년 판정 데이터 없음)`;
      missReasons.push(`  ${label} — ${reason}`);
      out.push([...base, race.date, race.venue, url, "미수집", "", "", "", "", "", t.memo, reason]);
      continue;
    }

    const vs = violByRace.get(race.id) || [];
    if (vs.length === 0) {
      // 해당 일차 전체에 판정이 0건이면 진짜 무판정인지 의심스럽다 → 표시만 남긴다
      const dayCovered = dayHasViolation.has(`${t.year}|${t.venue}|${t.round}|${t.day}`);
      const note = dayCovered ? "" : "주의: 해당 일차 전체 판정 0건 — 미수집 가능성. 원본 URL 확인 필요";
      nCount++;
      rowCount++;
      out.push([...base, race.date, race.venue, url, "N", "", "", "", "", "", t.memo, note]);
      continue;
    }

    yCount++;
    for (const v of vs) {
      rowCount++;
      out.push([
        ...base, race.date, race.venue, url, "Y",
        v.name || "",
        v.back_no === null ? "" : String(v.back_no),
        v.judgment || "",
        formatArticle(v.article, v.paragraph, v.clause),
        v.description || "",
        t.memo,
        "",
      ]);
    }
  }

  const csv = "﻿" + out.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  writeFileSync(outPath, csv, "utf-8");

  console.log("");
  console.log("=== 결과 ===");
  console.log(`대상 경주      : ${targets.length}건`);
  console.log(`  판정 있음(Y) : ${yCount}건`);
  console.log(`  판정 없음(N) : ${nCount}건`);
  console.log(`  미수집       : ${missCount}건`);
  console.log(`CSV 행수(헤더 제외): ${rowCount}`);
  console.log(`저장: ${outPath}`);

  if (missReasons.length > 0) {
    console.log("");
    console.log("--- 미수집 목록 ---");
    for (const m of missReasons) console.log(m);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
