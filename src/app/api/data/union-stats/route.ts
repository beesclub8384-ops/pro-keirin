import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import racersData from "@/data/all-racer-names.json";

// 조직 분류는 DB(racer_profiles.union_type) 단일 소스에서 조회한다.
//   union_type='pkru' → pro (프로경륜선수노조, 2노조)
//   union_type='gray' → gray (회색지대)
//   그 외(korru/NULL/미매칭) → kor (한국경륜노조, 1노조)
type Org = "pro" | "kor" | "gray";

const GRADES = ["SS", "S1", "S2", "S3", "A1", "A2", "A3", "B1", "B2", "B3", "--"] as const;
const AGE_BUCKETS = ["20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55+", "unknown"] as const;
type Grade = (typeof GRADES)[number];
type AgeBucket = (typeof AGE_BUCKETS)[number];

// 정규화된 이름 → union_type 맵으로 조직 분류 (공백 제거 키)
function classify(name: string, unionTypeByName: Map<string, string>): Org {
  const type = unionTypeByName.get(name.replace(/\s+/g, ""));
  if (type === "pkru") return "pro";
  if (type === "gray") return "gray";
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

    // 1-2) union_type 이 지정된 선수 → 정규화 이름별 최신 union_type 수집
    //      (DB 단일 소스: 하드코딩 명단 제거)
    const unionTypeByName = new Map<string, string>();
    {
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("racer_profiles")
          .select("name, union_type, year")
          .not("union_type", "is", null)
          .order("year", { ascending: false })
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const r of data) {
          const key = (r.name as string).replace(/\s+/g, "");
          if (unionTypeByName.has(key)) continue; // 최신 연도 우선
          if (r.union_type) unionTypeByName.set(key, r.union_type as string);
        }
        if (data.length < 1000) break;
        from += 1000;
      }
    }

    // 2) 575명에 조직/나이/등급 부여
    const racers = (racersData as Array<{ name: string; grade: string; cohort: string; initial: string }>).map((r) => ({
      name: r.name,
      grade: (GRADES as readonly string[]).includes(r.grade) ? (r.grade as Grade) : ("--" as Grade),
      org: classify(r.name, unionTypeByName),
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
