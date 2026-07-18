// 노조 분류 뱃지
//   pkru  → 파란 원 'P'  (프로경륜선수노동조합, 2노조)
//   korru → 파란 원 + 흰 세모 (한국경륜노동조합, 1노조)
//   gray  → 회색 원 + 흰 세모 (회색지대/미분류)
//   그 외(null/undefined) → 무표시
export type UnionType = "pkru" | "gray" | "korru" | null | undefined;

interface UnionBadgeProps {
  unionType: UnionType;
}

export function UnionBadge({ unionType }: UnionBadgeProps) {
  if (unionType === "pkru") {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold ml-1"
        title="프로경륜선수노동조합(PKRU) 소속"
      >
        P
      </span>
    );
  }

  if (unionType === "korru") {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 ml-1"
        title="한국경륜노동조합(KORRU) 소속"
      >
        {/* 흰색 세모 (▲) — CSS 삼각형 */}
        <span
          className="block h-0 w-0 border-x-[3px] border-b-[5px] border-x-transparent border-b-white"
          aria-hidden="true"
        />
      </span>
    );
  }

  if (unionType === "gray") {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-400 ml-1"
        title="회색지대 (미조합/미분류)"
      >
        {/* 흰색 세모 (▲) — CSS 삼각형 */}
        <span
          className="block h-0 w-0 border-x-[3px] border-b-[5px] border-x-transparent border-b-white"
          aria-hidden="true"
        />
      </span>
    );
  }

  return null;
}
