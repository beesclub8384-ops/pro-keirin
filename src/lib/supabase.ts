import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !key) {
      throw new Error(
        `Supabase env missing: URL=${url ? "set" : "MISSING"}, KEY=${key ? "set" : "MISSING"}`
      );
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Admin client (uses service role key, bypasses RLS) — for seed scripts only
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  return createClient(url, serviceRoleKey);
}

/**
 * Get distinct years that have data in a table.
 * Uses parallel count queries to avoid the 1000-row PostgREST limit.
 */
export async function getDistinctYears(
  table: string,
  yearCol = "year",
  minYear = 2003
): Promise<number[]> {
  const sb = getSupabase();
  const currentYear = new Date().getFullYear();
  const checks = Array.from(
    { length: currentYear - minYear + 1 },
    (_, i) => minYear + i
  ).map(async (y) => {
    const { count } = await sb
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(yearCol, y);
    return count && count > 0 ? y : null;
  });
  const results = await Promise.all(checks);
  return results.filter((y): y is number => y !== null).sort((a, b) => b - a);
}

/**
 * Paginated fetch to get all rows past the 1000-row limit.
 *
 * @param opts.orderedBy 호출자가 **이미 query 에 걸어둔** 정렬 키를 선언하는 값이다.
 *   이 헬퍼는 이 값으로 정렬하지 않는다 — 정렬은 호출자가 `.order()` 로 직접 건다.
 *   (테이블마다 무엇이 고유키인지, 표시 순서를 어떻게 둘지는 호출자만 알 수 있다)
 *
 *   ⚠️ 그 정렬은 **고유해야** 한다. 비고유 키만으로는 페이지 경계에서 행이
 *   중복·누락된다. ORDER BY 가 없거나 동점이 생기면 Postgres 가 행 순서를
 *   보장하지 않기 때문이며, 에러도 안 나고 가져온 행 수도 맞아서
 *   건수 검증에도 안 걸린다. 실측 근거는 CLAUDE.md 규칙 3 참조.
 *
 *   조합으로 고유하면 조합을 그대로 적는다.
 *
 * @example
 *   // ✅ 단일 고유키
 *   await fetchAllRows(sb.from("races").select("*").order("id"), { orderedBy: "id" })
 *
 *   // ✅ 표시 순서(date)를 유지하면서 뒤에 고유키를 덧붙인 경우
 *   await fetchAllRows(
 *     sb.from("race_schedule").select("*").order("date").order("id"),
 *     { orderedBy: "date,id" },
 *   )
 *
 *   // ✅ 조합이 고유한 경우 (racer_yearly_starts PK = racer_id + year)
 *   await fetchAllRows(q.order("year").order("racer_id"), { orderedBy: "year,racer_id" })
 *
 *   // ❌ year 만으로는 동점이 생겨 페이지 경계에서 행이 샌다
 *   await fetchAllRows(q.order("year"), { orderedBy: "year" })
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  query: {
    range: (from: number, to: number) => PromiseLike<{
      data: T[] | null;
      error: { message: string } | null;
    }>;
  },
  opts: { orderedBy: string },
): Promise<T[]> {
  void opts; // 선언 전용 — 런타임 동작에는 쓰이지 않는다 (타입 레벨 강제가 목적)
  const PAGE = 1000;
  let all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await query.range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}
