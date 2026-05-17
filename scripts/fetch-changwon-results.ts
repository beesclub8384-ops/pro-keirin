// ============================================================
// 창원 경주결과 수집 + Supabase 시딩 CLI 스크립트
// 데이터 소스: lepopark.or.kr (창원 자체 사이트, SSR HTML)
//
// 사용법:
//   npx tsx scripts/fetch-changwon-results.ts            → 오늘 날짜 수집 (자동 수집용)
//   npx tsx scripts/fetch-changwon-results.ts --date 20260515  → 단일 날짜 수집
//   npx tsx scripts/fetch-changwon-results.ts --year 2020       → 해당 연도 전체 수집
//
// 설계 메모:
//   - 회차/일차 목록: GET /api/race/{year}/rcdate (JSON, trackcd 002 = 창원)
//   - 경주결과: GET /race/result/{YYYYMMDD} (SSR HTML, 부산/창원/광명 혼재)
//   - <h3>창원NN 경주</h3> 헤더로 창원만 필터
//   - 한 페이지에 부산/광명도 있으므로 반드시 "창원" 접두사로 거른다
//   - 광명/창원은 회차 번호를 공유하지 않음 → round 는 lepopark rctimes 를 그대로 사용
//   - races.round 는 text (18A 같은 보강회차 존재)
//   - races upsert onConflict: year,round,day,race_no,venue (venue 없으면 광명 행 덮어씀)
//   - race_results 적재 시 race_id 조회는 venue='창원' 까지 필터
//   - --year(과거 일괄) 모드에서만 "DB에 이미 있는 날짜 스킵"
//     today/--date 모드는 항상 upsert (미확정→확정 갱신 위해 스킵 금지, upsert 멱등)
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
const TRACK_CD = "002";
const DELAY_MS = 500;
const BATCH_SIZE = 500;

// ---------- 유틸 ----------
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " ");
}

// 20260515 → 2026-05-15
function toIsoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function todayKstYmd(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, "");
}

// ---------- 타입 ----------
interface RcDateEntry {
  trackcd: string;
  rcyear: string;
  rctimes: string; // 회차 ("21", "18A")
  rcdays: string; // 일차
  rcdate: string; // YYYYMMDD
  canceled: string | null;
}

interface RacerResult {
  backNo: number;
  name: string;
  rank: number | null;
  gap: string;
  raceTime: string;
  tactic: string;
  disqualified: string;
  warning: string;
  caution: string;
  withdrawal: string;
  finish: string;
  record200m: string;
  speed200m: number | null;
}

interface RaceEnv {
  time: string;
  temp: string;
  humidity: string;
  record200m: string;
  lastLap: string;
}

interface Violation {
  backNo: number;
  name: string;
  violationTime: string; // 위반시기 (예: "5주회")
  violationPlace: string; // 위반장소 (예: "4코너")
  article: string; // 저촉조 (예: "74")
  paragraph: string; // 저촉항 (예: "2", 없으면 "-")
  clause: string; // 저촉호 (없으면 "-")
  judgment: string; // 판정구분 (실격/경고/주의)
  description: string; // 경주규칙명 + 설명
}

interface ChangwonRace {
  year: number;
  round: string;
  day: number;
  raceNo: number;
  date: string; // YYYY-MM-DD
  env: RaceEnv;
  results: RacerResult[];
  violations: Violation[];
}

// ---------- API: 회차/일차 목록 ----------
async function fetchRcDates(year: number): Promise<RcDateEntry[]> {
  const url = `https://www.lepopark.or.kr/api/race/${year}/rcdate`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`rcdate API HTTP ${res.status} (${year})`);
  const json = (await res.json()) as RcDateEntry[];
  return json.filter((e) => e.trackcd === TRACK_CD);
}

// ---------- HTML 파싱 ----------
// 한 경주 블록(<h3>...</h3> ~ 다음 <h3>) 에서 12컬럼 선수 데이터 추출
function parseRaceBlock(block: string): { env: RaceEnv; results: RacerResult[] } {
  // 1) 요약 테이블: 등급/시간/기온/습도/200m/최종주회/동영상
  const env: RaceEnv = { time: "", temp: "", humidity: "", record200m: "", lastLap: "" };
  const summaryTbody = block.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (summaryTbody) {
    const cells = [...summaryTbody[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      stripTags(m[1]),
    );
    // [등급, 시간, 기온, 습도, 200m, 최종주회, (동영상)]
    if (cells.length >= 6) {
      env.time = cells[1] || "";
      env.temp = cells[2] || "";
      env.humidity = cells[3] || "";
      env.record200m = cells[4] || "";
      env.lastLap = cells[5] || "";
    }
  }

  // 2) 상세 테이블: thead 에 "선수명" 이 있는 테이블의 tbody
  const results: RacerResult[] = [];
  const nameHeadIdx = block.indexOf("선수명");
  if (nameHeadIdx > -1) {
    const after = block.substring(nameHeadIdx);
    const tbodyMatch = after.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (tbodyMatch) {
      const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      for (const tr of trs) {
        const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
        if (tds.length < 12) continue;

        // 첫 td: <span class="racer_color_N ...">N</span><a href="/racer/{id}">{name}</a>
        const firstRaw = tds[0][1];
        const backMatch = firstRaw.match(/racer_color_(\d+)/);
        const nameMatch = firstRaw.match(/\/racer\/\d+"?>([^<]+)<\/a>/);
        if (!backMatch || !nameMatch) continue;

        const txt = (i: number) => stripTags(tds[i][1]);
        const rankRaw = txt(1);
        const speedRaw = txt(11);

        results.push({
          backNo: parseInt(backMatch[1], 10),
          name: decodeHtmlEntities(nameMatch[1].trim()),
          rank: rankRaw && /^\d+$/.test(rankRaw) ? parseInt(rankRaw, 10) : null,
          gap: txt(2),
          raceTime: txt(3),
          tactic: txt(4),
          disqualified: txt(5),
          warning: txt(6),
          caution: txt(7),
          withdrawal: txt(8),
          finish: txt(9),
          record200m: txt(10),
          speed200m: speedRaw && !isNaN(parseFloat(speedRaw)) ? parseFloat(speedRaw) : null,
        });
      }
    }
  }

  return { env, results };
}

// 한 경주 블록에서 판정결과 테이블 파싱
// 구조: <h5>판정결과</h5> <table ...><caption>해당경주의판정정보</caption>
//   thead(선수,위반시기,위반장소,저촉조,저촉항,저촉호,판정구분)
//   선수마다 <tbody>: tr1=위반행(7셀, 선수셀에 racer_color_N + <span>이름</span>),
//                      tr2=<td>경주규칙</td><td colspan=6><div bold>규칙명</div><div>설명</div></td>
function parseJudgments(block: string): Violation[] {
  const violations: Violation[] = [];
  const capIdx = block.indexOf("해당경주의판정정보");
  if (capIdx === -1) return violations;
  const tblEnd = block.indexOf("</table>", capIdx);
  const section = block.substring(capIdx, tblEnd === -1 ? block.length : tblEnd);

  const trs = [...section.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  let pending: Violation | null = null;
  for (const tr of trs) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
    if (tds.length === 0) continue;

    const backMatch = tr[1].match(/racer_color_(\d+)/);
    if (backMatch && tds.length >= 7) {
      // 위반 행
      if (pending) violations.push(pending);
      // 선수명: class 없는 <span>이름</span> (첫 span 은 racer_color)
      const nameSpan = tds[0][1].match(/<span>([^<]+)<\/span>/);
      const name = nameSpan
        ? decodeHtmlEntities(nameSpan[1].trim()).replace(/\s+/g, " ")
        : stripTags(tds[0][1]).replace(/^\d+\s*/, "");
      const txt = (i: number) => stripTags(tds[i][1]);
      pending = {
        backNo: parseInt(backMatch[1], 10),
        name,
        violationTime: txt(1),
        violationPlace: txt(2),
        article: txt(3),
        paragraph: txt(4) || "-",
        clause: txt(5) || "-",
        judgment: txt(6),
        description: "",
      };
    } else if (pending && stripTags(tds[0][1]) === "경주규칙" && tds.length >= 2) {
      // 경주규칙 설명 행: div(bold)=규칙명, div=설명
      const divs = [...tds[1][1].matchAll(/<div[^>]*>([\s\S]*?)<\/div>/g)].map((m) =>
        stripTags(m[1]),
      );
      pending.description = divs.filter(Boolean).join(" ").trim();
      violations.push(pending);
      pending = null;
    }
  }
  if (pending) violations.push(pending);

  // 실격/경고/주의 만 저장 (광명 fetch-race-detail.ts 와 동일 기준)
  return violations.filter(
    (v) => v.judgment === "실격" || v.judgment === "경고" || v.judgment === "주의",
  );
}

// 결과 페이지에서 창원 경주 전부 파싱 + 요청일 검증
function parseResultPage(
  html: string,
  entry: RcDateEntry,
): { races: ChangwonRace[]; dateOk: boolean } {
  const year = parseInt(entry.rcyear, 10);
  const isoDate = toIsoDate(entry.rcdate);

  // 요청일 검증: <h2>경주결과 YYYY년 NN회 N일차 <span>(YYYY년 MM월 DD일)</span></h2>
  const h2 = html.match(/<h2>[^<]*<span>\(\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*\)<\/span><\/h2>/);
  let dateOk = false;
  if (h2) {
    const pageYmd = `${h2[1]}${h2[2].padStart(2, "0")}${h2[3].padStart(2, "0")}`;
    dateOk = pageYmd === entry.rcdate;
    if (!dateOk) {
      console.warn(
        `  ⚠️ 날짜 불일치: 요청 ${entry.rcdate} / 페이지 ${pageYmd} → 저장 안 함`,
      );
    }
  } else {
    console.warn(`  ⚠️ 페이지에서 날짜(<h2>) 파싱 실패 (${entry.rcdate}) → 저장 안 함`);
  }
  if (!dateOk) return { races: [], dateOk: false };

  // 경주 블록 분리: <h3>{venue}{raceNo} 경주 ...</h3>
  const races: ChangwonRace[] = [];
  const h3Re = /<h3>\s*([가-힣]+)(\d+)\s*경주[\s\S]*?<\/h3>/g;
  const heads = [...html.matchAll(h3Re)];
  for (let i = 0; i < heads.length; i++) {
    const venueName = heads[i][1];
    if (venueName !== VENUE) continue;
    const raceNo = parseInt(heads[i][2], 10);
    const start = heads[i].index! + heads[i][0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index! : html.length;
    const block = html.substring(start, end);

    const { env, results } = parseRaceBlock(block);
    if (results.length === 0) continue; // 미확정/데이터 없음 → 스킵 (다음 실행에서 갱신)
    const violations = parseJudgments(block);

    races.push({
      year,
      round: entry.rctimes,
      day: parseInt(entry.rcdays, 10),
      raceNo,
      date: isoDate,
      env,
      results,
      violations,
    });
  }

  return { races, dateOk: true };
}

async function fetchResultPage(rcdate: string): Promise<string> {
  const url = `https://www.lepopark.or.kr/race/result/${rcdate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`result HTTP ${res.status} (${rcdate})`);
  return res.text();
}

// ---------- Supabase 적재 ----------
async function seedToSupabase(races: ChangwonRace[]): Promise<void> {
  if (races.length === 0) return;

  // 1) races upsert (venue='창원')
  const raceRows = races.map((r) => ({
    year: r.year,
    round: r.round,
    day: r.day,
    race_no: r.raceNo,
    date: r.date,
    venue: VENUE,
    env_time: r.env.time || null,
    env_temp: r.env.temp || null,
    env_humidity: r.env.humidity || null,
    env_record_200m: r.env.record200m || null,
    env_last_lap: r.env.lastLap || null,
  }));

  for (let i = 0; i < raceRows.length; i += BATCH_SIZE) {
    const batch = raceRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("races")
      .upsert(batch, { onConflict: "year,round,day,race_no,venue" });
    if (error) console.error(`  races upsert 에러 (batch ${i}):`, error.message);
  }

  // 2) race_id 조회 (venue='창원' 필터 필수)
  const year = races[0].year;
  const round = races[0].round;
  const day = races[0].day;
  const { data: insertedRaces, error: fetchErr } = await supabase
    .from("races")
    .select("id, year, round, day, race_no")
    .eq("year", year)
    .eq("round", round)
    .eq("day", day)
    .eq("venue", VENUE);

  if (fetchErr || !insertedRaces) {
    console.error("  race ID 조회 에러:", fetchErr?.message);
    return;
  }

  const raceIdMap = new Map<string, number>();
  for (const r of insertedRaces) {
    raceIdMap.set(`${r.year}|${r.round}|${r.day}|${r.race_no}`, r.id);
  }

  // 3) race_results upsert
  const resultRows: Array<Record<string, unknown>> = [];
  for (const race of races) {
    const raceId = raceIdMap.get(`${race.year}|${race.round}|${race.day}|${race.raceNo}`);
    if (!raceId) {
      console.warn(
        `  ⚠️ race_id 없음: ${race.round}회 ${race.day}일 ${race.raceNo}R (창원)`,
      );
      continue;
    }
    for (const res of race.results) {
      resultRows.push({
        race_id: raceId,
        back_no: res.backNo,
        name: res.name,
        rank: res.rank,
        gap: res.gap || null,
        race_time: res.raceTime || null,
        tactic: res.tactic || null,
        disqualified: res.disqualified || null,
        warning: res.warning || null,
        caution: res.caution || null,
        withdrawal: res.withdrawal || null,
        finish: res.finish || null,
        record_200m: res.record200m || null,
        speed_200m: res.speed200m,
      });
    }
  }

  for (let i = 0; i < resultRows.length; i += BATCH_SIZE) {
    const batch = resultRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("race_results")
      .upsert(batch, { onConflict: "race_id,back_no" });
    if (error) console.error(`  race_results upsert 에러 (batch ${i}):`, error.message);
  }

  // 4) violations upsert (venue='창원')
  const violationRows: Array<Record<string, unknown>> = [];
  for (const race of races) {
    const raceId = raceIdMap.get(`${race.year}|${race.round}|${race.day}|${race.raceNo}`);
    if (!raceId) continue;
    for (const v of race.violations) {
      violationRows.push({
        race_id: raceId,
        back_no: v.backNo,
        name: v.name,
        violation_time: v.violationTime || "",
        violation_place: v.violationPlace || "",
        article: v.article || "",
        paragraph: v.paragraph || "",
        clause: v.clause || "",
        judgment: v.judgment || "",
        description: v.description || null,
        venue: VENUE,
      });
    }
  }

  if (violationRows.length > 0) {
    for (let i = 0; i < violationRows.length; i += BATCH_SIZE) {
      const batch = violationRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("violations").upsert(batch, {
        onConflict:
          "race_id,back_no,judgment,article,paragraph,clause,violation_time,violation_place",
        ignoreDuplicates: true,
      });
      if (error) console.error(`  violations upsert 에러 (batch ${i}):`, error.message);
    }
  }

  console.log(
    `  → races ${raceRows.length}건 / race_results ${resultRows.length}건 / violations ${violationRows.length}건 적재`,
  );
}

// ---------- 이미 violations 까지 수집된 창원 날짜 집합 (--year 모드용) ----------
// race_results 만 있고 violations 가 없는 날짜는 재수집해야 하므로
// "races 존재" 가 아니라 "violations 존재" 기준으로 스킵 판정한다.
// (races/race_results upsert 는 멱등이라 재처리해도 무손상)
async function existingChangwonDates(year: number): Promise<Set<string>> {
  const dates = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("violations")
      .select("races!inner(date, year, venue)")
      .eq("races.venue", VENUE)
      .eq("races.year", year)
      .range(from, from + 999);
    if (error) {
      console.error("  기존 violations 날짜 조회 에러:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const rel = (row as { races?: { date?: string } | { date?: string }[] }).races;
      const d = Array.isArray(rel) ? rel[0]?.date : rel?.date;
      if (d) dates.add(d);
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return dates;
}

// ---------- 단일 rcdate 수집 ----------
async function collectOne(entry: RcDateEntry): Promise<number> {
  if (entry.canceled) {
    console.log(`  ${entry.rcdate}: 취소된 경주일 (canceled) → 스킵`);
    return 0;
  }
  const html = await fetchResultPage(entry.rcdate);
  const { races } = parseResultPage(html, entry);
  if (races.length === 0) {
    console.log(`  ${entry.rcdate}: 창원 확정 경주 없음`);
    return 0;
  }
  console.log(
    `  ${entry.rcdate} (${entry.rctimes}회 ${entry.rcdays}일차): 창원 ${races.length}경주`,
  );
  await seedToSupabase(races);
  return races.length;
}

// ---------- CLI 파싱 ----------
function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  const val = process.argv[idx + 1];
  if (!val) {
    console.error(`ERROR: ${name} 값이 필요합니다`);
    process.exit(1);
  }
  return val;
}

async function main() {
  const yearArg = parseArg("--year");
  const dateArg = parseArg("--date");

  // === --year: 해당 연도 전체 (DB에 이미 있는 날짜 스킵) ===
  if (yearArg) {
    const year = parseInt(yearArg, 10);
    if (!/^\d{4}$/.test(yearArg)) {
      console.error("ERROR: --year 형식 오류 (YYYY):", yearArg);
      process.exit(1);
    }
    console.log(`=== 창원 ${year}년 전체 수집 ===`);
    const entries = await fetchRcDates(year);
    if (entries.length === 0) {
      console.log(`  ${year}년 창원 경주일 없음`);
      return;
    }
    // 오래된 → 최신 순으로
    entries.sort((a, b) => a.rcdate.localeCompare(b.rcdate));

    const skipDates = await existingChangwonDates(year);
    console.log(
      `  경주일 ${entries.length}개 / DB 기존 날짜 ${skipDates.size}개 (스킵 대상)\n`,
    );

    let total = 0;
    for (const entry of entries) {
      const iso = toIsoDate(entry.rcdate);
      if (skipDates.has(iso)) {
        console.log(`  ${entry.rcdate}: DB에 이미 존재 → 스킵`);
        continue;
      }
      try {
        total += await collectOne(entry);
      } catch (err) {
        console.error(
          `  ERROR ${entry.rcdate}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
      await delay(DELAY_MS);
    }
    console.log(`\n=== ${year}년 완료: 총 ${total}경주 적재 ===`);
    return;
  }

  // === --date YYYYMMDD: 단일 날짜 (스킵 없음, upsert 멱등) ===
  // === 인자 없음: 오늘 날짜 (자동 수집, 스킵 없음) ===
  const targetYmd = dateArg ?? todayKstYmd();
  if (!/^\d{8}$/.test(targetYmd)) {
    console.error("ERROR: --date 형식 오류 (YYYYMMDD):", targetYmd);
    process.exit(1);
  }
  const year = parseInt(targetYmd.slice(0, 4), 10);
  console.log(
    dateArg
      ? `=== 창원 단일 날짜 수집: ${targetYmd} ===`
      : `=== 창원 오늘 자동 수집: ${targetYmd} ===`,
  );

  const entries = await fetchRcDates(year);
  const entry = entries.find((e) => e.rcdate === targetYmd);
  if (!entry) {
    console.log(`  ${targetYmd}: 창원 경주일 아님 (rcdate 목록에 없음)`);
    return;
  }
  try {
    const n = await collectOne(entry);
    console.log(`\n=== 완료: ${targetYmd} 창원 ${n}경주 적재 ===`);
  } catch (err) {
    console.error("치명적 에러:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
