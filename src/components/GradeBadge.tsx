interface Props {
  /** "특선" | "우수" | "선발" (또는 "특선급" 등 접미사 포함). 인식 안 되면 렌더링 안 함. */
  grade: string | null;
  size?: number;
  className?: string;
}

type GradeKey = "특선" | "우수" | "선발";

/** 등급별 색상 — 공통: 검정 원 + 흰 별 or 검정 별 */
const GRADE_STYLES: Record<GradeKey, { band: string; star: string }> = {
  특선: { band: "#DC2626", star: "#FFFFFF" }, // 빨간 띠 + 흰 별
  우수: { band: "#16A34A", star: "#FFFFFF" }, // 초록 띠 + 흰 별
  선발: { band: "#FFFFFF", star: "#0A0A0A" }, // 흰 띠 + 검정 별
};

/**
 * 자유 문자열(예: "우수", "우수급", "우수결승")을 등급 키로 정규화.
 * 인식되지 않으면 null.
 */
function normalizeGrade(grade: string | null): GradeKey | null {
  if (!grade) return null;
  const s = grade.trim();
  if (s.startsWith("특선")) return "특선";
  if (s.startsWith("우수")) return "우수";
  if (s.startsWith("선발")) return "선발";
  return null;
}

// viewBox 100x100 기준 좌표 (원 r=50, 중앙 50,50)
// 가로 띠: 원 중앙을 가로지르는 세그먼트 (y=31~69, 약 38%). clipPath 없이 원호로 직접 그린다.
const BAND_PATH =
  "M 3.75,31 L 96.25,31 A 50,50 0 0 1 96.25,69 L 3.75,69 A 50,50 0 0 1 3.75,31 Z";
// 5각 별 (중앙 배치, 띠 안에 들어가도록 크기 조정 → 어느 등급이든 대비 확보)
const STAR_POINTS =
  "50,32 54.23,44.18 67.12,44.44 56.85,52.22 60.58,64.56 50,57.2 39.42,64.56 43.15,52.22 32.88,44.44 45.77,44.18";

export default function GradeBadge({ grade, size = 20, className }: Props) {
  const key = normalizeGrade(grade);
  if (!key) return null;
  const { band, star } = GRADE_STYLES[key];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${key}급`}
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    >
      <title>{`${key}급`}</title>
      {/* 검정 원 (배경) */}
      <circle cx="50" cy="50" r="50" fill="#0A0A0A" />
      {/* 가로 띠 (원에 맞게 clip된 세그먼트) */}
      <path d={BAND_PATH} fill={band} />
      {/* 별 */}
      <polygon points={STAR_POINTS} fill={star} />
    </svg>
  );
}
