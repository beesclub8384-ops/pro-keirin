import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// 허용 가능한 DB 컬럼 목록 (화이트리스트)
const ALLOWED_COLUMNS = new Set([
  'anonymous_id',
  'q1_grade', 'q2_age_group', 'q3_career', 'q4_region',
  'q5_prize_range', 'q6_income_trend', 'q7_side_income', 'q8_income_doc',
  'q9_prize_bank', 'q9_prize_bank_other', 'q10_bank_reason',
  'q11_transfer_intent', 'q12_transfer_conditions',
  'q13_loans_held', 'q14_negative_account_limit', 'q15_credit_loan_balance',
  'q16_mortgage_balance', 'q17_avg_interest_rate', 'q18_rejection_history',
  'q19_refinance_intent', 'q20_rate_threshold', 'q21_new_loan_intent',
  'q22_concerns', 'q23_timing',
  'q24_new_products', 'q25_retirement_prep', 'q26_union_support', 'q26_other',
  'q27_documents', 'q27_other', 'q28_session_attendance',
  'q29_preferred_channel', 'q30_union_role', 'q30_other',
]);

// 필수 필드 (조건부 필드는 제외)
const REQUIRED_FIELDS = [
  'q1_grade', 'q2_age_group', 'q3_career', 'q4_region',
  'q5_prize_range', 'q6_income_trend', 'q7_side_income', 'q8_income_doc',
  'q9_prize_bank', 'q10_bank_reason', 'q11_transfer_intent', 'q12_transfer_conditions',
  'q13_loans_held', 'q18_rejection_history',
  'q19_refinance_intent', 'q20_rate_threshold', 'q21_new_loan_intent',
  'q22_concerns', 'q23_timing',
  'q24_new_products', 'q25_retirement_prep', 'q26_union_support',
  'q27_documents', 'q28_session_attendance', 'q29_preferred_channel', 'q30_union_role',
];

const MAX_TEXT_LENGTH = 500;
const MAX_ARRAY_LENGTH = 20;

function validatePayload(body: Record<string, unknown>): string | null {
  // anonymous_id 검증
  const anonId = body.anonymous_id;
  if (typeof anonId !== 'string' || anonId.length < 32 || anonId.length > 64) {
    return '유효하지 않은 응답자 식별자입니다.';
  }

  // 필수 필드 검증
  for (const field of REQUIRED_FIELDS) {
    const val = body[field];
    if (val === undefined || val === null) {
      return `필수 항목이 누락되었습니다: ${field}`;
    }
    if (Array.isArray(val) && val.length === 0) {
      return `필수 항목이 누락되었습니다: ${field}`;
    }
    if (typeof val === 'string' && val.trim() === '') {
      return `필수 항목이 누락되었습니다: ${field}`;
    }
  }

  // 길이 검증 + 화이트리스트
  for (const [key, val] of Object.entries(body)) {
    if (!ALLOWED_COLUMNS.has(key)) {
      return `허용되지 않은 필드: ${key}`;
    }
    if (typeof val === 'string' && val.length > MAX_TEXT_LENGTH) {
      return `필드 값이 너무 깁니다: ${key}`;
    }
    if (Array.isArray(val)) {
      if (val.length > MAX_ARRAY_LENGTH) {
        return `배열이 너무 깁니다: ${key}`;
      }
      for (const item of val) {
        if (typeof item !== 'string' || item.length > MAX_TEXT_LENGTH) {
          return `배열 값이 유효하지 않습니다: ${key}`;
        }
      }
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 유효성 검증
    const validationError = validatePayload(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // 화이트리스트 필드만 추출
    const cleanedPayload: Record<string, unknown> = {};
    for (const key of ALLOWED_COLUMNS) {
      if (key in body) {
        cleanedPayload[key] = body[key];
      }
    }

    // Supabase에 저장 (service_role로 RLS 우회)
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('bank_survey_responses')
      .insert(cleanedPayload);

    if (error) {
      // UNIQUE 제약 위반 (중복 응답)
      if (error.code === '23505') {
        return NextResponse.json(
          { error: '이미 응답이 제출되었습니다.' },
          { status: 409 }
        );
      }
      console.error('Survey insert error:', error);
      return NextResponse.json(
        { error: '저장 중 오류가 발생했습니다. 다시 시도해 주세요.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e: unknown) {
    console.error('Survey API error:', e);
    return NextResponse.json(
      { error: '알 수 없는 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// GET/PUT/DELETE는 차단
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
