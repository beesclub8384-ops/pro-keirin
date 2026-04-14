// 2024년 급별 전체/비파업 슬롯 수 조회
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

function classifyGrade(grade: string): string | null {
  if (!grade) return null;
  if (grade.startsWith("특선") || /^S/i.test(grade)) return "특선";
  if (grade.startsWith("우수") || /^A/i.test(grade)) return "우수";
  if (grade.startsWith("선발") || /^B/i.test(grade)) return "선발";
  return null;
}

async function main() {
  const rows = await fetchAll<{ racer_name: string; grade: string }>(
    () => sb.from("entries").select("racer_name, grade")
      .gte("date", "2024-01-01").lte("date", "2024-12-31")
  );
  console.log(`총 entries 행 수: ${rows.length}\n`);

  const stats: Record<string, { total: number; bipaup: number }> = {
    "특선": { total: 0, bipaup: 0 },
    "우수": { total: 0, bipaup: 0 },
    "선발": { total: 0, bipaup: 0 },
  };
  let unclassified = 0;

  for (const r of rows) {
    const name = r.racer_name?.replace(/\s+/g, "");
    if (!name) continue;
    const cls = classifyGrade(r.grade);
    if (!cls) { unclassified++; continue; }
    stats[cls].total++;
    if (bipaup.has(name)) stats[cls].bipaup++;
  }

  console.log("=== 2024년 급별 슬롯 분석 ===");
  console.log("급별      | 전체 슬롯 | 비파업 슬롯 | 비파업 비율");
  console.log("-".repeat(55));
  let totalAll = 0, totalBp = 0;
  for (const g of ["특선", "우수", "선발"] as const) {
    const s = stats[g];
    const pct = s.total > 0 ? ((s.bipaup / s.total) * 100).toFixed(1) : "0.0";
    console.log(`${g.padEnd(6)}    | ${String(s.total).padStart(9)} | ${String(s.bipaup).padStart(11)} | ${pct}%`);
    totalAll += s.total;
    totalBp += s.bipaup;
  }
  console.log("-".repeat(55));
  const totalPct = totalAll > 0 ? ((totalBp / totalAll) * 100).toFixed(1) : "0.0";
  console.log(`합계      | ${String(totalAll).padStart(9)} | ${String(totalBp).padStart(11)} | ${totalPct}%`);
  if (unclassified > 0) console.log(`\n미분류 행: ${unclassified}건`);
}

main().catch(console.error);
