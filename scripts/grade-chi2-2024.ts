// 2024년 급별 이항분포 기대값 vs 실제값 + 카이제곱 검정
// 급별 분류: decision_card_races.race_type
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

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

function classifyRaceType(raceType: string): string | null {
  if (!raceType) return null;
  if (raceType.includes("특선")) return "특선";
  if (raceType.includes("우수")) return "우수";
  if (raceType.includes("선발")) return "선발";
  return null;
}

// 이항분포 확률 C(n,k) * p^k * (1-p)^(n-k)
function binomProb(n: number, k: number, p: number): number {
  let logC = 0;
  for (let i = 0; i < k; i++) {
    logC += Math.log(n - i) - Math.log(i + 1);
  }
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

async function main() {
  // 1. pages
  const pages = await fetchAll<{ id: number }>(
    () => sb.from("decision_card_pages").select("id").eq("year", 2024)
  );
  const pageIds = pages.map(p => p.id);

  // 2. races
  const races: { id: number; race_type: string }[] = [];
  for (let i = 0; i < pageIds.length; i += 200) {
    const chunk = pageIds.slice(i, i + 200);
    const rows = await fetchAll<{ id: number; race_type: string }>(
      () => sb.from("decision_card_races").select("id, race_type").in("page_id", chunk)
    );
    races.push(...rows);
  }

  const raceGradeMap = new Map<number, string>();
  for (const r of races) {
    const cls = classifyRaceType(r.race_type);
    if (cls) raceGradeMap.set(r.id, cls);
  }

  // 3. entries
  const allRaceIds = [...raceGradeMap.keys()];
  const entries: { dc_race_id: number; racer_id: string }[] = [];
  for (let i = 0; i < allRaceIds.length; i += 200) {
    const chunk = allRaceIds.slice(i, i + 200);
    const rows = await fetchAll<{ dc_race_id: number; racer_id: string }>(
      () => sb.from("decision_card_entries").select("dc_race_id, racer_id")
        .in("dc_race_id", chunk).not("racer_id", "is", null)
    );
    entries.push(...rows);
  }

  // 4. racer_id → name
  const racerIdSet = new Set(entries.map(e => e.racer_id).filter(Boolean));
  const racerIds = [...racerIdSet];
  const nameMap = new Map<string, string>();

  for (let i = 0; i < racerIds.length; i += 200) {
    const chunk = racerIds.slice(i, i + 200);
    const rows = await fetchAll<{ racer_id: string; name: string }>(
      () => sb.from("racer_ids").select("racer_id, name").eq("year", 2024).in("racer_id", chunk)
    );
    for (const r of rows) nameMap.set(r.racer_id, r.name);
  }
  const missing = racerIds.filter(id => !nameMap.has(id));
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200);
    const rows = await fetchAll<{ racer_id: string; name: string }>(
      () => sb.from("racer_ids").select("racer_id, name").in("racer_id", chunk)
        .order("year", { ascending: false })
    );
    for (const r of rows) if (!nameMap.has(r.racer_id)) nameMap.set(r.racer_id, r.name);
  }

  // 5. 경주별 집계
  type Race = { names: string[]; grade: string };
  const raceMap = new Map<number, Race>();
  for (const e of entries) {
    const grade = raceGradeMap.get(e.dc_race_id);
    if (!grade) continue;
    if (!raceMap.has(e.dc_race_id)) raceMap.set(e.dc_race_id, { names: [], grade });
    const raw = nameMap.get(e.racer_id) || "";
    raceMap.get(e.dc_race_id)!.names.push(raw.replace(/\s+/g, ""));
  }

  // 6. 급별 슬롯 수 + 분포 + 이항분포 기대값 + 카이제곱
  const gradeData: Record<string, { totalSlots: number; bpSlots: number; dist: number[]; raceCount: number }> = {
    "특선": { totalSlots: 0, bpSlots: 0, dist: new Array(8).fill(0), raceCount: 0 },
    "우수": { totalSlots: 0, bpSlots: 0, dist: new Array(8).fill(0), raceCount: 0 },
    "선발": { totalSlots: 0, bpSlots: 0, dist: new Array(8).fill(0), raceCount: 0 },
  };

  for (const [, race] of raceMap) {
    const g = gradeData[race.grade];
    if (!g) continue;
    g.raceCount++;
    const bpCount = race.names.filter(n => bipaup.has(n)).length;
    g.totalSlots += race.names.length;
    g.bpSlots += bpCount;
    g.dist[Math.min(bpCount, 7)]++;
  }

  for (const grade of ["특선", "우수", "선발"] as const) {
    const g = gradeData[grade];
    const p = g.totalSlots > 0 ? g.bpSlots / g.totalSlots : 0;

    console.log("=".repeat(65));
    console.log(`${grade}`);
    console.log("-".repeat(65));
    console.log(`  전체 슬롯: ${g.totalSlots}  비파업 슬롯: ${g.bpSlots}  비파업 비율(p): ${(p * 100).toFixed(2)}%`);
    console.log(`  경주 수: ${g.raceCount}\n`);

    console.log("비파업 |  기대 경주 |  실제 경주 |    차이 | 카이제곱");
    console.log("-".repeat(60));

    let chiTotal = 0;
    for (let k = 0; k <= 7; k++) {
      const prob = binomProb(7, k, p);
      const expected = prob * g.raceCount;
      const actual = g.dist[k];
      const diff = actual - expected;
      const chi2 = expected > 0 ? (diff * diff) / expected : 0;
      chiTotal += chi2;
      console.log(
        `  ${k}명  | ${expected.toFixed(1).padStart(10)} | ${String(actual).padStart(10)} | ${diff.toFixed(1).padStart(7)} | ${chi2.toFixed(2).padStart(8)}`
      );
    }
    console.log("-".repeat(60));
    console.log(`  카이제곱 합계: ${chiTotal.toFixed(2)}  (자유도 7, 임계값 14.07 @ p=0.05)`);
    console.log();
  }
}

main().catch(console.error);
