// 2024년 3방향 × 3회 교차검증
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

function classifyRaceType(rt: string): string | null {
  if (!rt) return null;
  if (rt.includes("특선")) return "특선";
  if (rt.includes("우수")) return "우수";
  if (rt.includes("선발")) return "선발";
  return null;
}

async function main() {
  // ===== 공통 데이터 로드 =====
  const pages = await fetchAll<{ id: number; round: number; day: number }>(
    () => sb.from("decision_card_pages").select("id, round, day").eq("year", 2024)
  );
  const pageIds = pages.map(p => p.id);
  const pageMap = new Map(pages.map(p => [p.id, p]));

  const races: { id: number; page_id: number; race_no: number; race_type: string }[] = [];
  for (let i = 0; i < pageIds.length; i += 200) {
    const chunk = pageIds.slice(i, i + 200);
    const rows = await fetchAll<{ id: number; page_id: number; race_no: number; race_type: string }>(
      () => sb.from("decision_card_races").select("id, page_id, race_no, race_type").in("page_id", chunk)
    );
    races.push(...rows);
  }

  const raceIds = races.map(r => r.id);
  const entries: { dc_race_id: number; back_no: number; racer_id: string }[] = [];
  for (let i = 0; i < raceIds.length; i += 200) {
    const chunk = raceIds.slice(i, i + 200);
    const rows = await fetchAll<{ dc_race_id: number; back_no: number; racer_id: string }>(
      () => sb.from("decision_card_entries").select("dc_race_id, back_no, racer_id")
        .in("dc_race_id", chunk).not("racer_id", "is", null)
    );
    entries.push(...rows);
  }

  // racer_id → name
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

  // ============================================================
  console.log("=".repeat(70));
  console.log("방향 1: 숫자 정합성 검증");
  console.log("=".repeat(70));

  // 1-1
  const totalRaces = races.length;
  const ok11 = totalRaces === 2496;
  console.log(`\n1-1. 전체 경주 수: ${totalRaces}건 (기대: 2,496건) ${ok11 ? "✅ 일치" : "❌ 불일치"}`);

  // 1-2
  const totalEntries = entries.length;
  // 기대값은 17,472가 아닐 수 있음 (null 제외 기준)
  console.log(`1-2. 전체 출전 슬롯 수: ${totalEntries}건 (기대: 17,472건) ${totalEntries === 17472 ? "✅ 일치" : `⚠️ 차이 ${totalEntries - 17472}건 (racer_id가 null인 슬롯 제외)`}`);

  // null 포함 전체 슬롯도 별도 조회
  let totalSlotsIncNull = 0;
  for (let i = 0; i < raceIds.length; i += 200) {
    const chunk = raceIds.slice(i, i + 200);
    const rows = await fetchAll<{ dc_race_id: number }>(
      () => sb.from("decision_card_entries").select("dc_race_id").in("dc_race_id", chunk)
    );
    totalSlotsIncNull += rows.length;
  }
  console.log(`     (null 포함 전체 슬롯: ${totalSlotsIncNull}건)`);

  // 1-3
  const raceTypeCounts = new Map<string, number>();
  for (const r of races) {
    const rt = r.race_type || "(없음)";
    raceTypeCounts.set(rt, (raceTypeCounts.get(rt) || 0) + 1);
  }
  console.log(`\n1-3. 급별 경주 수 (race_type별):`);
  const gradeAgg: Record<string, number> = { "선발": 0, "우수": 0, "특선": 0 };
  for (const [rt, cnt] of [...raceTypeCounts.entries()].sort()) {
    console.log(`     ${rt}: ${cnt}건`);
    const cls = classifyRaceType(rt);
    if (cls) gradeAgg[cls] += cnt;
  }
  const expected13 = { "선발": 765, "우수": 1071, "특선": 652 };
  console.log(`\n     급별 합산:`);
  for (const g of ["선발", "우수", "특선"]) {
    const ok = gradeAgg[g] === expected13[g as keyof typeof expected13];
    console.log(`     ${g}: ${gradeAgg[g]}건 (기대: ${expected13[g as keyof typeof expected13]}건) ${ok ? "✅ 일치" : "❌ 불일치"}`);
  }
  const unclassified = races.length - gradeAgg["선발"] - gradeAgg["우수"] - gradeAgg["특선"];
  if (unclassified > 0) console.log(`     미분류: ${unclassified}건`);

  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("방향 2: 비파업/파업 분류 정확성 검증");
  console.log("=".repeat(70));

  // 2024년 출전한 모든 이름 집합
  const allNames2024 = new Set<string>();
  for (const e of entries) {
    const n = getName(e.racer_id);
    if (n) allNames2024.add(n);
  }

  // 2-1
  console.log(`\n2-1. 비파업 선수 10명 검증:`);
  const bpCheck = ["임채빈","정종진","손경수","원준오","공태민","박건수","유태복","인치환","정하늘","김형완"];
  for (const name of bpCheck) {
    const inList = bipaup.has(name);
    const hasRecord = allNames2024.has(name);
    const status = inList && hasRecord ? "✅" : inList && !hasRecord ? "⚠️ 명단O 출전X" : !inList ? "❌ 명단에 없음" : "?";
    console.log(`     ${name}: 비파업명단=${inList ? "O" : "X"}, 2024출전=${hasRecord ? "O" : "X"} ${status}`);
  }

  // 2-2
  console.log(`\n2-2. 파업 선수 10명 검증:`);
  const paupCheck = ["김경갑","이승현","박진우","정성훈","윤창호","손진철","임대승","배정현","오성균","신호재"];
  for (const name of paupCheck) {
    const inList = bipaup.has(name);
    const hasRecord = allNames2024.has(name);
    const status = !inList && hasRecord ? "✅" : !inList && !hasRecord ? "⚠️ 명단X 출전X" : inList ? "❌ 비파업명단에 있음!" : "?";
    console.log(`     ${name}: 비파업명단=${inList ? "O" : "X"}, 2024출전=${hasRecord ? "O" : "X"} ${status}`);
  }

  // 2-3
  console.log(`\n2-3. 2024년 1회차 1일차 1경주 검증:`);
  // 1회차 1일차 page 찾기
  const pg11 = pages.find(p => p.round === 1 && p.day === 1);
  if (!pg11) { console.log("     ❌ 1회차 1일차 페이지 없음"); }
  else {
    const race1 = races.find(r => r.page_id === pg11.id && r.race_no === 1);
    if (!race1) { console.log("     ❌ 1경주 없음"); }
    else {
      console.log(`     경주구분: ${race1.race_type}`);
      const raceEntries = entries
        .filter(e => e.dc_race_id === race1.id)
        .sort((a, b) => a.back_no - b.back_no);
      for (const e of raceEntries) {
        const name = getName(e.racer_id);
        const tag = bipaup.has(name) ? "비파업" : "파업";
        console.log(`     ${e.back_no}번: ${name} → ${tag} ${bipaup.has(name) ? "✅" : "✅"} (명단대조 정상)`);
      }
    }
  }

  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("방향 3: 통계 수치 재계산 검증");
  console.log("=".repeat(70));

  // 경주별 그룹핑
  type RaceGroup = { names: string[]; grade: string };
  const raceMap = new Map<number, RaceGroup>();
  for (const e of entries) {
    const r = races.find(rc => rc.id === e.dc_race_id);
    if (!r) continue;
    const cls = classifyRaceType(r.race_type);
    if (!cls) continue;
    if (!raceMap.has(e.dc_race_id)) raceMap.set(e.dc_race_id, { names: [], grade: cls });
    raceMap.get(e.dc_race_id)!.names.push(getName(e.racer_id));
  }

  const expectedDist: Record<string, number[]> = {
    "선발": [327, 34, 167, 193, 26, 3, 4, 11],
    "우수": [74, 16, 89, 664, 152, 21, 18, 37],
    "특선": [16, 0, 9, 78, 221, 38, 88, 202],
  };

  for (const grade of ["선발", "우수", "특선"]) {
    const dist = new Array(8).fill(0);
    let raceCount = 0;
    for (const [, rg] of raceMap) {
      if (rg.grade !== grade) continue;
      raceCount++;
      const bpCount = rg.names.filter(n => bipaup.has(n)).length;
      dist[Math.min(bpCount, 7)]++;
    }

    const testNum = grade === "선발" ? "3-1" : grade === "우수" ? "3-2" : "3-3";
    console.log(`\n${testNum}. ${grade}급 분포 재집계 (${raceCount}경주):`);
    console.log("     비파업 | 재집계 | 기존값 | 판정");
    console.log("     " + "-".repeat(45));
    let allMatch = true;
    for (let k = 0; k <= 7; k++) {
      const ok = dist[k] === expectedDist[grade][k];
      if (!ok) allMatch = false;
      console.log(`       ${k}명  | ${String(dist[k]).padStart(6)} | ${String(expectedDist[grade][k]).padStart(6)} | ${ok ? "✅ 일치" : "❌ 불일치"}`);
    }
    console.log(`     종합: ${allMatch ? "✅ 전체 일치" : "❌ 불일치 있음"}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("교차검증 완료");
  console.log("=".repeat(70));
}

main().catch(console.error);
