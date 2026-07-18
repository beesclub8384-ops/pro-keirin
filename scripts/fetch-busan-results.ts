// ============================================================
// 부산 경주결과 수집 + Supabase 시딩 CLI 스크립트
// 데이터 소스: spo1.or.kr (부산시설공단 스포원, SSR HTML)
//
// 사용법:
//   npx tsx scripts/fetch-busan-results.ts             → 오늘 날짜 수집 (자동 수집용)
//   npx tsx scripts/fetch-busan-results.ts --date 20260515  → 단일 날짜 수집
//   npx tsx scripts/fetch-busan-results.ts --year 2020       → 해당 연도 전체 수집
//
// 창원(lepopark)과 다른 점:
//   - 날짜 목록: POST /race/raceDateAjax.do (body TYPE=1&RACEYYMM=YYYYMM&FIXCD=4)
//     → 해당 "월" 경주일만 반환. 연 단위는 1~12월 12번 호출
//   - 경주결과: GET /race/raceResult.do?RACEYY=YYYY&RACEDATE=YYYYMMDD&gubun=Y
//     (광명/창원/부산 전부 혼재된 1페이지 SSR)
//   - 부산 블록: layer_open('layerWrap4','{SEQ}','{DATE}','부산{NN}R ({등급}) {HH:MM}')
//     앵커로 split (h3 의 "부산"·"NN경주" 가 공백/태그로 떨어져 있어 layer_open 이 안정적)
//   - 선수 테이블: <table class="race_t02"> 13컬럼
//     (번호 셀 + <a href="/racer/racerPopup.do?RACEID={id}">{name}</a>)
//   - venue='부산', CYCLECD=003
//   - spo1 SSL 인증서 문제 → NODE_TLS_REJECT_UNAUTHORIZED=0 (rejectUnauthorized:false)
//
// 창원과 동일:
//   - races upsert onConflict year,round,day,race_no,venue (venue 없으면 광명 행 덮어씀)
//   - race_results 적재 시 race_id 조회는 venue='부산' 필터 (무음 손상 방지)
//   - races.round 는 text (보강회차 대비)
//   - --year(과거 일괄) 모드에서만 "DB에 이미 있는 날짜 스킵"
//     today/--date 모드는 항상 멱등 upsert (미확정→확정 갱신)
//   - 요청일 검증: 페이지 헤더 날짜와 요청 RACEDATE 불일치 시 저장 안 함
// ============================================================

// spo1.or.kr 인증서 체인 문제 대응 (rejectUnauthorized:false 와 동등 — fetch 호출 전에 설정)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { normalizeGrade } from "../src/lib/grade-normalizer";

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
const DELAY_MS = 500;
const BATCH_SIZE = 500;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

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
  weather: string;
  windDir: string;
  windSpeed: string;
  temp: string;
  humidity: string;
  rainfall: string;
  record200m: string;
  lastLap: string;
}

// 결과 페이지 선수행에 박혀 있는 raceReason.do 링크 참조
interface ReasonRef {
  backNo: number;
  name: string;
  query: string; // raceReason.do 쿼리스트링 (RACEYY=..&...&RACEID=..)
  raceId: string; // RACEID (선수ID) — 중복 제거 키
}

interface Violation {
  backNo: number;
  name: string;
  violationTime: string; // 위반시기 (예: "4주회")
  violationPlace: string; // 위반장소 (예: "3코너부근")
  article: string; // 저촉조 (예: "72")
  paragraph: string; // 저촉항 (없으면 "-")
  clause: string; // 저촉호 (예: "2", 없으면 "-")
  judgment: string; // 판정구분 (실격/경고/주의)
  description: string; // 경륜시행규정명 + 설명
}

interface BusanRace {
  year: number;
  round: string;
  day: number;
  raceNo: number;
  date: string; // YYYY-MM-DD
  gradeRaw: string; // 원본 등급 라벨 (앵커 a[5] 우선, 선발/우수/특선 + 접미사)
  env: RaceEnv;
  results: RacerResult[];
  reasonRefs: ReasonRef[]; // 임시: raceReason.do 조회 대상
  violations: Violation[];
}

// ---------- API: 해당 월 경주일 목록 ----------
async function fetchMonthDates(yyyymm: string): Promise<string[]> {
  const res = await fetch("https://www.spo1.or.kr/race/raceDateAjax.do", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": UA,
    },
    body: `TYPE=1&RACEYYMM=${yyyymm}&FIXCD=4`,
  });
  if (!res.ok) throw new Error(`raceDateAjax HTTP ${res.status} (${yyyymm})`);
  const json = (await res.json()) as Array<{ racedate: string | null }>;
  return json
    .map((e) => e.racedate)
    .filter((d): d is string => !!d && /^\d{8}$/.test(d));
}

// 연 단위: 1~12월 순회
async function fetchYearDates(year: number): Promise<string[]> {
  const all: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const yyyymm = `${year}${String(m).padStart(2, "0")}`;
    try {
      const dates = await fetchMonthDates(yyyymm);
      all.push(...dates);
    } catch (err) {
      console.warn(
        `  ⚠️ ${yyyymm} 날짜목록 실패:`,
        err instanceof Error ? err.message : String(err),
      );
    }
    await delay(DELAY_MS);
  }
  return [...new Set(all)].sort();
}

// ---------- HTML 파싱 ----------
// 페이지에서 부산 round/day 추출
// 1순위: 헤더 "YYYY년 부산 N회 N일차 (MM월 DD일)"
// 2순위: 부산 블록 링크 RACEYY=YYYY&RACETIMES=..&RACEDAYS=..&CYCLECD=003
function parseRoundDay(
  html: string,
  ymd: string,
): { round: string; day: number; dateOk: boolean } | null {
  const year = ymd.slice(0, 4);
  const mm = parseInt(ymd.slice(4, 6), 10);
  const dd = parseInt(ymd.slice(6, 8), 10);

  const h = html.match(
    /(\d{4})년\s*부산\s*([0-9A-Za-z]+)회\s*(\d+)일차\s*\(\s*(\d{1,2})월\s*(\d{1,2})일\s*\)/,
  );
  if (h) {
    const dateOk =
      h[1] === year && parseInt(h[4], 10) === mm && parseInt(h[5], 10) === dd;
    if (!dateOk) {
      console.warn(
        `  ⚠️ 날짜 불일치: 요청 ${ymd} / 페이지 ${h[1]}-${h[4]}-${h[5]} → 저장 안 함`,
      );
    }
    return { round: h[2], day: parseInt(h[3], 10), dateOk };
  }

  // fallback: CYCLECD=003 링크
  const link = html.match(
    new RegExp(`RACEYY=${year}&RACETIMES=([0-9A-Za-z]+)&RACEDAYS=(\\d+)&CYCLECD=003`),
  );
  if (link) {
    // 헤더가 없으면 날짜 검증 불가 → 보수적으로 통과 (요청 RACEDATE 로 직접 조회한 페이지)
    return { round: link[1], day: parseInt(link[2], 10), dateOk: true };
  }

  return null;
}

// 한 경주 블록에서 12컬럼(+번호) 선수 데이터 + 환경 추출
function parseBlock(block: string): {
  env: RaceEnv;
  results: RacerResult[];
  reasonRefs: ReasonRef[];
  gradeEnv: string;
} {
  let gradeEnv = ""; // 환경 테이블 c[0] = 등급 (이중 확인용)
  const env: RaceEnv = {
    time: "",
    weather: "",
    windDir: "",
    windSpeed: "",
    temp: "",
    humidity: "",
    rainfall: "",
    record200m: "",
    lastLap: "",
  };

  // 환경 테이블: thead 에 "최종주회" 가 있는 race_t02 의 tbody 첫 행
  // [등급,시간,날씨,풍향,풍속,기온,습도,우량,200M,최종주회,동영상,...]
  const envIdx = block.indexOf("최종주회");
  if (envIdx > -1) {
    const tb = block.substring(envIdx).match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (tb) {
      const c = [...tb[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
        stripTags(m[1]),
      );
      if (c.length >= 10) {
        gradeEnv = c[0] || "";
        env.time = c[1] || "";
        env.weather = c[2] || "";
        env.windDir = c[3] || "";
        env.windSpeed = c[4] || "";
        env.temp = c[5] || "";
        env.humidity = c[6] || "";
        env.rainfall = c[7] || "";
        env.record200m = c[8] || "";
        env.lastLap = c[9] || "";
      }
    }
  }

  // 선수 상세 테이블: thead 에 "선수명" 이 있는 race_t02 의 tbody
  const results: RacerResult[] = [];
  const reasonRefs: ReasonRef[] = [];
  const nameIdx = block.indexOf("선수명");
  if (nameIdx > -1) {
    const tb = block.substring(nameIdx).match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (tb) {
      const trs = [...tb[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      for (const tr of trs) {
        const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
        if (tds.length < 13) continue;

        const backNo = parseInt(stripTags(tds[0][1]), 10);
        // 선수명 셀: <a href="/racer/racerPopup.do?RACEID=...">{name}</a>
        const nameMatch = tds[1][1].match(
          /racerPopup\.do\?RACEID=\d+"?[^>]*>([\s\S]*?)<\/a>/,
        );
        const name = nameMatch
          ? decodeHtmlEntities(nameMatch[1].replace(/<[^>]*>/g, "").trim()).replace(
              /\s+/g,
              " ",
            )
          : stripTags(tds[1][1]);
        if (!backNo || !name) continue;

        const txt = (i: number) => stripTags(tds[i][1]);
        const rankRaw = txt(2);
        const speedRaw = txt(12);

        results.push({
          backNo,
          name,
          rank: rankRaw && /^\d+$/.test(rankRaw) ? parseInt(rankRaw, 10) : null,
          gap: txt(3),
          raceTime: txt(4),
          tactic: txt(5).replace(/\s/g, ""), // "선   행" → "선행"
          disqualified: txt(6),
          warning: txt(7),
          caution: txt(8),
          withdrawal: txt(9),
          finish: txt(10),
          record200m: txt(11),
          speed200m: speedRaw && !isNaN(parseFloat(speedRaw)) ? parseFloat(speedRaw) : null,
        });

        // 이 선수행에 raceReason.do 링크가 있으면 판정 조회 대상으로 기록
        // (실격/경고 칼럼 셀에 <a href="/race/raceReason.do?...RACEID=..."> 형태)
        const reasonSeen = new Set<string>();
        for (const rm of tr[1].matchAll(/raceReason\.do\?([^"'\s]+)/g)) {
          const query = decodeHtmlEntities(rm[1]);
          const idM = query.match(/RACEID=(\d+)/);
          const raceId = idM ? idM[1] : "";
          if (!raceId || reasonSeen.has(raceId)) continue;
          reasonSeen.add(raceId);
          reasonRefs.push({ backNo, name, query, raceId });
        }
      }
    }
  }

  return { env, results, reasonRefs, gradeEnv };
}

// raceReason.do 응답에서 판정 상세 파싱
// table.race_t02: 위반시기 | 위반장소 | 경륜시행규정 | 판정구분
// div.contents_box03: <h2>NN조 M호 규칙명</h2> <p>설명</p>
function parseReasonPage(html: string, ref: ReasonRef): Violation[] {
  const out: Violation[] = [];
  const nameIdx = html.indexOf("위반시기");
  if (nameIdx === -1) return out;
  const tb = html.substring(nameIdx).match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tb) return out;

  // 설명: contents_box03 의 h2(규칙명) + p(설명문)
  let description = "";
  const box = html.match(
    /contents_box03[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/,
  );
  if (box) {
    const ruleName = stripTags(box[1]).replace(/^\s*\d+\s*조\s*\d*\s*항?\s*\d*\s*호?\s*/, "");
    description = `${ruleName} ${stripTags(box[2])}`.trim();
  }

  const trs = [...tb[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  for (const tr of trs) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      stripTags(m[1]),
    );
    if (tds.length < 4) continue;
    // "72조 2호" / "73조 1항" / "75조" → article/paragraph/clause
    const reg = tds[2];
    const am = reg.match(/(\d+)\s*조/);
    const pm = reg.match(/(\d+)\s*항/);
    const cm = reg.match(/(\d+)\s*호/);
    const judgment = tds[3];
    if (judgment !== "실격" && judgment !== "경고" && judgment !== "주의") continue;
    out.push({
      backNo: ref.backNo,
      name: ref.name,
      violationTime: tds[0] || "",
      violationPlace: tds[1] || "",
      article: am ? am[1] : "",
      paragraph: pm ? pm[1] : "-",
      clause: cm ? cm[1] : "-",
      judgment,
      description,
    });
  }
  return out;
}

async function fetchReasonPage(query: string): Promise<string> {
  const url = `https://www.spo1.or.kr/race/raceReason.do?${query}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`raceReason HTTP ${res.status}`);
  return res.text();
}

// 각 경주의 reasonRefs 를 따라 raceReason.do 를 호출해 violations 채움
async function fetchBusanViolations(races: BusanRace[]): Promise<void> {
  for (const race of races) {
    // RACEID 기준 중복 제거 (같은 선수가 실격+경고면 링크가 중복될 수 있음)
    const seen = new Set<string>();
    for (const ref of race.reasonRefs) {
      if (seen.has(ref.raceId)) continue;
      seen.add(ref.raceId);
      try {
        const html = await fetchReasonPage(ref.query);
        race.violations.push(...parseReasonPage(html, ref));
      } catch (err) {
        console.warn(
          `  ⚠️ raceReason 조회 실패 (${race.raceNo}R ${ref.name}):`,
          err instanceof Error ? err.message : String(err),
        );
      }
      await delay(300);
    }
  }
}

// 결과 페이지에서 부산 경주 전부 파싱
function parseResultPage(html: string, ymd: string): BusanRace[] {
  const year = parseInt(ymd.slice(0, 4), 10);
  const isoDate = toIsoDate(ymd);

  // 부산 블록 앵커: layer_open('layerWrap4','{SEQ}','{DATE}','부산{NN}R ({등급}) {HH:MM}')
  // (모든 경기장이 같은 패턴 → 부산만 필터, 블록 경계는 다음 layerWrap4)
  const anchorRe =
    /layer_open\('layerWrap4','(\d+)','(\d{8})','(부산|창원|광명)(\d+)R \(([^)]*)\) ([\d:]+)'\)/g;
  const anchors = [...html.matchAll(anchorRe)];

  // 부산 앵커가 하나도 없으면 = 그 날 부산 미경주 (광명/창원만) → 조용히 스킵.
  // 부산 앵커가 있는데 회차/일차 파싱이 실패하는 경우만 진짜 경고 (헤더 포맷 변경 감지)
  const hasBusan = anchors.some((a) => a[3] === VENUE && a[2] === ymd);
  if (!hasBusan) return [];

  const rd = parseRoundDay(html, ymd);
  if (!rd) {
    console.warn(
      `  ⚠️ 부산 경주는 있으나 회차/일차 파싱 실패 (${ymd}) → 저장 안 함 (헤더 포맷 변경 의심)`,
    );
    return [];
  }
  if (!rd.dateOk) return [];

  const races: BusanRace[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (a[3] !== VENUE) continue;
    if (a[2] !== ymd) continue; // layer_open 내 날짜도 요청일과 일치해야 함
    const raceNo = parseInt(a[4], 10);
    const start = a.index!;
    const end = i + 1 < anchors.length ? anchors[i + 1].index! : html.length;
    const block = html.substring(start, end);

    const { env, results, reasonRefs, gradeEnv } = parseBlock(block);
    if (results.length === 0) continue; // 미확정/데이터 없음 → 다음 실행에서 갱신

    // 등급: 앵커 a[5] 우선, 환경 테이블 c[0](gradeEnv)는 이중 확인용
    const gradeAnchor = (a[5] || "").trim();
    if (gradeEnv && gradeAnchor && gradeEnv !== gradeAnchor) {
      console.warn(
        `  ⚠️ 등급 불일치 (${raceNo}R): 앵커 "${gradeAnchor}" / 요약 "${gradeEnv}" → 앵커값 사용`,
      );
    }

    races.push({
      year,
      round: rd.round,
      day: rd.day,
      raceNo,
      date: isoDate,
      gradeRaw: gradeAnchor || gradeEnv,
      env,
      results,
      reasonRefs,
      violations: [],
    });
  }

  return races;
}

async function fetchResultPage(ymd: string): Promise<string> {
  const year = ymd.slice(0, 4);
  const url = `https://www.spo1.or.kr/race/raceResult.do?RACEYY=${year}&RACEDATE=${ymd}&gubun=Y`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`raceResult HTTP ${res.status} (${ymd})`);
  return res.text();
}

// ---------- Supabase 적재 ----------
async function seedToSupabase(races: BusanRace[]): Promise<void> {
  if (races.length === 0) return;

  const raceRows = races.map((r) => ({
    year: r.year,
    round: r.round,
    day: r.day,
    race_no: r.raceNo,
    date: r.date,
    venue: VENUE,
    grade_raw: r.gradeRaw || null,
    grade: normalizeGrade(r.gradeRaw),
    env_time: r.env.time || null,
    env_weather: r.env.weather || null,
    env_wind_dir: r.env.windDir || null,
    env_wind_speed: r.env.windSpeed || null,
    env_temp: r.env.temp || null,
    env_humidity: r.env.humidity || null,
    env_rainfall: r.env.rainfall || null,
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

  const resultRows: Array<Record<string, unknown>> = [];
  for (const race of races) {
    const raceId = raceIdMap.get(`${race.year}|${race.round}|${race.day}|${race.raceNo}`);
    if (!raceId) {
      console.warn(
        `  ⚠️ race_id 없음: ${race.round}회 ${race.day}일 ${race.raceNo}R (부산)`,
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

  // violations upsert (venue='부산')
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

// ---------- 이미 violations 까지 수집된 부산 날짜 집합 (--year 모드용) ----------
// race_results 만 있고 violations 가 없는 날짜는 재수집해야 하므로
// "races 존재" 가 아니라 "violations 존재" 기준으로 스킵 판정한다.
// (races/race_results upsert 는 멱등이라 재처리해도 무손상)
async function existingBusanDates(year: number): Promise<Set<string>> {
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

// ---------- 단일 날짜 수집 ----------
async function collectOne(ymd: string): Promise<number> {
  const html = await fetchResultPage(ymd);
  const races = parseResultPage(html, ymd);
  if (races.length === 0) {
    console.log(`  ${ymd}: 부산 확정 경주 없음`);
    return 0;
  }
  console.log(
    `  ${ymd} (${races[0].round}회 ${races[0].day}일차): 부산 ${races.length}경주`,
  );
  await fetchBusanViolations(races);
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
    if (!/^\d{4}$/.test(yearArg)) {
      console.error("ERROR: --year 형식 오류 (YYYY):", yearArg);
      process.exit(1);
    }
    const year = parseInt(yearArg, 10);
    console.log(`=== 부산 ${year}년 전체 수집 ===`);
    const dates = await fetchYearDates(year);
    if (dates.length === 0) {
      console.log(`  ${year}년 부산 경주일 없음`);
      return;
    }

    const skipDates = await existingBusanDates(year);
    console.log(
      `  경주일 ${dates.length}개 / DB 기존 날짜 ${skipDates.size}개 (스킵 대상)\n`,
    );

    let total = 0;
    for (const ymd of dates) {
      if (skipDates.has(toIsoDate(ymd))) {
        console.log(`  ${ymd}: DB에 이미 존재 → 스킵`);
        continue;
      }
      try {
        total += await collectOne(ymd);
      } catch (err) {
        console.error(
          `  ERROR ${ymd}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
      await delay(DELAY_MS);
    }
    console.log(`\n=== ${year}년 완료: 총 ${total}경주 적재 ===`);
    return;
  }

  // === --date YYYYMMDD / 인자 없음(오늘): 스킵 없음, upsert 멱등 ===
  const targetYmd = dateArg ?? todayKstYmd();
  if (!/^\d{8}$/.test(targetYmd)) {
    console.error("ERROR: --date 형식 오류 (YYYYMMDD):", targetYmd);
    process.exit(1);
  }
  console.log(
    dateArg
      ? `=== 부산 단일 날짜 수집: ${targetYmd} ===`
      : `=== 부산 오늘 자동 수집: ${targetYmd} ===`,
  );

  // 해당 월 경주일 목록으로 경주일 여부 확인
  const yyyymm = targetYmd.slice(0, 6);
  let monthDates: string[] = [];
  try {
    monthDates = await fetchMonthDates(yyyymm);
  } catch (err) {
    console.warn(
      `  ⚠️ 월 경주일 목록 조회 실패 → 페이지 직접 시도:`,
      err instanceof Error ? err.message : String(err),
    );
  }
  if (monthDates.length > 0 && !monthDates.includes(targetYmd)) {
    console.log(`  ${targetYmd}: 부산 경주일 아님 (월 목록에 없음)`);
    return;
  }

  try {
    const n = await collectOne(targetYmd);
    console.log(`\n=== 완료: ${targetYmd} 부산 ${n}경주 적재 ===`);
  } catch (err) {
    console.error("치명적 에러:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
