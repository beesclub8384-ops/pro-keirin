/**
 * 창원·부산 race_results 복구 러너 — 기준선의 손상 날짜만 --date 모드로 하나씩 재수집한다
 *
 * 배경: 2026-10-13 01:29~01:35 UTC 에 seed-races.ts 가 광명 데이터를 창원·부산
 *   race_id 에 덮어썼다 (race_id 맵에서 venue 누락). 무료 요금제라 PITR 복원이
 *   불가해 원본(lepopark/spo1) 재수집으로만 복구된다.
 *
 * 이 러너가 하는 일은 딱 하나다: **기준선 JSON 의 damagedDates 에 있는 날짜만**
 *   fetch-changwon-results.ts / fetch-busan-results.ts 에 --date 로 넘긴다.
 *
 * 왜 --date 모드인가:
 *   --year 모드는 "DB 에 이미 있는 날짜를 스킵" 한다 (fetch-changwon-results.ts:547).
 *   손상된 날짜는 DB 에 행이 있으니 전부 스킵되어 아무것도 복구되지 않는다.
 *   --date 모드는 항상 upsert 하고 멱등이다 (시범 1일에서 확인: violations 증가 0).
 *
 * 안전장치:
 *   - --venue 와 --year 둘 다 필수. 없으면 아무것도 하지 않고 exit 1
 *   - 실행 직전에 "그 날짜가 기준선 목록에 있는지" 매번 재확인한다.
 *     목록에 없으면 실행하지 않고 중단한다 (범위를 넘지 않는 것이 최우선)
 *   - 기본값은 **실패 시 중단**. 부분 적용 상태로 계속 가면 원인 추적이 어려워진다
 *   - --dry-run 으로 대상 날짜만 출력하고 실행하지 않는다
 *   - 요청 사이에 지연을 둔다 (기본 6초). 원본 사이트 과부하를 막는다
 *   - 날짜별로 최대 3회 시도한다 (재시도 전 5초, 15초 대기). lepopark/spo1 은
 *     일시적으로 `terminated`(응답 수신 중 연결 끊김)를 낸다 — 실측. 데이터 문제가
 *     아니므로 재시도하면 대개 통과한다. 재시도 후에도 실패하면 그 시점에 중단한다
 *   - --skip-recovered 로 이전 실행에서 성공한 날짜를 건너뛴다 (멱등이지만 요청 낭비 방지)
 *
 * 주의: 복구는 건수를 바꾸지 않는다. (race_id, back_no) 가 이미 존재해 제자리
 *   갱신되기 때문이다 (시범 1일 실측: race_results 397,156 → 397,156).
 *   따라서 **건수 검증으로는 복구 진행 여부를 알 수 없다. 이름 대조가 주 지표다.**
 *
 * 사용법:
 *   npx tsx scripts/recovery-runner.ts --venue 창원 --year 2022 --dry-run
 *   npx tsx scripts/recovery-runner.ts --venue 창원 --year 2022 --skip-recovered
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

const OUT_DIR = path.join(process.cwd(), "docs", "recovery");

/**
 * 날짜별 시도 횟수와 재시도 전 대기(ms).
 * lepopark/spo1 은 일시적으로 `terminated`(응답 수신 중 연결 끊김)를 낸다 — 실측.
 * 데이터 문제가 아니므로 재시도하면 대개 통과한다. 대기를 늘려가며 세 번 시도한다.
 */
const ATTEMPT_WAITS_MS = [0, 5000, 15000];

/** 구장별 수집 스크립트. 둘 다 venue 필터와 멱등 upsert 가 걸려 있다 */
const SCRIPT_BY_VENUE: Record<string, string> = {
  창원: "scripts/fetch-changwon-results.ts",
  부산: "scripts/fetch-busan-results.ts",
};

interface Options {
  venue: string;
  year: number;
  delayMs: number;
  dryRun: boolean;
  baselinePath: string | null;
  limit: number | null;
}

function usage(): never {
  console.error(
    [
      "ERROR: --venue 와 --year 는 필수입니다.",
      "",
      "  기준선 JSON 의 손상 날짜 목록에 있는 날짜만 재수집합니다.",
      "  목록에 없는 날짜는 실행하지 않습니다.",
      "",
      "사용법:",
      "  npx tsx scripts/recovery-runner.ts --venue 창원 --year 2022 --dry-run",
      "  npx tsx scripts/recovery-runner.ts --venue 창원 --year 2022",
      "",
      "옵션:",
      "  --venue <창원|부산>   (필수)",
      "  --year <연도>         (필수)",
      "  --dry-run             대상 날짜만 출력하고 실행하지 않습니다",
      "  --delay <ms>          요청 사이 지연 (기본 6000)",
      "  --skip-recovered      이전 실행에서 이미 성공한 날짜는 건너뜁니다 (요청 낭비 방지)",
      "  --limit <N>           앞에서 N개만 실행 (시범용)",
      "  --baseline <경로>     기준선 JSON 경로 (기본: docs/recovery 의 가장 최근 파일)",
      "  --continue-on-error   실패해도 다음 날짜로 넘어갑니다 (기본은 중단)",
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(): Options & { continueOnError: boolean; skipRecovered: boolean } {
  const argv = process.argv.slice(2);
  let venue: string | null = null;
  let year: number | null = null;
  let delayMs = 6000;
  let dryRun = false;
  let baselinePath: string | null = null;
  let limit: number | null = null;
  let continueOnError = false;
  let skipRecovered = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--venue") {
      venue = argv[++i] ?? null;
    } else if (a === "--year") {
      const n = parseInt(argv[++i] ?? "", 10);
      if (!Number.isInteger(n)) usage();
      year = n;
    } else if (a === "--delay") {
      const n = parseInt(argv[++i] ?? "", 10);
      if (!Number.isInteger(n) || n < 0) usage();
      delayMs = n;
    } else if (a === "--limit") {
      const n = parseInt(argv[++i] ?? "", 10);
      if (!Number.isInteger(n) || n < 1) usage();
      limit = n;
    } else if (a === "--baseline") {
      baselinePath = argv[++i] ?? null;
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--continue-on-error") {
      continueOnError = true;
    } else if (a === "--skip-recovered") {
      skipRecovered = true;
    } else {
      console.error(`ERROR: 알 수 없는 인자: ${a}`);
      usage();
    }
  }

  if (!venue || year === null) usage();
  if (!SCRIPT_BY_VENUE[venue]) {
    console.error(`ERROR: --venue 는 ${Object.keys(SCRIPT_BY_VENUE).join(" 또는 ")} 여야 합니다 (받은 값: ${venue})`);
    process.exit(1);
  }
  return { venue, year, delayMs, dryRun, baselinePath, limit, continueOnError, skipRecovered };
}

/** docs/recovery 에서 가장 최근 기준선 JSON 을 찾는다 */
function findLatestBaseline(): string {
  if (!fs.existsSync(OUT_DIR)) {
    console.error(`ERROR: ${OUT_DIR} 가 없습니다. 먼저 npm run baseline:recovery 를 실행하세요.`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.startsWith("baseline-") && f.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    console.error("ERROR: 기준선 JSON 이 없습니다. 먼저 npm run baseline:recovery 를 실행하세요.");
    process.exit(1);
  }
  return path.join(OUT_DIR, files[files.length - 1]);
}

/**
 * 이전 실행 요약(recovery-<venue>-<year>-*.json)에서 이미 성공한 날짜를 모은다.
 * upsert 는 멀등이라 다시 돌려도 새 손상은 없지만, 원본에 쓸데없는 요정을 보내지 않는다.
 */
function loadRecoveredDates(venue: string, year: number): Set<string> {
  const done = new Set<string>();
  if (!fs.existsSync(OUT_DIR)) return done;
  const prefix = `recovery-${venue}-${year}-`;
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (!f.startsWith(prefix) || !f.endsWith(".json")) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf-8")) as {
        results?: Array<{ date: string; outcome: string }>;
      };
      for (const r of j.results ?? []) {
        if (r.outcome === "성공") done.add(r.date);
      }
    } catch {
      // 깨진 요약 튜일은 무시한다 — 멀등이라 안전하다
    }
  }
  return done;
}

type Outcome = "성공" | "원본미제공" | "실패";

interface DateResult {
  date: string;
  outcome: Outcome;
  races: number | null;
  resultRows: number | null;
  violations: number | null;
  exitCode: number | null;
  attempts: number;
  note: string;
}

/**
 * 수집 스크립트의 stdout 을 보고 결과를 분류한다.
 * fetch-changwon-results.ts / fetch-busan-results.ts 의 실제 출력 문구에 맞춘 것이다.
 */
function classify(stdout: string, exitCode: number | null): DateResult["outcome"] {
  if (exitCode !== 0) return "실패";
  if (/경주일 아님|확정 경주 없음|취소된 경주일/.test(stdout)) return "원본미제공";
  if (/race_results\s+\d+건/.test(stdout)) return "성공";
  // 0경주로 끝났으면 원본에 데이터가 없는 것으로 본다
  if (/완료:.*0경주/.test(stdout)) return "원본미제공";
  return "실패";
}

function parseCounts(stdout: string): { races: number | null; resultRows: number | null; violations: number | null } {
  const m = stdout.match(/races\s+(\d+)건\s*\/\s*race_results\s+(\d+)건\s*\/\s*violations\s+(\d+)건/);
  if (!m) return { races: null, resultRows: null, violations: null };
  return { races: Number(m[1]), resultRows: Number(m[2]), violations: Number(m[3]) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const opts = parseArgs();
  const { venue, year, delayMs, dryRun, limit, continueOnError, skipRecovered } = opts;

  const baselinePath = opts.baselinePath ?? findLatestBaseline();
  if (!fs.existsSync(baselinePath)) {
    console.error(`ERROR: 기준선 파일이 없습니다: ${baselinePath}`);
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8")) as {
    generatedAt: string;
    damagedDates: Array<{ venue: string; date: string; races: number }>;
  };

  // ------------------------------------------------- 대상 날짜 (기준선이 유일한 출처)
  const allowed = baseline.damagedDates
    .filter((d) => d.venue === venue && d.date.startsWith(`${year}-`))
    .map((d) => d.date)
    .sort();
  const allowedSet = new Set(allowed);

  const script = SCRIPT_BY_VENUE[venue];
  const alreadyDone = skipRecovered ? loadRecoveredDates(venue, year) : new Set<string>();
  const remaining = allowed.filter((d) => !alreadyDone.has(d));
  const targets = limit ? remaining.slice(0, limit) : remaining;

  console.log(`=== 복구 러너 — ${venue} ${year}년${dryRun ? " [DRY RUN]" : ""} ===`);
  console.log(`기준선: ${path.relative(process.cwd(), baselinePath)} (${baseline.generatedAt})`);
  console.log(`수집 스크립트: ${script}`);
  console.log(
    `대상 날짜: ${targets.length}일 (기준선 ${allowed.length}일${skipRecovered ? ` − 이미 복구 ${alreadyDone.size}일` : ""}${limit ? `, 앞 ${limit}일만` : ""})`,
  );
  console.log(
    `지연: ${delayMs}ms / 시도: 최대 ${ATTEMPT_WAITS_MS.length}회 (재시도 대기 ${ATTEMPT_WAITS_MS.slice(1).join("ms, ")}ms) / 실패 시: ${continueOnError ? "계속" : "중단"}
`,
  );

  if (targets.length === 0) {
    console.log("대상 날짜가 없습니다. 아무것도 하지 않고 종료합니다.");
    return;
  }

  if (dryRun) {
    for (const d of targets) console.log(`  ${d}`);
    console.log("\n[dry-run] 아무것도 실행하지 않았습니다.");
    return;
  }

  // ------------------------------------------------- 로그 파일
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(OUT_DIR, `recovery-${venue}-${year}-${stamp}.log`);
  const jsonPath = path.join(OUT_DIR, `recovery-${venue}-${year}-${stamp}.json`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const log = (line: string) => {
    fs.appendFileSync(logPath, line + "\n", "utf-8");
  };
  log(`# 복구 러너 로그 — ${venue} ${year}년`);
  log(`# 시작: ${new Date().toISOString()}`);
  log(`# 기준선: ${path.relative(process.cwd(), baselinePath)} (${baseline.generatedAt})`);
  log(`# 대상: ${targets.length}일 / 지연 ${delayMs}ms`);
  log("");

  const results: DateResult[] = [];
  let aborted = false;

  for (let i = 0; i < targets.length; i++) {
    const date = targets[i];

    // 범위 재확인 — 목록에 없는 날짜는 절대 실행하지 않는다
    if (!allowedSet.has(date)) {
      log(`!! ${date} 기준선 목록에 없음 — 실행하지 않고 중단`);
      console.error(`\nERROR: ${date} 가 기준선 목록에 없습니다. 중단합니다.`);
      aborted = true;
      break;
    }

    const ymd = date.replace(/-/g, "");
    const prefix = `[${i + 1}/${targets.length}] ${date}`;
    process.stdout.write(`${prefix} ... `);

    // 재시도 루프 — 일시적 네트워크 오류(terminated 등)는 데이터 문제가 아니다.
    // 원본미제공은 재시도해도 같으므로 즉시 확정한다.
    let stdout = "";
    let outcome: Outcome = "실패";
    let counts = parseCounts("");
    let exitCode: number | null = null;
    let attempts = 0;

    for (let t = 0; t < ATTEMPT_WAITS_MS.length; t++) {
      if (t > 0) {
        const wait = ATTEMPT_WAITS_MS[t];
        process.stdout.write(`재시도 ${t}/${ATTEMPT_WAITS_MS.length - 1} (${wait}ms) ... `);
        log(`${date}	재시도	${t}/${ATTEMPT_WAITS_MS.length - 1}	wait=${wait}ms`);
        await sleep(wait);
      }
      const proc = spawnSync("npx", ["tsx", script, "--date", ymd], {
        encoding: "utf-8",
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
      });
      attempts = t + 1;
      stdout = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
      exitCode = proc.status;
      outcome = classify(stdout, proc.status);
      counts = parseCounts(stdout);
      if (outcome !== "실패") break;
    }

    const row: DateResult = {
      date,
      outcome,
      ...counts,
      exitCode,
      attempts,
      note: (stdout.trim().split("\n").pop() ?? "").trim(),
    };
    results.push(row);

    console.log(
      `${outcome}${counts.resultRows !== null ? ` (race_results ${counts.resultRows}행)` : ""}${attempts > 1 ? ` [시도 ${attempts}회]` : ""}`,
    );
    log(
      `${date}\t${outcome}\texit=${exitCode}	attempts=${attempts}\traces=${counts.races ?? "-"}\tresults=${counts.resultRows ?? "-"}\tviolations=${counts.violations ?? "-"}`,
    );
    if (outcome === "실패") {
      log("--- stdout/stderr ---");
      for (const l of stdout.trim().split("\n")) log(`    ${l}`);
      log("---------------------");
      if (!continueOnError) {
        console.error(`\nERROR: ${date} 실패 — 중단합니다. 로그: ${path.relative(process.cwd(), logPath)}`);
        aborted = true;
        break;
      }
    }

    if (i < targets.length - 1) await sleep(delayMs);
  }

  const summary = {
    venue,
    year,
    baseline: path.relative(process.cwd(), baselinePath),
    baselineGeneratedAt: baseline.generatedAt,
    startedAt: stamp,
    finishedAt: new Date().toISOString(),
    aborted,
    targetCount: targets.length,
    processed: results.length,
    retried: results.filter((r) => r.attempts > 1).length,
    skippedAlreadyRecovered: skipRecovered ? [...alreadyDone].sort() : [],
    byOutcome: {
      성공: results.filter((r) => r.outcome === "성공").length,
      원본미제공: results.filter((r) => r.outcome === "원본미제공").length,
      실패: results.filter((r) => r.outcome === "실패").length,
    },
    unrecoverableDates: results.filter((r) => r.outcome === "원본미제공").map((r) => r.date),
    failedDates: results.filter((r) => r.outcome === "실패").map((r) => r.date),
    results,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf-8");

  log("");
  log(`# 종료: ${summary.finishedAt}`);
  log(`# 성공 ${summary.byOutcome.성공} / 원본미제공 ${summary.byOutcome.원본미제공} / 실패 ${summary.byOutcome.실패}`);
  if (aborted) log("# 중단됨");

  console.log(`\n성공 ${summary.byOutcome.성공} / 원본미제공 ${summary.byOutcome.원본미제공} / 실패 ${summary.byOutcome.실패}`);
  if (summary.unrecoverableDates.length > 0) {
    console.log(`원본 미제공(복구 불가): ${summary.unrecoverableDates.join(", ")}`);
  }
  console.log(`로그: ${path.relative(process.cwd(), logPath)}`);
  console.log(`요약: ${path.relative(process.cwd(), jsonPath)}`);

  if (aborted) {
    console.error("\n중단 상태로 끝났습니다. 보고 후 지시를 받으세요.");
    process.exitCode = 1;
    return;
  }
  console.log("\n=== 묶음 완료 — 이제 이름 대조로 검증하세요 (건수로는 알 수 없습니다) ===");
}

void main().catch((e) => {
  console.error("치명적 에러:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
