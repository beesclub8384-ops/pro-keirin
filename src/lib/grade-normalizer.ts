// 경주 등급 라벨 정규화
// 광명/창원/부산 스크래퍼 공통 사용. 원본 라벨(grade_raw) → 기저등급(grade) 변환.
//
// 실측(2022~2025 전수 스캔) 결과 관측된 라벨:
//   선발 / 선발결승 / 선발준결(승)
//   우수 / 우수결승 / 우수준결(승)
//   특선 / 특선결승 / 특선준결(승)
//   경주취소 (등급 아님 → null)
// 모든 정상 라벨이 '선발'/'우수'/'특선' 접두사로 시작하므로 접두사 규칙으로 100% 매핑된다.
// 특별경주(그랑프리/GradeⅠ 등) 라벨은 전 기간 0건이었으나, 미래 등장 대비 접두사 미매칭은 null 처리.

export type BaseGrade = "선발" | "우수" | "특선";

/**
 * 원본 등급 라벨을 기저등급으로 정규화한다.
 * 접두사(선발/우수/특선) 미매칭 라벨(경주취소 등)은 null 반환.
 */
export function normalizeGrade(raw: string | null | undefined): BaseGrade | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s.startsWith("선발")) return "선발";
  if (s.startsWith("우수")) return "우수";
  if (s.startsWith("특선")) return "특선";
  return null;
}

// --- 검증용 예시 (단위 테스트 겸) ---
// tsx 로 이 파일을 직접 실행하면 self-test 가 돈다: npx tsx src/lib/grade-normalizer.ts
export const GRADE_EXAMPLES: ReadonlyArray<[string | null, BaseGrade | null]> = [
  ["선발", "선발"],
  ["선발결승", "선발"],
  ["선발준결승", "선발"],
  ["선발준결", "선발"],
  ["우수", "우수"],
  ["우수결승", "우수"],
  ["우수준결", "우수"],
  ["특선", "특선"],
  ["특선결승", "특선"],
  ["특선준결승", "특선"],
  ["경주취소", null],
  ["", null],
  [null, null],
  ["  우수결승  ", "우수"], // 공백 트림
];

export function runSelfTest(): void {
  let pass = 0;
  const fails: string[] = [];
  for (const [input, expected] of GRADE_EXAMPLES) {
    const got = normalizeGrade(input);
    if (got === expected) pass++;
    else fails.push(`  ✗ normalizeGrade(${JSON.stringify(input)}) = ${JSON.stringify(got)} (기대: ${JSON.stringify(expected)})`);
  }
  console.log(`grade-normalizer self-test: ${pass}/${GRADE_EXAMPLES.length} 통과`);
  if (fails.length) {
    console.error(fails.join("\n"));
    process.exit(1);
  }
}

// 직접 실행 시에만 self-test (Next 번들/일반 import 시에는 실행 안 함)
if (process.argv[1] && /grade-normalizer\.ts$/.test(process.argv[1])) {
  runSelfTest();
}
