import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { verifyAdmin } from '@/lib/auth/verify-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  // 쿠키 재검증 (보안 필수)
  const authorized = await verifyAdmin();
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // 전체 응답 조회 (통계용)
    const { data: responses, error } = await supabase
      .from('bank_survey_responses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[stats] DB error:', error);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    const responsesArr = responses ?? [];
    const total = responsesArr.length;

    const countBy = (field: string) => {
      const map = new Map<string, number>();
      for (const r of responsesArr) {
        const v = (r as Record<string, unknown>)[field];
        if (typeof v === 'string' && v) {
          map.set(v, (map.get(v) ?? 0) + 1);
        }
      }
      return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
    };

    const countByArray = (field: string) => {
      const map = new Map<string, number>();
      for (const r of responsesArr) {
        const v = (r as Record<string, unknown>)[field];
        if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === 'string') {
              map.set(item, (map.get(item) ?? 0) + 1);
            }
          }
        }
      }
      return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
    };

    const latestAt =
      (responsesArr[0] as Record<string, unknown> | undefined)?.created_at ?? null;

    // Q11 상금 계좌 이전 의향률
    const q11Counts = countBy('q11_transfer_intent');
    const positiveIntent =
      (q11Counts['혜택 확인 후 바로 옮길 의향 있음'] ?? 0) +
      (q11Counts['조건(금리 인하 폭)에 따라 검토'] ?? 0);
    const transferRate = total > 0 ? (positiveIntent / total) * 100 : 0;

    // Q20 금리 민감도 누적
    const q20 = countBy('q20_rate_threshold');
    const a03 = q20['0.3%p 이상 낮아지면 옮김'] ?? 0;
    const a05 = q20['0.5%p 이상 낮아지면 옮김'] ?? 0;
    const a07 = q20['0.7%p 이상 낮아지면 옮김'] ?? 0;
    const a10 = q20['1.0%p 이상 낮아져야 옮김'] ?? 0;
    const a15 = q20['1.5%p 이상 낮아져야 옮김'] ?? 0;
    const rateSensitivity = {
      '0.3%p': a03,
      '0.5%p': a03 + a05,
      '0.7%p': a03 + a05 + a07,
      '1.0%p': a03 + a05 + a07 + a10,
      '1.5%p': a03 + a05 + a07 + a10 + a15,
    };

    return NextResponse.json({
      total,
      target: 217,
      progressRate: total > 0 ? ((total / 217) * 100).toFixed(1) : '0.0',
      latestAt,

      // 기본 분포
      byGrade: countBy('q1_grade'),
      byAge: countBy('q2_age_group'),
      byCareer: countBy('q3_career'),
      byRegion: countBy('q4_region'),

      // 핵심 협상 지표
      byPrizeBank: countBy('q9_prize_bank'),
      byTransferIntent: q11Counts,
      transferIntentRate: transferRate.toFixed(1),

      // 금리 민감도 (누적)
      rateSensitivity,

      // 걱정거리
      byConcerns: countByArray('q22_concerns'),

      // 대환·신규 의향
      byRefinanceIntent: countBy('q19_refinance_intent'),
      byNewLoanIntent: countBy('q21_new_loan_intent'),
    });
  } catch (e) {
    console.error('[stats] error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
