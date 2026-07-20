import fs from "fs";
import path from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// 575명 (kcycle 등록 현역)
const racers = JSON.parse(
  fs.readFileSync(path.join("src", "data", "all-racer-names.json"), "utf-8")
);

// 이름별 최신 birth_year 수집 (year>=2024 한도)
const ageByName = new Map();
{
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("racer_profiles")
      .select("name, birth_year, year")
      .not("birth_year", "is", null)
      .gte("year", 2023)
      .order("year", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    if (!data || !data.length) break;
    for (const r of data) {
      const n = r.name.replace(/\s+/g, "");
      if (ageByName.has(n)) continue;
      const m = r.birth_year.match(/^(\d{2})/);
      if (!m) continue;
      const yy = parseInt(m[1], 10);
      const fullYear = yy <= 30 ? 2000 + yy : 1900 + yy;
      ageByName.set(n, 2026 - fullYear);
    }
    if (data.length < 1000) break;
    from += 1000;
  }
}

const PRO = `강동주 강민성 강병석 강석호 강진원 고재준 고종인 공태민 공태욱 곽현명 곽훈신 구동훈 구본광 권오철 권우주 권혁진 김관희 김광근 김근영 김기동 김다빈 김도현 김동관 김동하 김동훈 김두용 김로운 김명래 김명섭 김명중 김민균 김민배 김민수 김민욱 김민준 김민호 김배영 김범수 김범준 김범중 김시후 김영석 김영섭 김영수 김옥철 김용규 김용남 김용진 김우겸 김우영 김우현 김웅겸 김원진 김정우 김제영 김종성 김종현 김주한 김주호 김준빈 김준철 김지호 김철민 김태범 김태완 김태형 김태호 김한울 김현경 김형모 김형완 김홍기 김홍일 김환윤 김희준 류재민 류재열 명경민 문신준서 문인재 문희덕 민상호 민선기 박건수 박경호 박동수 박민철 박석기 박성순 박성현 박승민 박용범 박종태 박준성 박진철 박철성 방극산 배규태 배민구 배석현 배준호 석혜윤 성용환 손경수 손성진 손재우 손제용 송경방 송대호 송승현 송정욱 송종훈 신광호 신동인 신동현 신은섭 신주헌 안성민 안창진 양승원 양진우 엄재천 엄정일 엄희태 여민호 오기호 오유민 오은섭 오태희 왕지현 우성식 원신재 원준오 유연종 유주현 유태복 윤진규 윤현구 윤현준 이규봉 이근우 이기주 이기한 이기호 이록희 이상현 이서혁 이성록 이성민 이수원 이승원 이용희 이우정 이유진 이인우 이일수 이재봉 이재옥 이정민 이정석 이주영 이지훈 이진웅 이진원 이차현 이찬우 이태운 이홍주 인치환 임경수 임대성 임유섭 임재연 임채빈 전경호 전영규 전원규 정동호 정상민 정윤재 정윤혁 정재원 정정교 정종진 정지민 정태양 정하늘 정하전 정해권 정해민 조성윤 조영소 조영환 조재호 조주현 조창인 주성민 주효진 지종오 최근영 최동현 최민호 최병길 최순영 최정환 한동현 한탁희 함동주 함명주 허동혁 현지운 황승호 황인혁 황준하`.split(/\s+/);
const GRAY = `박종현 박제원 이정운 김원호 장인석 류근철 김현 김규봉 김이남 강동규 성낙송 이태호 정충교 김태율`.split(/\s+/);
const proSet = new Set(PRO);
const graySet = new Set(GRAY);

function organize(name) {
  if (proSet.has(name)) return "pro";
  if (graySet.has(name)) return "gray";
  return "kor";
}
function decade(age) {
  if (age == null) return "unknown";
  if (age <= 24) return "20-24";
  if (age <= 29) return "25-29";
  if (age <= 34) return "30-34";
  if (age <= 39) return "35-39";
  if (age <= 44) return "40-44";
  if (age <= 49) return "45-49";
  if (age <= 54) return "50-54";
  return "55+";
}
function gradeLetter(g) {
  if (g === "SS") return "SS";
  if (g.startsWith("S")) return "S";
  if (g.startsWith("A")) return "A";
  if (g.startsWith("B")) return "B";
  return "기타";
}
function pad(s, n) {
  const t = String(s);
  let len = 0;
  for (const ch of t) len += ch.codePointAt(0) > 127 ? 2 : 1;
  return t + " ".repeat(Math.max(0, n - len));
}

const enriched = racers.map((r) => ({
  ...r,
  org: organize(r.name),
  age: ageByName.get(r.name) ?? null,
}));

const orgs = ["pro", "kor", "gray"];
const orgLabel = {
  pro: "프로경륜선수노조 (215명 명단)",
  kor: "한국경륜선수노조 (나머지)",
  gray: "회색지대 (14명 명단)",
};

console.log("======================================================");
console.log("경륜 선수 3개 조직 통계 (kcycle 등록 현역 575명 기준)");
console.log("======================================================");

// ① 인원수
console.log("\n① 조직별 인원수");
console.log("------------------------------------------------------");
let total = 0;
for (const o of orgs) {
  const n = enriched.filter((r) => r.org === o).length;
  total += n;
  console.log(`  ${pad(orgLabel[o], 38)} ${String(n).padStart(4)}명`);
}
console.log("  ----------------------------------------------------");
console.log(`  ${pad("합계", 38)} ${String(total).padStart(4)}명`);

const missingPro = PRO.filter((n) => !enriched.find((r) => r.name === n && r.org === "pro"));
const missingGray = GRAY.filter((n) => !enriched.find((r) => r.name === n && r.org === "gray"));
if (missingPro.length || missingGray.length) {
  console.log("\n  ⚠️ 명단에 있으나 kcycle 575명에 없는 이름:");
  if (missingPro.length) console.log(`     프로노조: ${missingPro.join(", ")}`);
  if (missingGray.length) console.log(`     회색지대: ${missingGray.join(", ")}`);
}

// ② 등급
console.log("\n② 조직별 등급 분포");
console.log("------------------------------------------------------");
const grades = ["SS", "S", "A", "B", "기타"];
console.log(`  ${pad("조직", 38)}${grades.map((g) => String(g).padStart(6)).join("")}${"계".padStart(6)}`);
for (const o of orgs) {
  const list = enriched.filter((r) => r.org === o);
  const cnt = Object.fromEntries(grades.map((g) => [g, 0]));
  for (const r of list) cnt[gradeLetter(r.grade)]++;
  console.log(`  ${pad(orgLabel[o], 38)}${grades.map((g) => String(cnt[g]).padStart(6)).join("")}${String(list.length).padStart(6)}`);
}

// ③ 나이대
console.log("\n③ 조직별 나이 분포 (2026 기준)");
console.log("------------------------------------------------------");
const decades = ["20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55+", "unknown"];
const decLabel = {
  "20-24": "20-24",
  "25-29": "25-29",
  "30-34": "30-34",
  "35-39": "35-39",
  "40-44": "40-44",
  "45-49": "45-49",
  "50-54": "50-54",
  "55+": "55+",
  unknown: "미상",
};
console.log(`  ${pad("조직", 38)}${decades.map((d) => decLabel[d].padStart(6)).join("")}${"계".padStart(6)}`);
for (const o of orgs) {
  const list = enriched.filter((r) => r.org === o);
  const cnt = Object.fromEntries(decades.map((d) => [d, 0]));
  for (const r of list) cnt[decade(r.age)]++;
  console.log(`  ${pad(orgLabel[o], 38)}${decades.map((d) => String(cnt[d]).padStart(6)).join("")}${String(list.length).padStart(6)}`);
}

// ④ 평균 나이
console.log("\n④ 평균 나이 (출생연도 매칭된 인원만)");
console.log("------------------------------------------------------");
function avg(list) {
  const ages = list.map((r) => r.age).filter((a) => a != null);
  if (!ages.length) return { avg: null, n: 0 };
  return { avg: ages.reduce((a, b) => a + b, 0) / ages.length, n: ages.length };
}
const allS = avg(enriched);
console.log(`  ${pad("전체 575명", 38)} 평균 ${allS.avg.toFixed(2)}세 (매칭 ${allS.n}명)`);
for (const o of orgs) {
  const list = enriched.filter((r) => r.org === o);
  const s = avg(list);
  console.log(`  ${pad(orgLabel[o], 38)} 평균 ${s.avg != null ? s.avg.toFixed(2) + "세" : "—"} (매칭 ${s.n}/${list.length}명)`);
}

const unmatched = enriched.filter((r) => r.age == null);
if (unmatched.length) {
  console.log(`\n  ⚠️ 나이 미매칭 ${unmatched.length}명: ${unmatched.map((r) => r.name).join(", ")}`);
}
