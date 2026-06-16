import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth/verify-admin";
import { VOTE_ITEMS } from "@/lib/vote-config";

export const dynamic = "force-dynamic";

interface VoteRow {
  token: string;
  votes: Record<string, boolean>;
  voted_at: string;
}

export async function GET() {
  // 쿠키 재검증 (보안 필수)
  const authorized = await verifyAdmin();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 전체 투표 조회 (페이지네이션 — 1000행 제한 회피)
  const rows: VoteRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("pkru_vote_2026")
      .select("token, votes, voted_at")
      .order("voted_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[vote-results] DB error:", error);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as VoteRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // 항목별 찬성/반대 집계
  const results = VOTE_ITEMS.map((item) => {
    let approve = 0;
    let reject = 0;
    for (const row of rows) {
      const v = row.votes?.[item.id];
      if (v === true) approve++;
      else if (v === false) reject++;
    }
    const counted = approve + reject;
    return {
      id: item.id,
      name: item.name,
      role: item.role,
      approve,
      reject,
      approveRate: counted > 0 ? Math.round((approve / counted) * 1000) / 10 : 0,
    };
  });

  return NextResponse.json({
    total: rows.length,
    latestAt: rows[0]?.voted_at ?? null,
    results,
  });
}
