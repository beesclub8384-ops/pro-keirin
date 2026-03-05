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
