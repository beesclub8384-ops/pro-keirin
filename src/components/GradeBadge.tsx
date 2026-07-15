interface Props {
  /** "SS" | "특선" | "우수" | "선발" (또는 "특선급" 등 접미사 포함). 인식 안 되면 렌더링 안 함. */
  grade: string | null;
  size?: number;
  className?: string;
}

type GradeKey = "SS" | "특선" | "우수" | "선발";

/** 등급별 색상 — bg(원 배경) / band(가로 띠) / star(별) */
const GRADE_STYLES: Record<GradeKey, { bg: string; band: string; star: string }> = {
  SS: { bg: "#DC2626", band: "url(#rainbow-gradient)", star: "#FFFFFF" }, // 빨간 원 + 무지개 띠 + 흰 별
  특선: { bg: "#0A0A0A", band: "#DC2626", star: "#FFFFFF" }, // 검정 원 + 빨간 띠 + 흰 별
  우수: { bg: "#0A0A0A", band: "#16A34A", star: "#FFFFFF" }, // 검정 원 + 초록 띠 + 흰 별
  선발: { bg: "#0A0A0A", band: "#FFFFFF", star: "#0A0A0A" }, // 검정 원 + 흰 띠 + 검정 별
};

/**
 * 자유 문자열(예: "SS", "우수", "우수급")을 등급 키로 정규화.
 * SS를 가장 먼저 체크 (S로 시작해 특선으로 빠지지 않도록). 인식 안 되면 null.
 */
function normalizeGrade(grade: string | null): GradeKey | null {
  if (!grade) return null;
  const s = grade.trim();
  if (s === "SS" || s.toUpperCase() === "SS") return "SS";
  if (s.startsWith("특선")) return "특선";
  if (s.startsWith("우수")) return "우수";
  if (s.startsWith("선발")) return "선발";
  return null;
}

// viewBox 100x100 기준 좌표 (원 r=50, 중앙 50,50)
// 가로 띠: 원 중앙을 가로지르는 세그먼트 (y=31~69, 약 38%). clipPath 없이 원호로 직접 그린다.
const BAND_PATH =
  "M 3.75,31 L 96.25,31 A 50,50 0 0 1 96.25,69 L 3.75,69 A 50,50 0 0 1 3.75,31 Z";

/** (cx,cy) 중심, 외/내 반지름의 5각 별(꼭짓점 위) polygon points 문자열 생성 */
function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const ao = ((-90 + i * 72) * Math.PI) / 180;
    const ai = ((-90 + 36 + i * 72) * Math.PI) / 180;
    pts.push(`${(cx + outer * Math.cos(ao)).toFixed(2)},${(cy + outer * Math.sin(ao)).toFixed(2)}`);
    pts.push(`${(cx + inner * Math.cos(ai)).toFixed(2)},${(cy + inner * Math.sin(ai)).toFixed(2)}`);
  }
  return pts.join(" ");
}

// 작은 별 3개를 띠 안에 가로로 균등 배치 (왼쪽/중앙/오른쪽)
const STAR_CENTERS = [30, 50, 70];
const STARS = STAR_CENTERS.map((cx) => starPoints(cx, 50, 10, 4));

export default function GradeBadge({ grade, size = 20, className }: Props) {
  const key = normalizeGrade(grade);
  if (!key) return null;
  const { bg, band, star } = GRADE_STYLES[key];

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
      {/* SS 무지개 띠 그라데이션 (SS일 때만 정의) */}
      {key === "SS" && (
        <defs>
          <linearGradient id="rainbow-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FF0000" />
            <stop offset="16.66%" stopColor="#FF8000" />
            <stop offset="33.33%" stopColor="#FFFF00" />
            <stop offset="50%" stopColor="#00FF00" />
            <stop offset="66.66%" stopColor="#0000FF" />
            <stop offset="83.33%" stopColor="#4B0082" />
            <stop offset="100%" stopColor="#8B00FF" />
          </linearGradient>
        </defs>
      )}
      {/* 원 배경 (SS=빨강, 그 외=검정) */}
      <circle cx="50" cy="50" r="50" fill={bg} />
      {/* 가로 띠 (원에 맞게 clip된 세그먼트) */}
      <path d={BAND_PATH} fill={band} />
      {/* 별 3개 (띠 안에 가로로 나란히) */}
      {STARS.map((points, i) => (
        <polygon key={i} points={points} fill={star} />
      ))}
    </svg>
  );
}
