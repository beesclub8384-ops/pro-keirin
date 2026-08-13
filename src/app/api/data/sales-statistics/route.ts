import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAGE_SIZE = 1000;

// ⚠️ src/lib/supabase.ts 의 공용 fetchAllRows 와는 별개 구현이다.
// 공용 헬퍼는 supabase-js 쿼리 빌더를 받지만, 이쪽은 PostgREST URL 을 직접 조립해
// fetch 로 호출한다(service_role 키 사용). 통합하면 변경 폭이 커져 그대로 둔다.
// 정렬은 아래 URL 의 order=year,id 로 이미 고유키까지 지정돼 있다.
async function fetchAllSalesRows(): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;

  while (true) {
    // order 에 고유키(id) 필수 — year 만으로는 페이지 경계에서 행이 중복·누락된다 (CLAUDE.md 규칙 3)
    const url = `${SUPABASE_URL}/rest/v1/race_sales?select=year,grade,s_합계&order=year,id&offset=${offset}&limit=${PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!res.ok) throw new Error(`Supabase error: ${res.status}`);

    const rows = await res.json();
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

export async function GET() {
  try {
    const rows = await fetchAllSalesRows();

    // 연도별 집계
    const yearMap = new Map<
      number,
      {
        총매출: number;
        선발매출: number;
        우수매출: number;
        특선매출: number;
        선발경주수: number;
        우수경주수: number;
        특선경주수: number;
      }
    >();

    for (const r of rows) {
      if (!yearMap.has(r.year)) {
        yearMap.set(r.year, {
          총매출: 0,
          선발매출: 0,
          우수매출: 0,
          특선매출: 0,
          선발경주수: 0,
          우수경주수: 0,
          특선경주수: 0,
        });
      }
      const s = yearMap.get(r.year)!;
      const amt = r["s_합계"] || 0;
      s.총매출 += amt;

      if (r.grade === "선발") {
        s.선발매출 += amt;
        s.선발경주수++;
      } else if (r.grade === "우수") {
        s.우수매출 += amt;
        s.우수경주수++;
      } else if (r.grade === "특선") {
        s.특선매출 += amt;
        s.특선경주수++;
      }
    }

    const data = Array.from(yearMap.entries())
      .map(([year, s]) => ({
        year,
        총매출: s.총매출,
        선발매출: s.선발매출,
        우수매출: s.우수매출,
        특선매출: s.특선매출,
        선발경주수: s.선발경주수,
        우수경주수: s.우수경주수,
        특선경주수: s.특선경주수,
        선발평균: s.선발경주수 > 0 ? Math.round(s.선발매출 / s.선발경주수) : 0,
        우수평균: s.우수경주수 > 0 ? Math.round(s.우수매출 / s.우수경주수) : 0,
        특선평균: s.특선경주수 > 0 ? Math.round(s.특선매출 / s.특선경주수) : 0,
      }))
      .sort((a, b) => a.year - b.year);

    return NextResponse.json({ data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
