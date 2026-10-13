/**
 * races + race_results 시딩 (src/data/yearly-race-detail/<year>.json → Supabase)
 *
 * ⚠️ 이 스크립트는 **광명 전용**이다. yearly-race-detail 파일에는 광명 데이터만 있다.
 *
 * 사용법 (--year 필수):
 *   npx tsx scripts/seed/seed-races.ts --year 2025 --dry-run   ← 먼저 이것부터
 *   npx tsx scripts/seed/seed-races.ts --year 2025
 *   npx tsx scripts/seed/seed-races.ts --year 2026 --allow-shrink
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 2026-10-13 사고 기록 — 이 스크립트가 창원·부산 race_results 20,832행을 손상시켰다
 *
 * 무슨 일이: race_id 맵의 키가 `year|round|day|race_no` 였고 **venue 가 빠져** 있었다.
 *   races UNIQUE 는 (year, round, day, race_no, venue) 이므로 같은 키에 광명·창원·부산
 *   3개 행이 존재한다. 맵이 그 셋을 하나로 뭉개 마지막에 쓰인 race_id 만 남겼고,
 *   광명 전용 데이터가 창원·부산 race_id 로 upsert 됐다.
 *   창원 1,700경주 / 부산 1,276경주 (2022-03-04 ~ 2026-06-12) 가 광명 데이터로 덮였다.
 *   무료 요금제라 PITR 복원이 불가해 원본 재수집으로만 복구된다.
 *
 * 악화시킨 것들:
 *   - race_id 조회에 .order() 가 없어 어느 구장이 맵을 차지하는지 비결정적이었다
 *     → 재실행마다 손상 패턴이 달라진다 (CLAUDE.md 규칙 3)
 *   - races upsert onConflict 가 (year,round,day,race_no) 로 실제 제약과 불일치해
 *     전량 실패했는데, console.error 만 하고 다음 단계로 진행했다
 *   - raceRows 에 venue 필드 자체가 없어서 그 제약이 성립할 수 없었다
 *   - --year 인자가 없어 실행하면 무조건 24개 연도 전체를 덮어썼다
 *
 * 그래서 지금은:
 *   1) 맵 키에 venue 를 넣고, **애초에 광명 race_id 만 조회한다** (.eq("venue", VENUE)).
 *      창원·부산 race_id 가 맵에 들어오지 않으면 같은 사고가 구조적으로 불가능하다.
 *      fetch-changwon-results.ts / fetch-busan-results.ts 가 쓰는 방식과 같다.
 *   2) 고유키로 정렬한다 (.order("id")).
 *   3) onConflict 를 실제 제약과 일치시키고 raceRows 에 venue 를 넣는다.
 *   4) 에러가 나면 **중단한다**. 부분 적용 상태로 끝나는 것이 가장 위험하다.
 *   5) --year 를 필수로 한다. 인자 없이 실행하면 아무것도 하지 않고 exit 1.
 *   6) 파일 경주수가 DB 광명 경주수보다 **적으면 중단한다** (--allow-shrink 로만 강행).
 *      오래된 연도 파일이 최신 DB 를 과거 값으로 후퇴시키는 것을 막는다.
 *      2026.json 은 13경주뿐인데 DB 광명 2026 은 1,664경주다.
 *   7) --dry-run 으로 쓰기 없이 계획만 출력한다. 이번 사고는 dry-run 이 있었다면
 *      사전에 잡혔다.
 * ──────────────────────────────────────────────────────────────────────────
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DATA_DIR = path.join(process.cwd(), "src", "data");
const BATCH_SIZE = 500;
const PAGE_SIZE = 1000;

/** 이 스크립트가 다루는 구장. yearly-race-detail 은 광명 데이터만 담는다 */
const VENUE = "광명";

/** races 의 실제 UNIQUE 제약과 반드시 일치해야 한다 */
const RACES_ON_CONFLICT = "year,round,day,race_no,venue";

/**
 * Paginated fetch to bypass PostgREST 1000-row limit.
 *
 * ⚠️ 정렬은 **호출자가** .order() 로 걸어야 한다. ORDER BY 없이 .range() 를 쓰면
 *    행이 중복·누락되는데 에러도 안 나고 가져온 건수도 맞는다 (CLAUDE.md 규칙 3).
 *    race_id 맵이 그렇게 어긋나면 데이터가 다른 경주에 쓰인다.
 */
async function fetchAllRows<T = Record<string, unknown>>(
  query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }
): Promise<T[]> {
  let all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/**
 * 중단 사유를 던진다.
 *
 * 왜 process.exit(1) 을 직접 부르지 않는가: 진행 중인 Supabase 요청이 있는 상태에서
 * 동기적으로 exit 하면 Windows 에서 libuv assertion 이 터지고 종료코드가 127 이 된다.
 * 호출자(seed-all.ts)가 종료코드로 실패를 판정하므로 1 로 끝나야 한다.
 */
class SeedError extends Error {}
function fail(msg: string): never {
  throw new SeedError(msg);
}

interface Options {
  year: number;
  dryRun: boolean;
  allowShrink: boolean;
}

function usage(): never {
  console.error(
    [
      "ERROR: --year 는 필수입니다. 인자 없이 실행하면 아무것도 하지 않습니다.",
      "",
      "  이 스크립트는 2026-10-13 에 창원·부산 race_results 20,832행을 손상시킨 적이 있습니다.",
      "  연도를 명시하고, 반드시 --dry-run 으로 먼저 확인하세요.",
      "",
      "사용법:",
      "  npx tsx scripts/seed/seed-races.ts --year 2025 --dry-run   # 쓰지 않고 계획만 출력",
      "  npx tsx scripts/seed/seed-races.ts --year 2025             # 실제 적용",
      "",
      "옵션:",
      "  --year <연도>     (필수) 시딩할 연도. yearly-race-detail/<연도>.json 이 있어야 합니다",
      "  --dry-run         DB 에 쓰지 않고 무엇을 몇 건 쓸지만 출력합니다",
      "  --allow-shrink    파일 경주수가 DB 보다 적어도 강행합니다 (광명 행이 과거 값으로",
      "                    후퇴할 수 있습니다. 정말 의도한 경우에만 쓰세요)",
    ].join("\n")
  );
  process.exit(1);
}

function parseArgs(): Options {
  const argv = process.argv.slice(2);
  let year: number | null = null;
  let dryRun = false;
  let allowShrink = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--year") {
      const v = argv[i + 1];
      if (!v) usage();
      const n = parseInt(v, 10);
      if (!Number.isInteger(n) || n < 2003 || n > 2100) {
        console.error(`ERROR: --year 값이 올바르지 않습니다: ${v}`);
        process.exit(1);
      }
      year = n;
      i++;
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--allow-shrink") {
      allowShrink = true;
    } else {
      console.error(`ERROR: 알 수 없는 인자: ${a}`);
      usage();
    }
  }

  if (year === null) usage();
  return { year, dryRun, allowShrink };
}

async function seedRaces() {
  const opts = parseArgs();
  const { year, dryRun, allowShrink } = opts;

  console.log(
    `=== seed-races (${VENUE} 전용) — ${year}년${dryRun ? " [DRY RUN — DB 에 쓰지 않습니다]" : ""} ===\n`
  );

  // ---------------------------------------------------------------- 파일 로드
  const filePath = path.join(DATA_DIR, "yearly-race-detail", `${year}.json`);
  if (!fs.existsSync(filePath)) {
    fail(`파일이 없습니다: ${path.relative(process.cwd(), filePath)}`);
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const races = data.races as Array<{
    year: number;
    round: number;
    day: number;
    raceNo: number;
    date: string;
    environment: Record<string, string>;
    results: Array<Record<string, unknown>>;
  }>;

  if (!Array.isArray(races)) {
    fail(`${path.relative(process.cwd(), filePath)} 에 races 배열이 없습니다`);
  }

  const fileResultCount = races.reduce((n, r) => n + (r.results?.length ?? 0), 0);
  console.log(`파일: ${races.length}경주 / ${fileResultCount}행`);

  // ---------------------------------------------------------------- 사전 검사
  // 파일이 DB 보다 적으면 광명 행을 과거 값으로 후퇴시킬 수 있다.
  // (2026.json 은 13경주, DB 광명 2026 은 1,664경주 — 실측)
  const { count: dbRaceCount, error: countError } = await supabase
    .from("races")
    .select("*", { count: "exact", head: true })
    .eq("year", year)
    .eq("venue", VENUE);

  if (countError) {
    fail(`DB 경주수 조회 실패: ${countError.message}`);
  }

  console.log(`DB  : ${dbRaceCount ?? 0}경주 (${VENUE} ${year}년)\n`);

  if ((dbRaceCount ?? 0) > races.length) {
    const msg = [
      `파일 경주수(${races.length})가 DB(${dbRaceCount})보다 ${(dbRaceCount ?? 0) - races.length}건 적습니다.`,
      `이대로 쓰면 DB 의 ${VENUE} 데이터가 파일의 과거 값으로 후퇴할 수 있습니다.`,
    ].join("\n  ");
    if (!allowShrink) {
      fail(
        `${msg}
  정말 의도한 것이라면 --allow-shrink 를 붙이세요. 그 전에 파일을 먼저 갱신하는 편이 맞습니다.`
      );
    }
    console.warn(`경고: ${msg}`);
    console.warn("  --allow-shrink 가 지정돼 강행합니다.\n");
  }

  // ---------------------------------------------------------------- races upsert
  const raceRows = races.map((r) => ({
    year: r.year,
    round: r.round,
    day: r.day,
    race_no: r.raceNo,
    // ⚠️ venue 가 없으면 RACES_ON_CONFLICT 제약이 성립하지 않아 upsert 가 전량 실패한다
    venue: VENUE,
    date: r.date,
    env_time: r.environment?.time || null,
    env_weather: r.environment?.weather || null,
    env_wind_dir: r.environment?.windDir || null,
    env_wind_speed: r.environment?.windSpeed || null,
    env_temp: r.environment?.temp || null,
    env_humidity: r.environment?.humidity || null,
    env_rainfall: r.environment?.rainfall || null,
    env_record_200m: r.environment?.record200m || null,
    env_last_lap: r.environment?.lastLap || null,
  }));

  if (dryRun) {
    console.log(`[dry-run] races upsert 예정: ${raceRows.length}건 (onConflict: ${RACES_ON_CONFLICT})`);
  } else {
    for (let i = 0; i < raceRows.length; i += BATCH_SIZE) {
      const batch = raceRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("races").upsert(batch, { onConflict: RACES_ON_CONFLICT });
      if (error) {
        // 여기서 계속 진행하면 race_id 가 어긋난 채로 race_results 가 쓰인다 — 중단한다
        fail(`races upsert 실패 (batch ${i}): ${error.message}`);
      }
    }
    console.log(`races upsert 완료: ${raceRows.length}건`);
  }

  // ---------------------------------------------------------------- race_id 조회
  // ⚠️ .eq("venue", VENUE) 가 이 스크립트의 핵심 안전장치다.
  //    창원·부산 race_id 가 맵에 들어오지 않으므로 그 행을 덮어쓸 수 없다.
  //    .order("id") 는 페이지 경계에서 행이 새지 않게 하는 고유키 정렬이다.
  let dbRaces: Array<{ id: number; year: number; round: string; day: number; race_no: number; venue: string }>;
  try {
    dbRaces = await fetchAllRows(
      supabase
        .from("races")
        .select("id, year, round, day, race_no, venue")
        .eq("year", year)
        .eq("venue", VENUE)
        .order("id", { ascending: true })
    );
  } catch (e) {
    if (e instanceof SeedError) throw e;
    fail(`race_id 조회 실패 (${year}): ${(e as Error).message}`);
  }

  const offVenue = dbRaces.filter((r) => r.venue !== VENUE);
  if (offVenue.length > 0) {
    // 필터가 걸려 있으니 일어날 수 없다. 일어났다면 전제가 깨진 것이므로 쓰지 않고 멈춘다
    fail(`${VENUE} 아닌 경주가 ${offVenue.length}건 조회됐습니다. 중단합니다.`);
  }

  // ⚠️ 키에 venue 를 포함한다. 이것이 빠진 것이 2026-10-13 손상의 직접 원인이다.
  const raceIdMap = new Map<string, number>();
  for (const r of dbRaces) {
    raceIdMap.set(`${r.year}|${r.round}|${r.day}|${r.race_no}|${r.venue}`, r.id);
  }
  console.log(`race_id 매핑: ${raceIdMap.size}건 (전부 venue=${VENUE})`);

  // ---------------------------------------------------------------- race_results
  const resultRows: Array<Record<string, unknown>> = [];
  let unmatchedRaces = 0;
  for (const race of races) {
    const raceId = raceIdMap.get(`${race.year}|${race.round}|${race.day}|${race.raceNo}|${VENUE}`);
    if (!raceId) {
      unmatchedRaces++;
      continue;
    }
    for (const res of race.results || []) {
      resultRows.push({
        race_id: raceId,
        back_no: res.backNo,
        name: res.name,
        rank: res.rank || null,
        gap: res.gap || null,
        race_time: res.raceTime || null,
        tactic: res.tactic || null,
        disqualified: res.disqualified || null,
        warning: res.warning || null,
        caution: res.caution || null,
        withdrawal: res.withdrawal || null,
        finish: res.finish || null,
        record_200m: res.record200m || null,
        speed_200m: res.speed200m || null,
      });
    }
  }

  if (unmatchedRaces > 0) {
    console.warn(`경고: race_id 를 찾지 못한 경주 ${unmatchedRaces}건은 건너뜁니다`);
  }
  console.log(`race_results 대상: ${resultRows.length}행`);

  if (dryRun) {
    console.log(`\n[dry-run] race_results upsert 예정: ${resultRows.length}건 (onConflict: race_id,back_no)`);
    console.log("[dry-run] DB 에 아무것도 쓰지 않았습니다.");
    console.log("\n=== dry-run 완료 ===");
    return;
  }

  for (let i = 0; i < resultRows.length; i += BATCH_SIZE) {
    const batch = resultRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("race_results").upsert(batch, { onConflict: "race_id,back_no" });
    if (error) {
      fail(`race_results upsert 실패 (batch ${i}): ${error.message}`);
    }
  }

  console.log(`race_results upsert 완료: ${resultRows.length}행`);
  console.log(`\n=== ${year}년 ${VENUE} 시딩 완료 ===`);
}

seedRaces().catch((e) => {
  if (e instanceof SeedError) {
    console.error(`ERROR: ${e.message}`);
  } else {
    console.error("치명적 에러:", e instanceof Error ? e.message : e);
  }
  // process.exit() 대신 exitCode 를 세운다 — 진행 중인 요청과 겹쳐 터지는 것을 막는다
  process.exitCode = 1;
});
