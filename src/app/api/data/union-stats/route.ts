import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import racersData from "@/data/all-racer-names.json";

// 조직 분류 명단 (현 시점 기준)
// 프로경륜선수노조 명단 (217명)
const PRO_LIST = `강동주 강민성 강병석 강석호 강진원 고재준 고종인 공태민 공태욱 곽현명 구동훈 구본광 권오철 권우주 권혁진 김관희 김광근 김근영 김기동 김다빈 김도현 김동관 김동하 김동훈 김두용 김로운 김명래 김명섭 김명중 김민균 김민배 김민수 김민욱 김민준 김민호 김배영 김범수 김범준 김범중 김시후 김영규 김영석 김영섭 김영수 김옥철 김용규 김용남 김용진 김우겸 김우영 김웅겸 김원진 김정우 김제영 김종성 김종현 김주한 김주호 김준빈 김준철 김지호 김철민 김태범 김태완 김태형 김태호 김한울 김현경 김형모 김형완 김홍기 김홍일 김환윤 김희준 남용찬 노태경 노형균 류재민 류재열 명경민 문신준서 문인재 문희덕 민상호 민선기 박건수 박경호 박동수 박민철 박석기 박성순 박성현 박승민 박용범 박종태 박준성 박진철 박철성 방극산 배규태 배민구 배석현 배준호 석혜윤 성용환 손경수 손성진 손재우 손제용 송경방 송대호 송승현 송정욱 송종훈 신광호 신동인 신동현 신은섭 신주헌 안성민 안창진 양승원 양진우 엄재천 엄정일 엄희태 여민호 오기호 오유민 오은섭 오태희 왕지현 우성식 원신재 원준오 유연종 유주현 유태복 윤진규 윤현구 윤현준 이규봉 이근우 이기주 이기한 이기호 이록희 이상현 이서혁 이성록 이성민 이수원 이승원 이용희 이우정 이유진 이인우 이일수 이재봉 이재옥 이정민 이정석 이주영 이지훈 이진웅 이진원 이차현 이찬우 이태운 이홍주 인치환 임경수 임대성 임유섭 임재연 임채빈 전경호 전영규 전원규 정동호 정상민 정윤재 정윤혁 정재원 정정교 정종진 정지민 정태양 정하늘 정하전 정해권 정해민 조성윤 조영소 조영환 조재호 조주현 조창인 주성민 주효진 지종오 최근영 최대용 최동현 최민호 최병길 최순영 최정환 한동현 한탁희 함동주 함명주 허동혁 현지운 황승호 황인혁 황준하`.split(/\s+/);

// 회색지대 (14명)
const GRAY_LIST = `박종현 박제원 이정운 김원호 장인석 류근철 김현 김규봉 김이남 강동규 성낙송 이태호 정충교 김태율`.split(/\s+/);

const PRO_SET = new Set(PRO_LIST);
const GRAY_SET = new Set(GRAY_LIST);

type Org = "pro" | "kor" | "gray";
const ORGS: Org[] = ["pro", "kor", "gray"];

const GRADES = ["SS", "S1", "S2", "S3", "A1", "A2", "A3", "B1", "B2", "B3", "--"] as const;
const AGE_BUCKETS = ["20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55+", "unknown"] as const;
type Grade = (typeof GRADES)[number];
type AgeBucket = (typeof AGE_BUCKETS)[number];

function classify(name: string): Org {
  if (PRO_SET.has(name)) return "pro";
  if (GRAY_SET.has(name)) return "gray";
  return "kor";
}

function ageBucketOf(age: number | null): AgeBucket {
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

// "74년 02월 21일" → 1974 / "01년 ..." → 2001
function parseBirthYear(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{2})/);
  if (!m) return null;
  const yy = parseInt(m[1], 10);
  return yy <= 30 ? 2000 + yy : 1900 + yy;
}

export const revalidate = 86400; // 1일

export async function GET() {
  try {
    const supabase = getSupabase();
    const today = new Date();
    const refYear = today.getFullYear();

    // 1) racer_profiles 최신 (year>=2023) 에서 이름별 birth_year 수집
    //    공백 포함 이름("허  남") 대응 위해 정규화 키 사용
    const ageByName = new Map<string, number>();
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
        if (!data || data.length === 0) break;
        for (const r of data) {
          const key = (r.name as string).replace(/\s+/g, "");
          if (ageByName.has(key)) continue;
          const by = parseBirthYear(r.birth_year as string);
          if (by != null) ageByName.set(key, refYear - by);
        }
        if (data.length < 1000) break;
        from += 1000;
      }
    }

    // 2) 575명에 조직/나이/등급 부여
    const racers = (racersData as Array<{ name: string; grade: string; cohort: string; initial: string }>).map((r) => ({
      name: r.name,
      grade: (GRADES as readonly string[]).includes(r.grade) ? (r.grade as Grade) : ("--" as Grade),
      org: classify(r.name),
      age: ageByName.get(r.name) ?? null,
    }));

    // 3) 집계
    const summary: Record<Org | "total", number> = { pro: 0, kor: 0, gray: 0, total: racers.length };
    const gradeByOrg: Record<Org, Record<Grade, number>> = {
      pro: Object.fromEntries(GRADES.map((g) => [g, 0])) as Record<Grade, number>,
      kor: Object.fromEntries(GRADES.map((g) => [g, 0])) as Record<Grade, number>,
      gray: Object.fromEntries(GRADES.map((g) => [g, 0])) as Record<Grade, number>,
    };
    const ageByOrg: Record<Org, Record<AgeBucket, number>> = {
      pro: Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0])) as Record<AgeBucket, number>,
      kor: Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0])) as Record<AgeBucket, number>,
      gray: Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0])) as Record<AgeBucket, number>,
    };
    const ageSum: Record<Org, { sum: number; n: number }> = {
      pro: { sum: 0, n: 0 },
      kor: { sum: 0, n: 0 },
      gray: { sum: 0, n: 0 },
    };

    for (const r of racers) {
      summary[r.org]++;
      gradeByOrg[r.org][r.grade]++;
      ageByOrg[r.org][ageBucketOf(r.age)]++;
      if (r.age != null) {
        ageSum[r.org].sum += r.age;
        ageSum[r.org].n += 1;
      }
    }

    const avgAge: Record<Org | "total", number | null> = {
      pro: ageSum.pro.n ? +(ageSum.pro.sum / ageSum.pro.n).toFixed(2) : null,
      kor: ageSum.kor.n ? +(ageSum.kor.sum / ageSum.kor.n).toFixed(2) : null,
      gray: ageSum.gray.n ? +(ageSum.gray.sum / ageSum.gray.n).toFixed(2) : null,
      total: null,
    };
    const totalN = ageSum.pro.n + ageSum.kor.n + ageSum.gray.n;
    const totalSum = ageSum.pro.sum + ageSum.kor.sum + ageSum.gray.sum;
    avgAge.total = totalN ? +(totalSum / totalN).toFixed(2) : null;

    // KPI용 파생값
    const ssByOrg: Record<Org, number> = {
      pro: gradeByOrg.pro.SS,
      kor: gradeByOrg.kor.SS,
      gray: gradeByOrg.gray.SS,
    };

    function upperRatio(o: Org): number {
      const list = gradeByOrg[o];
      const upper = list.SS + list.S1 + list.S2 + list.S3 + list.A1 + list.A2 + list.A3;
      const n = summary[o];
      return n ? +(upper / n).toFixed(4) : 0;
    }
    const upperGradeRatio: Record<Org, number> = {
      pro: upperRatio("pro"),
      kor: upperRatio("kor"),
      gray: upperRatio("gray"),
    };

    return NextResponse.json(
      {
        asOf: today.toISOString().slice(0, 10),
        refYear,
        summary,
        gradeByOrg,
        ageByOrg,
        avgAge,
        ssByOrg,
        upperGradeRatio,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800",
        },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
