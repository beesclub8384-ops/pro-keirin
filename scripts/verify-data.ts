// ============================================================
// 수집 데이터 검증 스크립트 (4단계)
// 사용법: npm run verify-data
// ============================================================

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(__dirname, "..", "src", "data");
const OUT_DIR = path.join(DATA_DIR, "verification");

interface Warning {
  phase: string;
  file: string;
  message: string;
  severity: "ERROR" | "WARN" | "INFO";
}

const warnings: Warning[] = [];

function warn(phase: string, file: string, message: string, severity: "ERROR" | "WARN" | "INFO" = "WARN") {
  warnings.push({ phase, file, message, severity });
}

function loadJSON(filename: string): any {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) { warn("load", filename, "파일 없음", "ERROR"); return null; }
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ============================================================
// Phase 1: 완전성 검증
// ============================================================
function phase1(): string[] {
  console.log("\n========== Phase 1: 완전성 검증 ==========");
  const lines: string[] = ["# Phase 1: 완전성 검증", ""];

  // --- 1a. 연도별 대형 파일 ---
  const yearlyFiles: { name: string; yearKey: string; countFn: (item: any) => number }[] = [
    { name: "entry-data.json", yearKey: "date", countFn: () => 1 },
    { name: "race-data.json", yearKey: "date", countFn: () => 1 },
    { name: "race-detail-data.json", yearKey: "date", countFn: () => 1 },
  ];

  for (const { name, yearKey } of yearlyFiles) {
    console.log(`  ${name}...`);
    const data = loadJSON(name);
    if (!data) continue;

    const yearCounts: Record<string, number> = {};
    for (const item of data) {
      const y = (item[yearKey] || "").substring(0, 4);
      yearCounts[y] = (yearCounts[y] || 0) + 1;
    }

    const years = Object.keys(yearCounts).sort();
    const counts = Object.values(yearCounts);
    const med = median(counts);

    lines.push(`## ${name} (${data.length}건)`);
    lines.push("| 연도 | 건수 | 상태 |");
    lines.push("|------|------|------|");

    for (const y of years) {
      const c = yearCounts[y];
      let status = "OK";
      if (c === 0) { status = "EMPTY"; warn("Phase1", name, `${y}년 0건`, "ERROR"); }
      else if (c < med * 0.3) { status = "LOW"; warn("Phase1", name, `${y}년 ${c}건 (중앙값 ${med}의 ${Math.round(c/med*100)}%)`, "WARN"); }
      lines.push(`| ${y} | ${c.toLocaleString()} | ${status} |`);
    }
    lines.push("");
  }

  // --- 1b. 연도 구조 파일 (배열 of {year, ...}) ---
  const yearArrayFiles = [
    { name: "ranking-data.json", countKey: "rankings" },
    { name: "sanction-data.json", countKey: "sanctions" },
    { name: "prize-ranking-data.json", countKey: "records" },
    { name: "win-top30-data.json", countKey: "records" },
    { name: "dividend-stats-data.json", countKey: null },
    { name: "sales-stats-data.json", countKey: null },
    { name: "high-dividend-data.json", countKey: "tables" },
  ];

  for (const { name, countKey } of yearArrayFiles) {
    console.log(`  ${name}...`);
    const data = loadJSON(name);
    if (!data) continue;

    lines.push(`## ${name} (${data.length}개 연도)`);
    lines.push("| 연도 | 건수 | 상태 |");
    lines.push("|------|------|------|");

    const counts: number[] = [];
    for (const item of data) {
      let c = 0;
      if (countKey && Array.isArray(item[countKey])) {
        c = item[countKey].length;
      } else if (countKey === null) {
        // sales-stats: byRound + byDay + byRace, dividend-stats: highDividends + distribution
        const keys = Object.keys(item).filter(k => k !== "year");
        c = keys.reduce((sum, k) => sum + (Array.isArray(item[k]) ? item[k].length : 0), 0);
      }
      counts.push(c);
    }

    const med = median(counts);
    for (let i = 0; i < data.length; i++) {
      const y = data[i].year;
      const c = counts[i];
      let status = "OK";
      if (c === 0) { status = "EMPTY"; warn("Phase1", name, `${y}년 0건`, "WARN"); }
      else if (med > 0 && c < med * 0.3) { status = "LOW"; warn("Phase1", name, `${y}년 ${c}건 (중앙값 ${med}의 ${Math.round(c/med*100)}%)`, "WARN"); }
      lines.push(`| ${y} | ${c} | ${status} |`);
    }
    lines.push("");
  }

  // --- 1c. 정적/게시판 파일 ---
  const staticFiles = [
    "fall-injury-data.json", "special-promotion-data.json", "training-change-data.json",
    "win-streaks-data.json", "win-accrued-data.json", "most-win-streaks-data.json",
    "prize-info-data.json", "no-hit-races-data.json", "racer-profile-data.json",
  ];

  lines.push("## 정적/게시판 파일");
  lines.push("| 파일 | 건수 | 상태 |");
  lines.push("|------|------|------|");

  for (const name of staticFiles) {
    console.log(`  ${name}...`);
    const data = loadJSON(name);
    if (!data) continue;
    const c = Array.isArray(data) ? data.length : Object.keys(data).length;
    const status = c === 0 ? "EMPTY" : "OK";
    if (c === 0) warn("Phase1", name, "0건", "ERROR");
    lines.push(`| ${name} | ${c} | ${status} |`);
  }
  lines.push("");

  // --- 1d. decision-card (연도별 체크포인트) ---
  console.log("  decision-card (yearly checkpoints)...");
  const dcDir = path.join(DATA_DIR, "yearly-decision-card");
  if (fs.existsSync(dcDir)) {
    lines.push("## decision-card-data (연도별 체크포인트)");
    lines.push("| 연도 | 페이지수 | 경주수 | 상태 |");
    lines.push("|------|---------|--------|------|");

    const dcYears = fs.readdirSync(dcDir).filter(f => f.endsWith(".json") && !f.includes("progress")).sort();
    const pageCounts: number[] = [];
    const raceCounts: number[] = [];

    for (const f of dcYears) {
      const year = f.replace(".json", "");
      const data = JSON.parse(fs.readFileSync(path.join(dcDir, f), "utf-8"));
      const pages = Array.isArray(data) ? data.length : (data.pages || []).length;
      let races = 0;
      if (Array.isArray(data)) {
        for (const page of data) {
          races += (page.races || []).length;
        }
      }
      pageCounts.push(pages);
      raceCounts.push(races);

      let status = "OK";
      if (pages === 0) { status = "EMPTY"; warn("Phase1", "decision-card", `${year}년 0페이지`, "ERROR"); }
      lines.push(`| ${year} | ${pages} | ${races} | ${status} |`);
    }
    lines.push("");
  }

  return lines;
}

// ============================================================
// Phase 2: 교차 검증
// ============================================================
function phase2(): string[] {
  console.log("\n========== Phase 2: 교차 검증 ==========");
  const lines: string[] = ["# Phase 2: 교차 검증", ""];

  // --- 2a. entry-data ↔ race-detail-data ---
  console.log("  entry-data ↔ race-detail-data...");
  const entryData = loadJSON("entry-data.json");
  const detailData = loadJSON("race-detail-data.json");

  if (entryData && detailData) {
    // Build entry lookup: (date, raceNo) → Set of racer names
    const entryMap = new Map<string, Set<string>>();
    for (const e of entryData) {
      const key = `${e.date}_${e.raceNo}`;
      if (!entryMap.has(key)) entryMap.set(key, new Set());
      entryMap.get(key)!.add(e.racerName);
    }

    let detailMatchCount = 0;
    let detailMismatchCount = 0;
    let detailNotInEntry = 0;
    const mismatchSamples: string[] = [];

    for (const race of detailData) {
      const key = `${race.date}_${race.raceNo}`;
      const entryNames = entryMap.get(key);
      if (!entryNames) {
        detailNotInEntry++;
        continue;
      }

      for (const r of race.results) {
        if (r.rank === 0 && r.name === "") continue; // skip empty
        if (entryNames.has(r.name)) {
          detailMatchCount++;
        } else {
          detailMismatchCount++;
          if (mismatchSamples.length < 10) {
            mismatchSamples.push(`${race.date} ${race.raceNo}R: detail="${r.name}" not in entry`);
          }
        }
      }
    }

    lines.push("## entry-data ↔ race-detail-data 선수명 매칭");
    lines.push(`- 매칭: ${detailMatchCount.toLocaleString()}건`);
    lines.push(`- 불일치: ${detailMismatchCount.toLocaleString()}건`);
    lines.push(`- detail에만 있는 경주: ${detailNotInEntry}건`);
    lines.push(`- 매칭률: ${(detailMatchCount / (detailMatchCount + detailMismatchCount) * 100).toFixed(2)}%`);
    if (mismatchSamples.length > 0) {
      lines.push("- 불일치 샘플:");
      mismatchSamples.forEach(s => lines.push(`  - ${s}`));
    }
    lines.push("");

    if (detailMismatchCount > detailMatchCount * 0.05) {
      warn("Phase2", "entry↔detail", `불일치율 ${(detailMismatchCount/(detailMatchCount+detailMismatchCount)*100).toFixed(2)}% (5% 초과)`, "WARN");
    }

    // --- 2b. entry-data ↔ race-data 경주수 매칭 ---
    console.log("  entry-data ↔ race-data...");
    const raceData = loadJSON("race-data.json");
    if (raceData) {
      const entryRaces = new Set<string>();
      for (const e of entryData) {
        entryRaces.add(`${e.date}_${e.raceNo}`);
      }
      const raceDataRaces = new Set<string>();
      for (const r of raceData) {
        raceDataRaces.add(`${r.date}_${r.raceNo}`);
      }

      let inBoth = 0, onlyEntry = 0, onlyRace = 0;
      entryRaces.forEach(k => { if (raceDataRaces.has(k)) inBoth++; else onlyEntry++; });
      raceDataRaces.forEach(k => { if (!entryRaces.has(k)) onlyRace++; });

      lines.push("## entry-data ↔ race-data 경주 매칭");
      lines.push(`- 공통: ${inBoth.toLocaleString()}건`);
      lines.push(`- entry에만: ${onlyEntry}건`);
      lines.push(`- race-data에만: ${onlyRace}건`);
      lines.push(`- 매칭률: ${(inBoth / raceDataRaces.size * 100).toFixed(2)}%`);
      lines.push("");
    }
  }

  // --- 2c. ranking-data ↔ racer-profile-data ---
  console.log("  ranking-data ↔ racer-profile-data...");
  const rankingData = loadJSON("ranking-data.json");
  const profileData = loadJSON("racer-profile-data.json");

  if (rankingData && profileData) {
    // Build profile lookup: (year, name) → profile
    const profileMap = new Map<string, any>();
    for (const p of profileData) {
      const key = `${p.year}_${p.name}`;
      profileMap.set(key, p);
    }

    let matched = 0, notFound = 0;
    let gradeMatch = 0, gradeMismatch = 0;
    const gradeMismatchSamples: string[] = [];

    for (const yearData of rankingData) {
      const year = yearData.year;
      for (const r of yearData.rankings) {
        const key = `${year}_${r.name}`;
        const profile = profileMap.get(key);
        if (profile) {
          matched++;
          // Compare win rate (ranking has winRate, profile has winRate)
          if (r.winRate !== undefined && profile.winRate !== undefined) {
            const diff = Math.abs(r.winRate - profile.winRate);
            if (diff < 1) gradeMatch++;
            else {
              gradeMismatch++;
              if (gradeMismatchSamples.length < 5) {
                gradeMismatchSamples.push(`${year} ${r.name}: ranking=${r.winRate}% vs profile=${profile.winRate}%`);
              }
            }
          }
        } else {
          notFound++;
        }
      }
    }

    lines.push("## ranking-data ↔ racer-profile-data 매칭");
    lines.push(`- 매칭: ${matched.toLocaleString()}건`);
    lines.push(`- 미매칭: ${notFound}건`);
    if (matched > 0) {
      lines.push(`- 승률 일치(±1%): ${gradeMatch}건`);
      lines.push(`- 승률 불일치: ${gradeMismatch}건`);
      if (gradeMismatchSamples.length > 0) {
        lines.push("- 불일치 샘플:");
        gradeMismatchSamples.forEach(s => lines.push(`  - ${s}`));
      }
    }
    lines.push("");
  }

  return lines;
}

// ============================================================
// Phase 3: 범위 검증
// ============================================================
function phase3(): string[] {
  console.log("\n========== Phase 3: 범위 검증 ==========");
  const lines: string[] = ["# Phase 3: 범위 검증", ""];

  // --- 3a. race-detail-data: 착순, 주행시간, 전법 ---
  console.log("  race-detail-data 범위...");
  const detailData = loadJSON("race-detail-data.json");
  if (detailData) {
    let rankOutOfRange = 0;
    let invalidTactic = 0;
    let invalidTime = 0;
    let totalResults = 0;
    const validTactics = new Set(["선행", "마크", "추입", "젖히기", "-", ""]);
    const rankDistribution: Record<number, number> = {};
    const tacticDistribution: Record<string, number> = {};
    const rankSamples: string[] = [];
    const timeSamples: string[] = [];

    for (const race of detailData) {
      for (const r of race.results) {
        totalResults++;
        // Rank
        rankDistribution[r.rank] = (rankDistribution[r.rank] || 0) + 1;
        if (r.rank < 0 || r.rank > 7) {
          rankOutOfRange++;
          if (rankSamples.length < 5) rankSamples.push(`${race.date} ${race.raceNo}R: ${r.name} rank=${r.rank}`);
        }
        // Tactic
        const tactic = (r.tactic || "").trim();
        tacticDistribution[tactic] = (tacticDistribution[tactic] || 0) + 1;
        if (tactic && !validTactics.has(tactic)) invalidTactic++;
        // RaceTime: expect format like "2:31:6220" or "::" for DNF
        if (r.raceTime && r.raceTime !== "::" && r.raceTime !== "") {
          const parts = r.raceTime.split(":");
          if (parts.length < 2) {
            invalidTime++;
            if (timeSamples.length < 5) timeSamples.push(`${race.date} ${race.raceNo}R: ${r.name} time="${r.raceTime}"`);
          }
        }
      }
    }

    lines.push("## race-detail-data 범위 검증");
    lines.push(`총 선수 결과: ${totalResults.toLocaleString()}건`);
    lines.push("");
    lines.push("### 착순 분포");
    lines.push("| 착순 | 건수 |");
    lines.push("|------|------|");
    Object.keys(rankDistribution).sort((a, b) => Number(a) - Number(b)).forEach(k => {
      lines.push(`| ${k} | ${rankDistribution[Number(k)].toLocaleString()} |`);
    });
    lines.push(`\n착순 범위 이탈 (0~7 외): ${rankOutOfRange}건`);
    if (rankSamples.length > 0) rankSamples.forEach(s => lines.push(`  - ${s}`));
    lines.push("");

    lines.push("### 전법 분포");
    lines.push("| 전법 | 건수 |");
    lines.push("|------|------|");
    Object.entries(tacticDistribution).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      lines.push(`| ${k || "(빈값)"} | ${v.toLocaleString()} |`);
    });
    lines.push(`\n비정상 전법: ${invalidTactic}건`);
    lines.push("");

    lines.push(`### 주행시간 형식 이상: ${invalidTime}건`);
    if (timeSamples.length > 0) timeSamples.forEach(s => lines.push(`  - ${s}`));
    lines.push("");

    if (rankOutOfRange > 0) warn("Phase3", "race-detail", `착순 범위 이탈 ${rankOutOfRange}건`, "WARN");
    if (invalidTime > totalResults * 0.01) warn("Phase3", "race-detail", `주행시간 형식 이상 ${invalidTime}건`, "WARN");
  }

  // --- 3b. entry-data: 나이, 승률, 기어비 ---
  console.log("  entry-data 범위...");
  const entryData = loadJSON("entry-data.json");
  if (entryData) {
    let ageOutOfRange = 0;
    let winRateOutOfRange = 0;
    let gearOutOfRange = 0;
    const ageSamples: string[] = [];
    const winRateSamples: string[] = [];
    const gearSamples: string[] = [];

    for (const e of entryData) {
      // Age: expect 18~65
      if (e.racerAge > 0 && (e.racerAge < 18 || e.racerAge > 65)) {
        ageOutOfRange++;
        if (ageSamples.length < 5) ageSamples.push(`${e.date} ${e.racerName}: age=${e.racerAge}`);
      }
      // WinRate: 0~100
      if (e.winRate < 0 || e.winRate > 100) {
        winRateOutOfRange++;
        if (winRateSamples.length < 5) winRateSamples.push(`${e.date} ${e.racerName}: winRate=${e.winRate}`);
      }
      // GearRate: 2.0~5.0 (when > 0)
      if (e.gearRate > 0 && (e.gearRate < 2.0 || e.gearRate > 5.0)) {
        gearOutOfRange++;
        if (gearSamples.length < 5) gearSamples.push(`${e.date} ${e.racerName}: gearRate=${e.gearRate}`);
      }
    }

    lines.push("## entry-data 범위 검증");
    lines.push(`총: ${entryData.length.toLocaleString()}건`);
    lines.push("");
    lines.push(`### 나이 범위 이탈 (18~65 외): ${ageOutOfRange}건`);
    if (ageSamples.length > 0) ageSamples.forEach(s => lines.push(`  - ${s}`));
    lines.push(`### 승률 범위 이탈 (0~100 외): ${winRateOutOfRange}건`);
    if (winRateSamples.length > 0) winRateSamples.forEach(s => lines.push(`  - ${s}`));
    lines.push(`### 기어비 범위 이탈 (2.0~5.0 외): ${gearOutOfRange}건`);
    if (gearSamples.length > 0) gearSamples.forEach(s => lines.push(`  - ${s}`));
    lines.push("");

    if (ageOutOfRange > 0) warn("Phase3", "entry-data", `나이 범위 이탈 ${ageOutOfRange}건`, "WARN");
    if (winRateOutOfRange > 0) warn("Phase3", "entry-data", `승률 범위 이탈 ${winRateOutOfRange}건`, "ERROR");
    if (gearOutOfRange > 0) warn("Phase3", "entry-data", `기어비 범위 이탈 ${gearOutOfRange}건`, "WARN");
  }

  // --- 3c. race-data: 배당률 ---
  console.log("  race-data 배당률 범위...");
  const raceData = loadJSON("race-data.json");
  if (raceData) {
    let oddsBelowOne = 0;
    let negativeOdds = 0;
    const oddsDistribution: Record<string, { min: number; max: number; zero: number; total: number }> = {};
    const oddsSamples: string[] = [];

    const poolNames = ["단승", "연승1착", "연승2착", "쌍승", "복승", "삼복승", "삼쌍승", "쌍복승"];

    for (const r of raceData) {
      if (!r.odds) continue;
      for (const pool of poolNames) {
        const val = r.odds[pool];
        if (!oddsDistribution[pool]) oddsDistribution[pool] = { min: Infinity, max: -Infinity, zero: 0, total: 0 };
        const d = oddsDistribution[pool];
        d.total++;
        if (val === 0) { d.zero++; continue; }
        if (val < d.min) d.min = val;
        if (val > d.max) d.max = val;
        if (val < 0) { negativeOdds++; }
        if (val > 0 && val < 1.0 && (pool === "단승" || pool === "쌍승")) {
          oddsBelowOne++;
          if (oddsSamples.length < 5) oddsSamples.push(`${r.date} ${r.raceNo}R: ${pool}=${val}`);
        }
      }
    }

    lines.push("## race-data 배당률 범위 검증");
    lines.push(`총: ${raceData.length.toLocaleString()}건`);
    lines.push("");
    lines.push("### 승식별 배당률 범위");
    lines.push("| 승식 | 최소 | 최대 | 0값 | 총 |");
    lines.push("|------|------|------|-----|-----|");
    for (const pool of poolNames) {
      const d = oddsDistribution[pool];
      if (!d) continue;
      const minStr = d.min === Infinity ? "-" : String(d.min);
      const maxStr = d.max === -Infinity ? "-" : String(d.max);
      lines.push(`| ${pool} | ${minStr} | ${maxStr} | ${d.zero.toLocaleString()} | ${d.total.toLocaleString()} |`);
    }
    lines.push(`\n단승/쌍승 1.0 미만 (비정상): ${oddsBelowOne}건`);
    if (oddsSamples.length > 0) oddsSamples.forEach(s => lines.push(`  - ${s}`));
    lines.push(`음수 배당률: ${negativeOdds}건`);
    lines.push("");

    if (negativeOdds > 0) warn("Phase3", "race-data", `음수 배당률 ${negativeOdds}건`, "ERROR");
  }

  // --- 3d. racer-profile: 승률 범위 ---
  console.log("  racer-profile-data 범위...");
  const profileData = loadJSON("racer-profile-data.json");
  if (profileData) {
    let wrOutOfRange = 0;
    for (const p of profileData) {
      if (p.winRate < 0 || p.winRate > 100) wrOutOfRange++;
      if (p.top2Rate < 0 || p.top2Rate > 100) wrOutOfRange++;
      if (p.top3Rate < 0 || p.top3Rate > 100) wrOutOfRange++;
    }
    lines.push(`## racer-profile-data 승률 범위 이탈: ${wrOutOfRange}건`);
    lines.push("");
    if (wrOutOfRange > 0) warn("Phase3", "racer-profile", `승률 범위 이탈 ${wrOutOfRange}건`, "ERROR");
  }

  return lines;
}

// ============================================================
// Phase 4: 리포트 저장
// ============================================================
function phase4(phase1Lines: string[], phase2Lines: string[], phase3Lines: string[]): void {
  console.log("\n========== Phase 4: 리포트 저장 ==========");

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Individual phase reports
  fs.writeFileSync(path.join(OUT_DIR, "phase1-completeness.md"), phase1Lines.join("\n"), "utf-8");
  fs.writeFileSync(path.join(OUT_DIR, "phase2-cross-validation.md"), phase2Lines.join("\n"), "utf-8");
  fs.writeFileSync(path.join(OUT_DIR, "phase3-range-validation.md"), phase3Lines.join("\n"), "utf-8");

  // Summary report
  const summary: string[] = [
    "# 데이터 검증 결과 요약",
    `검증 일시: ${new Date().toISOString()}`,
    "",
    "## 경고/에러 요약",
    "",
    `| 심각도 | 건수 |`,
    `|--------|------|`,
    `| ERROR | ${warnings.filter(w => w.severity === "ERROR").length} |`,
    `| WARN | ${warnings.filter(w => w.severity === "WARN").length} |`,
    `| INFO | ${warnings.filter(w => w.severity === "INFO").length} |`,
    "",
    "## 상세",
    "",
    "| # | 심각도 | 단계 | 파일 | 내용 |",
    "|---|--------|------|------|------|",
  ];

  warnings.sort((a, b) => {
    const sevOrder = { ERROR: 0, WARN: 1, INFO: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });

  warnings.forEach((w, i) => {
    summary.push(`| ${i + 1} | ${w.severity} | ${w.phase} | ${w.file} | ${w.message} |`);
  });

  summary.push("");
  summary.push("## 판정");
  const errors = warnings.filter(w => w.severity === "ERROR").length;
  const warns = warnings.filter(w => w.severity === "WARN").length;
  if (errors === 0 && warns === 0) {
    summary.push("**PASS** — 에러/경고 없음");
  } else if (errors === 0) {
    summary.push(`**PASS (경고 ${warns}건)** — 에러 없음, 경고 항목 확인 권장`);
  } else {
    summary.push(`**REVIEW NEEDED** — 에러 ${errors}건, 경고 ${warns}건`);
  }

  fs.writeFileSync(path.join(OUT_DIR, "summary.md"), summary.join("\n"), "utf-8");

  console.log(`\n리포트 저장 완료:`);
  console.log(`  ${OUT_DIR}/summary.md`);
  console.log(`  ${OUT_DIR}/phase1-completeness.md`);
  console.log(`  ${OUT_DIR}/phase2-cross-validation.md`);
  console.log(`  ${OUT_DIR}/phase3-range-validation.md`);
}

// ============================================================
// Main
// ============================================================
function main() {
  console.log("===== 데이터 검증 시작 =====");

  const p1 = phase1();
  const p2 = phase2();
  const p3 = phase3();
  phase4(p1, p2, p3);

  // Console summary
  const errors = warnings.filter(w => w.severity === "ERROR").length;
  const warns = warnings.filter(w => w.severity === "WARN").length;
  console.log(`\n===== 검증 완료: ERROR ${errors}건, WARN ${warns}건 =====`);

  if (errors > 0) {
    console.log("\nERROR 항목:");
    warnings.filter(w => w.severity === "ERROR").forEach(w => {
      console.log(`  [${w.phase}] ${w.file}: ${w.message}`);
    });
  }
  if (warns > 0) {
    console.log("\nWARN 항목:");
    warnings.filter(w => w.severity === "WARN").forEach(w => {
      console.log(`  [${w.phase}] ${w.file}: ${w.message}`);
    });
  }
}

main();
