// 2024년 결승 제외 데이터 추출 + 통계 계산
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!.trim()
);

async function fetchAll<T>(buildQuery: () => any): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

const bipaup = new Set([
  "강민성","강병석","강진원","고재준","고종인","공태민","공태욱","곽현명","구동훈","구본광",
  "권우주","권혁진","김관희","김광근","김근영","김기동","김다빈","김동관","김동훈","김두용",
  "김로운","김명래","김명섭","김명중","김민균","김민배","김민수","김민욱","김민준","김민호",
  "김배영","김범수","김범준","김범중","김시후","김영규","김영석","김영섭","김영수","김옥철",
  "김용규","김용남","김우겸","김우영","김원진","김원호","김이남","김제영","김종성","김종현",
  "김주한","김주호","김준빈","김준철","김철민","김태범","김한울","김현","김현경","김형모",
  "김형완","김홍기","김홍일","김환윤","김희준","남용찬","노태경","노형균","류근철","류재민",
  "류재열","명경민","문인재","문희덕","민상호","민선기","박경호","박동수","박민철","박석기",
  "박성순","박성현","박승민","박용범","박종현","박종태","박준성","박진철","박철성","방극산",
  "배민구","배석현","배준호","석혜윤","성용환","손경수","손성진","손재우","손제용","송경방",
  "송대호","송승현","송정욱","송종훈","신동현","신은섭","안성민","안창진","양승원","양진우",
  "엄재천","엄정일","엄희태","여민호","오기호","왕지현","우성식","원신재","원준오","유연종",
  "유주현","유태복","윤진규","윤현구","윤현준","이규봉","이근우","이기주","이기한","이기호",
  "이록희","이상현","이서혁","이성록","이성민","이수원","이용희","이우정","이유진","이인우",
  "이일수","이재봉","이재옥","이정민","이정석","이정운","이지훈","이진웅","이진원","이차현",
  "이찬우","이태운","이홍주","인치환","임경수","임대성","임유섭","임재연","임채빈","장인석",
  "전경호","전영규","전원규","정동호","정상민","정윤재","정재원","정정교","정종진","정지민",
  "정태양","정하늘","정하전","정해권","정해민","조성윤","조영소","조영환","조재호","조주현",
  "조창인","주성민","주효진","최근영","최대용","최동현","최민호","최병길","최순영","최정환",
  "한탁희","함동주","함명주","허동혁","현지운","황승호","황인혁","황준하",
]);

function isExcluded(rt: string): boolean {
  return rt.includes("결승") && !rt.includes("준결");
}

function classifyGrade(rt: string): string | null {
  if (!rt) return null;
  if (rt.includes("특선")) return "특선";
  if (rt.includes("우수")) return "우수";
  if (rt.includes("선발")) return "선발";
  return null;
}

function binomProb(n: number, k: number, p: number): number {
  let logC = 0;
  for (let i = 0; i < k; i++) logC += Math.log(n - i) - Math.log(i + 1);
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

async function main() {
  // 1. pages
  const pages = await fetchAll<{ id: number; round: number; day: number; date: string }>(
    () => sb.from("decision_card_pages").select("id, round, day, date").eq("year", 2024)
  );
  const pageMap = new Map(pages.map(p => [p.id, p]));
  const pageIds = pages.map(p => p.id);

  // 2. races
  const allRaces: { id: number; page_id: number; race_no: number; race_type: string }[] = [];
  for (let i = 0; i < pageIds.length; i += 200) {
    const chunk = pageIds.slice(i, i + 200);
    const rows = await fetchAll<typeof allRaces[0]>(
      () => sb.from("decision_card_races").select("id, page_id, race_no, race_type").in("page_id", chunk)
    );
    allRaces.push(...rows);
  }

  const excluded = allRaces.filter(r => isExcluded(r.race_type || ""));
  const races = allRaces.filter(r => !isExcluded(r.race_type || ""));
  console.log(`전체: ${allRaces.length}건, 결승 제외: ${excluded.length}건, 분석 대상: ${races.length}건`);
  console.log(`제외된 race_type:`, [...new Set(excluded.map(r => r.race_type))].join(", "));

  // 3. entries
  const raceIds = races.map(r => r.id);
  const entries: { dc_race_id: number; back_no: number; racer_id: string }[] = [];
  for (let i = 0; i < raceIds.length; i += 200) {
    const chunk = raceIds.slice(i, i + 200);
    const rows = await fetchAll<typeof entries[0]>(
      () => sb.from("decision_card_entries").select("dc_race_id, back_no, racer_id")
        .in("dc_race_id", chunk).not("racer_id", "is", null)
    );
    entries.push(...rows);
  }
  console.log(`entries: ${entries.length}건`);

  // 4. racer_id → name
  const racerIdSet = new Set(entries.map(e => e.racer_id).filter(Boolean));
  const racerIdArr = [...racerIdSet];
  const nameMap = new Map<string, string>();
  for (let i = 0; i < racerIdArr.length; i += 200) {
    const chunk = racerIdArr.slice(i, i + 200);
    const rows = await fetchAll<{ racer_id: string; name: string }>(
      () => sb.from("racer_ids").select("racer_id, name").eq("year", 2024).in("racer_id", chunk)
    );
    for (const r of rows) nameMap.set(r.racer_id, r.name);
  }
  const missing = racerIdArr.filter(id => !nameMap.has(id));
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200);
    const rows = await fetchAll<{ racer_id: string; name: string }>(
      () => sb.from("racer_ids").select("racer_id, name").in("racer_id", chunk)
        .order("year", { ascending: false })
    );
    for (const r of rows) if (!nameMap.has(r.racer_id)) nameMap.set(r.racer_id, r.name);
  }

  const getName = (rid: string) => (nameMap.get(rid) || "").replace(/\s+/g, "");

  // 5. 경주별 집계
  const raceMapById = new Map(races.map(r => [r.id, r]));
  type RaceData = { round: number; day: number; race_no: number; race_type: string; names: string[] };
  const raceEntries = new Map<number, string[]>();
  for (const e of entries) {
    if (!raceEntries.has(e.dc_race_id)) raceEntries.set(e.dc_race_id, []);
    // store as "back_no:name"
  }

  // 출주표 데이터
  const entryMap = new Map<number, { back_no: number; name: string }[]>();
  for (const e of entries) {
    if (!entryMap.has(e.dc_race_id)) entryMap.set(e.dc_race_id, []);
    entryMap.get(e.dc_race_id)!.push({ back_no: e.back_no, name: getName(e.racer_id) });
  }

  const sheetData: RaceData[] = races
    .map(r => {
      const pg = pageMap.get(r.page_id)!;
      const ents = (entryMap.get(r.id) || []).sort((a, b) => a.back_no - b.back_no);
      const names: string[] = [];
      for (let bn = 1; bn <= 7; bn++) {
        const found = ents.find(e => e.back_no === bn);
        names.push(found ? found.name : "");
      }
      return { round: pg.round, day: pg.day, race_no: r.race_no, race_type: r.race_type || "", names };
    })
    .sort((a, b) => a.round - b.round || a.day - b.day || a.race_no - b.race_no);

  // 6. 통계 계산
  const gradeStats: Record<string, {
    raceCount: number; totalSlots: number; bpSlots: number;
    dist: number[];
  }> = {
    "선발": { raceCount: 0, totalSlots: 0, bpSlots: 0, dist: new Array(8).fill(0) },
    "우수": { raceCount: 0, totalSlots: 0, bpSlots: 0, dist: new Array(8).fill(0) },
    "특선": { raceCount: 0, totalSlots: 0, bpSlots: 0, dist: new Array(8).fill(0) },
  };

  for (const r of sheetData) {
    const cls = classifyGrade(r.race_type);
    if (!cls || !gradeStats[cls]) continue;
    const g = gradeStats[cls];
    g.raceCount++;
    const validNames = r.names.filter(n => n);
    g.totalSlots += validNames.length;
    const bpCount = validNames.filter(n => bipaup.has(n)).length;
    g.bpSlots += bpCount;
    g.dist[Math.min(bpCount, 7)]++;
  }

  // 카이제곱 계산
  const statsOutput: Record<string, any> = {};
  for (const grade of ["선발", "우수", "특선"]) {
    const g = gradeStats[grade];
    const p = g.totalSlots > 0 ? g.bpSlots / g.totalSlots : 0;
    const chi2Data: { k: number; expected: number; actual: number; diff: number; chi2: number }[] = [];
    let chiTotal = 0;
    for (let k = 0; k <= 7; k++) {
      const prob = binomProb(7, k, p);
      const expected = prob * g.raceCount;
      const actual = g.dist[k];
      const diff = actual - expected;
      const chi2 = expected > 0 ? (diff * diff) / expected : 0;
      chiTotal += chi2;
      chi2Data.push({ k, expected: Math.round(expected * 10) / 10, actual, diff: Math.round(diff * 10) / 10, chi2: Math.round(chi2 * 100) / 100 });
    }
    statsOutput[grade] = {
      raceCount: g.raceCount,
      totalSlots: g.totalSlots,
      bpSlots: g.bpSlots,
      pPct: Math.round(p * 10000) / 100,
      chi2Total: Math.round(chiTotal * 100) / 100,
      chi2Ratio: Math.round(chiTotal / 14.07),
      dist: chi2Data,
    };
    console.log(`\n${grade}: ${g.raceCount}경주, p=${(p*100).toFixed(2)}%, χ²=${chiTotal.toFixed(2)} (${Math.round(chiTotal/14.07)}배)`);
    for (const d of chi2Data) {
      console.log(`  ${d.k}명: 기대${d.expected} 실제${d.actual} 차이${d.diff > 0 ? "+" : ""}${d.diff}`);
    }
  }

  // 출력
  const output = { stats: statsOutput, races: sheetData };
  const outPath = path.resolve(process.cwd(), "scripts/2024-v2-export.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n출력: ${outPath} (${sheetData.length}경주)`);
}

main().catch(console.error);
