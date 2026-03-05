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
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }
): Promise<T[]> {
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
