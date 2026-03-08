// ============================================================
// 최신 경주결과 수집 + Supabase 시딩 공유 라이브러리
// 소스 1: kcycle.or.kr → races + race_results (환경/선수별 결과)
// 소스 2: data.go.kr → race_odds (배당)
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";

// ========== Types ==========

interface RaceEnvironment {
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

interface RacerResult {
  backNo: number;
  name: string;
  rank: number;
  gap: string;
  raceTime: string;
  tactic: string;
  disqualified: string;
  warning: string;
  caution: string;
  withdrawal: string;
  finish: string;
  record200m: string;
  speed200m: number;
}

interface RaceDetail {
  year: number;
  round: number;
  day: number;
  raceNo: number;
  date: string;
  environment: RaceEnvironment;
  results: RacerResult[];
}

export interface FetchResultsResult {
  success: boolean;
  date?: string;
  racesCount?: number;
  resultsCount?: number;
  oddsCount?: number;
  message?: string;
}

// ========== HTML Parsing (from fetch-race-detail.ts) ==========

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseRaceDetail(
  html: string, year: number, round: number, dayNum: number, raceNo: number, date: string
): RaceDetail | null {
  const envMatch = html.match(
    /시간[\s\S]*?날씨[\s\S]*?풍향[\s\S]*?풍속[\s\S]*?기온[\s\S]*?습도[\s\S]*?우량[\s\S]*?200M[\s\S]*?최종주회([\s\S]{0,800})/
  );

  let environment: RaceEnvironment = {
    time: "", weather: "", windDir: "", windSpeed: "",
    temp: "", humidity: "", rainfall: "", record200m: "", lastLap: "",
  };

  if (envMatch) {
    const cells = [...envMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map(m => decodeHtmlEntities(m[1].replace(/<[^>]*>/g, "").trim()));
    if (cells.length >= 9) {
      environment = {
        time: cells[0], weather: cells[1], windDir: cells[2], windSpeed: cells[3],
        temp: cells[4], humidity: cells[5], rainfall: cells[6], record200m: cells[7], lastLap: cells[8],
      };
    }
  }

  const results: RacerResult[] = [];
  const racerIdx = html.indexOf("선수명");
  if (racerIdx > -1) {
    const afterRacer = html.substring(racerIdx);
    const tbodyMatch = afterRacer.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (tbodyMatch) {
      const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      for (const tr of trs) {
        const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
          .map(m => decodeHtmlEntities(m[1].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " "));
        if (cells.length < 12) continue;

        const nameMatch = cells[0].match(/^(\d+)\s+(.+)/);
        if (!nameMatch) continue;

        results.push({
          backNo: parseInt(nameMatch[1]),
          name: nameMatch[2].trim(),
          rank: parseInt(cells[1]) || 0,
          gap: cells[2] || "-",
          raceTime: cells[3] || "",
          tactic: cells[4] || "",
          disqualified: cells[5] || "-",
          warning: cells[6] || "-",
          caution: cells[7] || "-",
          withdrawal: cells[8] || "-",
          finish: cells[9] || "-",
          record200m: cells[10] || "",
          speed200m: parseFloat(cells[11]) || 0,
        });
      }
    }
  }

  if (results.length === 0 && !envMatch) return null;

  return { year, round, day: dayNum, raceNo, date, environment, results };
}

// ========== data.go.kr API (from keirin-api.ts + fetch-race-data.ts) ==========

interface ApiRaceResult {
  race_ymd: string;
  meet_nm: string;
  race_no: string;
  stnd_yr: string;
  pool1_val: string;
  pool2_val: string;
  pool4_val: string;
  pool5_val: string;
  pool6_val: string;
  pool7_val: string;
  pool8_val: string;
  week_tcnt: number;
  day_tcnt: number;
}

function parsePoolVal(val: string | undefined): number {
  if (!val || val.trim() === "") return 0;
  const match = val.match(/\)\s*([\d.]+)/);
  if (!match) return 0;
  const n = parseFloat(match[1]);
  return isNaN(n) ? 0 : Math.round(n * 10) / 10;
}

function parseYeonseung(val: string | undefined): [number, number] {
  if (!val || val.trim() === "") return [0, 0];
  const matches = [...val.matchAll(/\)\s*([\d.]+)/g)];
  const first = matches[0] ? parseFloat(matches[0][1]) : 0;
  const second = matches[1] ? parseFloat(matches[1][1]) : 0;
  return [
    isNaN(first) ? 0 : Math.round(first * 10) / 10,
    isNaN(second) ? 0 : Math.round(second * 10) / 10,
  ];
}

async function fetchOddsFromDataGoKr(
  apiKey: string, year: string, dateStr: string
): Promise<Array<{ raceNo: number; round: number; day: number; odds: Record<string, number> }>> {
  const API_BASE = "https://apis.data.go.kr/B551014/SRVC_TODZ_CRA_RACE_RESULT/TODZ_API_CRA_RACE_RESULT";
  const mmdd = dateStr.slice(5).replace(/-/g, "");

  const results: Array<{ raceNo: number; round: number; day: number; odds: Record<string, number> }> = [];
  let pageNo = 1;

  while (true) {
    const url = new URL(API_BASE);
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("resultType", "json");
    url.searchParams.set("stnd_yr", year);
    url.searchParams.set("pageNo", String(pageNo));
    url.searchParams.set("numOfRows", "100");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`data.go.kr API error: ${res.status}`);

    const data = await res.json();
    if (data.response?.header?.resultCode !== "00") break;

    const items = data.response.body?.items?.item;
    if (!items) break;

    const arr: ApiRaceResult[] = Array.isArray(items) ? items : [items];
    if (arr.length === 0) break;

    for (const item of arr) {
      if ((item.meet_nm || "").trim() !== "광명") continue;
      if (item.race_ymd !== mmdd) continue;

      const raceNo = parseInt(item.race_no, 10);
      if (isNaN(raceNo)) continue;

      const [yeonseung1, yeonseung2] = parseYeonseung(item.pool2_val);
      const odds: Record<string, number> = {
        odds_win: parsePoolVal(item.pool1_val),
        odds_place_1st: yeonseung1,
        odds_place_2nd: yeonseung2,
        odds_exacta: parsePoolVal(item.pool4_val),
        odds_quinella: parsePoolVal(item.pool5_val),
        odds_trio: parsePoolVal(item.pool6_val),
        odds_trifecta: parsePoolVal(item.pool7_val),
        odds_duet: parsePoolVal(item.pool8_val),
      };

      if (Object.values(odds).every((v) => v === 0)) continue;

      results.push({
        raceNo,
        round: typeof item.week_tcnt === "string" ? parseInt(item.week_tcnt) : item.week_tcnt,
        day: typeof item.day_tcnt === "string" ? parseInt(item.day_tcnt) : item.day_tcnt,
        odds,
      });
    }

    const totalCount = data.response.body?.totalCount || 0;
    if (pageNo * 100 >= totalCount) break;
    pageNo++;
  }

  return results;
}

// ========== kcycle HTML Fetch ==========

async function fetchRaceDetailHtml(year: number, round: number, day: number, raceNo: number): Promise<string> {
  const paddedRaceNo = String(raceNo).padStart(2, "0");
  const url = `https://www.kcycle.or.kr/race/result/general/${year}/${round}/${day}/001/${paddedRaceNo}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

/** 경주결과 요약 페이지에서 경주 개수 확인 */
async function fetchRaceSummaryHtml(year: number, round: number, day: number): Promise<string> {
  const url = `https://www.kcycle.or.kr/race/result/general/popup/txt/${year}/${round}/${day}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

function countRacesFromSummary(html: string): number {
  const matches = html.match(/(광명)\s+(\d+)\s*경주/g);
  return matches ? matches.length : 0;
}

// ========== Supabase Seeding ==========

async function seedRaceDetails(
  supabase: SupabaseClient, races: RaceDetail[]
): Promise<{ racesCount: number; resultsCount: number }> {
  if (races.length === 0) return { racesCount: 0, resultsCount: 0 };

  // 1. races 테이블 upsert
  const raceRows = races.map((r) => ({
    year: r.year,
    round: r.round,
    day: r.day,
    race_no: r.raceNo,
    date: r.date,
    env_time: r.environment.time || null,
    env_weather: r.environment.weather || null,
    env_wind_dir: r.environment.windDir || null,
    env_wind_speed: r.environment.windSpeed || null,
    env_temp: r.environment.temp || null,
    env_humidity: r.environment.humidity || null,
    env_rainfall: r.environment.rainfall || null,
    env_record_200m: r.environment.record200m || null,
    env_last_lap: r.environment.lastLap || null,
  }));

  const { error: raceErr } = await supabase
    .from("races")
    .upsert(raceRows, { onConflict: "year,round,day,race_no" });
  if (raceErr) throw new Error(`races upsert failed: ${raceErr.message}`);

  // 2. race ID 조회
  const year = races[0].year;
  const round = races[0].round;
  const day = races[0].day;

  const { data: insertedRaces, error: fetchErr } = await supabase
    .from("races")
    .select("id, race_no")
    .eq("year", year)
    .eq("round", round)
    .eq("day", day);

  if (fetchErr || !insertedRaces) throw new Error(`race ID fetch failed: ${fetchErr?.message}`);

  const raceIdMap = new Map<number, number>();
  for (const r of insertedRaces) {
    raceIdMap.set(r.race_no, r.id);
  }

  // 3. race_results upsert
  let totalResults = 0;
  for (const race of races) {
    const raceId = raceIdMap.get(race.raceNo);
    if (!raceId) continue;

    const resultRows = race.results.map((r) => ({
      race_id: raceId,
      back_no: r.backNo,
      name: r.name,
      rank: r.rank || null,
      gap: r.gap || null,
      race_time: r.raceTime || null,
      tactic: r.tactic || null,
      disqualified: r.disqualified || null,
      warning: r.warning || null,
      caution: r.caution || null,
      withdrawal: r.withdrawal || null,
      finish: r.finish || null,
      record_200m: r.record200m || null,
      speed_200m: r.speed200m || null,
    }));

    if (resultRows.length > 0) {
      const { error } = await supabase
        .from("race_results")
        .upsert(resultRows, { onConflict: "race_id,back_no" });
      if (error) throw new Error(`race_results upsert failed (race ${race.raceNo}): ${error.message}`);
      totalResults += resultRows.length;
    }
  }

  return { racesCount: raceRows.length, resultsCount: totalResults };
}

async function seedOdds(
  supabase: SupabaseClient,
  dateStr: string,
  oddsData: Array<{ raceNo: number; round: number; day: number; odds: Record<string, number> }>
): Promise<number> {
  if (oddsData.length === 0) return 0;

  const rows = oddsData.map((o) => ({
    date: dateStr,
    race_no: o.raceNo,
    venue: "광명",
    ...o.odds,
  }));

  const { error } = await supabase
    .from("race_odds")
    .upsert(rows, { onConflict: "date,race_no" });
  if (error) throw new Error(`race_odds upsert failed: ${error.message}`);

  return rows.length;
}

// ========== Main Export ==========

export async function fetchAndSeedLatestResults(
  supabase: SupabaseClient,
  options?: { date?: string; apiKey?: string }
): Promise<FetchResultsResult> {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = options?.date || kstNow.toISOString().slice(0, 10);
  const year = parseInt(dateStr.slice(0, 4), 10);

  console.log(`경주결과 수집 시작: ${dateStr}`);

  // 1. race_schedule에서 해당 날짜의 round/day 조회
  const { data: schedRow } = await supabase
    .from("race_schedule")
    .select("round, day")
    .eq("date", dateStr)
    .single();

  if (!schedRow) {
    return { success: false, date: dateStr, message: `${dateStr}은 경주일이 아닙니다 (race_schedule에 없음)` };
  }

  const { round, day } = schedRow;
  console.log(`  ${year}년 ${round}회차 ${day}일차`);

  // 2. kcycle에서 경주결과 요약 → 경주 수 파악
  let totalRaces: number;
  try {
    const summaryHtml = await fetchRaceSummaryHtml(year, round, day);
    totalRaces = countRacesFromSummary(summaryHtml);
    if (totalRaces === 0) {
      // 광명 경주가 요약에 없으면 기본 16경주 시도
      totalRaces = 16;
    }
    console.log(`  광명 경주 수: ${totalRaces}`);
  } catch {
    totalRaces = 16;
    console.log(`  요약 조회 실패, 기본 16경주 시도`);
  }

  // 2-1. DB에 이미 수집된 경주 수 확인 → 완전하면 스킵
  const { count: dbRaceCount } = await supabase
    .from("races")
    .select("*", { count: "exact", head: true })
    .eq("year", year)
    .eq("round", round)
    .eq("day", day);

  const existingCount = dbRaceCount || 0;

  if (existingCount > 0 && existingCount >= totalRaces) {
    // 배당도 이미 있는지 확인
    const { count: dbOddsCount } = await supabase
      .from("race_odds")
      .select("*", { count: "exact", head: true })
      .eq("date", dateStr);

    if ((dbOddsCount || 0) >= totalRaces) {
      console.log(`  이미 완전히 수집됨 (DB ${existingCount}경주, 배당 ${dbOddsCount}건) → 스킵`);
      return {
        success: true, date: dateStr,
        racesCount: existingCount, resultsCount: 0, oddsCount: dbOddsCount || 0,
        message: "이미 완전히 수집된 날짜입니다",
      };
    }
    console.log(`  DB ${existingCount}경주 수집됨, 배당 ${dbOddsCount || 0}건 → 배당 재수집`);
  } else if (existingCount > 0) {
    console.log(`  DB ${existingCount}경주 < 실제 ${totalRaces}경주 → 재수집`);
  }

  // 3. kcycle에서 경주별 상세 수집
  const races: RaceDetail[] = [];
  for (let raceNo = 1; raceNo <= totalRaces; raceNo++) {
    try {
      const html = await fetchRaceDetailHtml(year, round, day, raceNo);
      const detail = parseRaceDetail(html, year, round, day, raceNo, dateStr);
      if (detail && detail.results.length > 0) {
        races.push(detail);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  경주 ${raceNo} 수집 실패: ${msg}`);
    }
  }

  if (races.length === 0) {
    return {
      success: false, date: dateStr,
      message: "수집된 경주결과가 없습니다 (아직 경기가 끝나지 않았을 수 있음)",
    };
  }

  console.log(`  kcycle: ${races.length}경주 수집`);

  // 4. Supabase에 races + race_results 시딩
  const { racesCount, resultsCount } = await seedRaceDetails(supabase, races);
  console.log(`  races: ${racesCount}건, race_results: ${resultsCount}건 시딩`);

  // 5. data.go.kr에서 배당 수집 (API 키 있으면)
  let oddsCount = 0;
  const apiKey = options?.apiKey || process.env.DATA_GO_KR_API_KEY;
  if (apiKey) {
    try {
      const oddsData = await fetchOddsFromDataGoKr(apiKey, String(year), dateStr);
      if (oddsData.length > 0) {
        oddsCount = await seedOdds(supabase, dateStr, oddsData);
        console.log(`  race_odds: ${oddsCount}건 시딩`);
      } else {
        console.log(`  race_odds: data.go.kr에 해당 날짜 데이터 없음 (반영 지연 가능)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  race_odds 수집 실패 (무시): ${msg}`);
    }
  } else {
    console.log(`  race_odds: DATA_GO_KR_API_KEY 없어서 건너뜀`);
  }

  console.log(`완료: ${dateStr} - ${racesCount}경주, ${resultsCount}명, 배당 ${oddsCount}건`);

  return {
    success: true,
    date: dateStr,
    racesCount,
    resultsCount,
    oddsCount,
  };
}
