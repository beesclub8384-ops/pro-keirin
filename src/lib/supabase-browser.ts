import { createClient } from "@supabase/supabase-js";

// 브라우저(클라이언트 컴포넌트)에서 직접 Supabase를 anon key로 조회할 때 사용.
// 서버 전용 createAdminClient(service role)와 달리 RLS가 적용된다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey);
