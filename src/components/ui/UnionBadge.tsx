interface UnionBadgeProps {
  isUnion: boolean;
}

export function UnionBadge({ isUnion }: UnionBadgeProps) {
  if (!isUnion) return null;
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold ml-1"
      title="프로경륜선수조합 소속"
    >
      P
    </span>
  );
}
