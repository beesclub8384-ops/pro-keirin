import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { verifyAdmin } from '@/lib/auth/verify-admin';
import {
  NEGATIVE_ACCOUNT_MIDPOINT,
  CREDIT_LOAN_MIDPOINT,
  MORTGAGE_MIDPOINT,
} from '@/lib/survey/amount-parser';

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

    // ===== 고급 지표 계산 =====

    // 대환 의향이 긍정적인 응답자만 필터
    const positiveRefinancers = responsesArr.filter((r) => {
      const intent = (r as Record<string, unknown>).q19_refinance_intent;
      return (
        intent === '적극적으로 대환할 의향 있음' ||
        intent === '조건 보고 긍정적으로 검토'
      );
    });

    // 1. 대환 시장 규모 추정
    const calcTotalLoan = (arr: typeof responsesArr): number => {
      let sum = 0;
      for (const r of arr) {
        const row = r as Record<string, unknown>;
        const neg = row.q14_negative_account_limit as string | null;
        const credit = row.q15_credit_loan_balance as string | null;
        const mortgage = row.q16_mortgage_balance as string | null;
        if (neg && NEGATIVE_ACCOUNT_MIDPOINT[neg]) sum += NEGATIVE_ACCOUNT_MIDPOINT[neg];
        if (credit && CREDIT_LOAN_MIDPOINT[credit]) sum += CREDIT_LOAN_MIDPOINT[credit];
        if (mortgage && MORTGAGE_MIDPOINT[mortgage]) sum += MORTGAGE_MIDPOINT[mortgage];
      }
      return sum;
    };

    const totalMarketSize = calcTotalLoan(responsesArr);
    const refinancableMarketSize = calcTotalLoan(positiveRefinancers);

    // 2. 금리별 대환 시나리오
    const rateLevels = ['0.3%p', '0.5%p', '0.7%p', '1.0%p', '1.5%p'] as const;
    const rateThresholdMap: Record<string, string[]> = {
      '0.3%p': ['0.3%p 이상 낮아지면 옮김'],
      '0.5%p': ['0.3%p 이상 낮아지면 옮김', '0.5%p 이상 낮아지면 옮김'],
      '0.7%p': [
        '0.3%p 이상 낮아지면 옮김',
        '0.5%p 이상 낮아지면 옮김',
        '0.7%p 이상 낮아지면 옮김',
      ],
      '1.0%p': [
        '0.3%p 이상 낮아지면 옮김',
        '0.5%p 이상 낮아지면 옮김',
        '0.7%p 이상 낮아지면 옮김',
        '1.0%p 이상 낮아져야 옮김',
      ],
      '1.5%p': [
        '0.3%p 이상 낮아지면 옮김',
        '0.5%p 이상 낮아지면 옮김',
        '0.7%p 이상 낮아지면 옮김',
        '1.0%p 이상 낮아져야 옮김',
        '1.5%p 이상 낮아져야 옮김',
      ],
    };

    const rateScenarios: Record<string, { count: number; amount: number }> = {};
    for (const level of rateLevels) {
      const eligible = responsesArr.filter((r) => {
        const t = (r as Record<string, unknown>).q20_rate_threshold;
        return typeof t === 'string' && rateThresholdMap[level].includes(t);
      });
      rateScenarios[level] = {
        count: eligible.length,
        amount: calcTotalLoan(eligible),
      };
    }

    // 3. 등급별 × 금리 민감도 교차분석
    const gradeRateMatrix: Record<string, Record<string, number>> = {
      특선: { '0.3%p': 0, '0.5%p': 0, '0.7%p': 0, '1.0%p': 0, '1.5%p': 0, '상관없이 유지': 0 },
      우수: { '0.3%p': 0, '0.5%p': 0, '0.7%p': 0, '1.0%p': 0, '1.5%p': 0, '상관없이 유지': 0 },
      선발: { '0.3%p': 0, '0.5%p': 0, '0.7%p': 0, '1.0%p': 0, '1.5%p': 0, '상관없이 유지': 0 },
    };
    for (const r of responsesArr) {
      const row = r as Record<string, unknown>;
      const grade = row.q1_grade as string;
      const threshold = row.q20_rate_threshold as string;
      if (!grade || !gradeRateMatrix[grade]) continue;
      if (threshold?.includes('0.3%p')) gradeRateMatrix[grade]['0.3%p']++;
      else if (threshold?.includes('0.5%p')) gradeRateMatrix[grade]['0.5%p']++;
      else if (threshold?.includes('0.7%p')) gradeRateMatrix[grade]['0.7%p']++;
      else if (threshold?.includes('1.0%p')) gradeRateMatrix[grade]['1.0%p']++;
      else if (threshold?.includes('1.5%p')) gradeRateMatrix[grade]['1.5%p']++;
      else if (threshold?.includes('상관없이')) gradeRateMatrix[grade]['상관없이 유지']++;
    }

    // 4. 현재 은행별 × 대환 의향 교차분석
    const bankRefinanceMatrix: Record<string, { total: number; positive: number }> = {};
    for (const r of responsesArr) {
      const row = r as Record<string, unknown>;
      const bank = row.q9_prize_bank as string;
      const intent = row.q19_refinance_intent as string;
      if (!bank) continue;
      if (!bankRefinanceMatrix[bank]) bankRefinanceMatrix[bank] = { total: 0, positive: 0 };
      bankRefinanceMatrix[bank].total++;
      if (
        intent === '적극적으로 대환할 의향 있음' ||
        intent === '조건 보고 긍정적으로 검토'
      ) {
        bankRefinanceMatrix[bank].positive++;
      }
    }

    // 5. 권역별 × 설명회 참석 의향
    const regionSessionMatrix: Record<string, { total: number; willing: number }> = {};
    for (const r of responsesArr) {
      const row = r as Record<string, unknown>;
      const region = row.q4_region as string;
      const attendance = row.q28_session_attendance as string;
      if (!region) continue;
      if (!regionSessionMatrix[region]) regionSessionMatrix[region] = { total: 0, willing: 0 };
      regionSessionMatrix[region].total++;
      if (
        attendance &&
        attendance !== '관심 없음' &&
        attendance !== '자료만 서면으로 받아보고 싶음 (설명회 불참)'
      ) {
        regionSessionMatrix[region].willing++;
      }
    }

    // 6. 다상품 고객 잠재력 지수 (Q24 평균 선택 개수)
    let totalProductInterest = 0;
    let productRespondents = 0;
    for (const r of responsesArr) {
      const products = (r as Record<string, unknown>).q24_new_products;
      if (Array.isArray(products)) {
        const realProducts = products.filter(
          (p) =>
            typeof p === 'string' &&
            p !== '해당 없음 (대출 외에 추가 가입 의향 없음)'
        );
        totalProductInterest += realProducts.length;
        productRespondents++;
      }
    }
    const avgProductsPerPerson =
      productRespondents > 0
        ? (totalProductInterest / productRespondents).toFixed(1)
        : '0.0';

    // 7. 소득 구간별 × 대출 보유율
    const incomeLoanMatrix: Record<string, { total: number; hasLoan: number }> = {};
    for (const r of responsesArr) {
      const row = r as Record<string, unknown>;
      const income = row.q5_prize_range as string;
      const loans = row.q13_loans_held as string[] | null;
      if (!income) continue;
      if (!incomeLoanMatrix[income]) incomeLoanMatrix[income] = { total: 0, hasLoan: 0 };
      incomeLoanMatrix[income].total++;
      if (Array.isArray(loans) && loans.some((l) => l !== '해당 없음 (대출 보유하지 않음)')) {
        incomeLoanMatrix[income].hasLoan++;
      }
    }

    // 8. 일자별 응답 추이
    const dailyResponses: Record<string, number> = {};
    for (const r of responsesArr) {
      const createdAt = (r as Record<string, unknown>).created_at as string;
      if (!createdAt) continue;
      const date = createdAt.slice(0, 10);
      dailyResponses[date] = (dailyResponses[date] ?? 0) + 1;
    }
    const dailyResponsesSorted = Object.fromEntries(
      Object.entries(dailyResponses).sort(([a], [b]) => a.localeCompare(b))
    );

    // 9. 대출 거절 경험률
    const rejectionCounts = countBy('q18_rejection_history');
    const rejectionExperienced =
      (rejectionCounts['여러 번 있음 (2회 이상)'] ?? 0) +
      (rejectionCounts['한 번 있음'] ?? 0);
    const rejectionRate =
      total > 0 ? ((rejectionExperienced / total) * 100).toFixed(1) : '0.0';

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

      // ===== 고급 지표 =====
      marketSize: {
        total: totalMarketSize,
        refinancable: refinancableMarketSize,
      },
      rateScenarios,
      gradeRateMatrix,
      bankRefinanceMatrix,
      regionSessionMatrix,
      avgProductsPerPerson,
      incomeLoanMatrix,
      dailyResponses: dailyResponsesSorted,
      rejectionRate,
      rejectionExperienced,
    });
  } catch (e) {
    console.error('[stats] error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
