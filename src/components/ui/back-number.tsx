const BACK_NO_STYLES: Record<number, { bg: string; text: string; ring: string }> = {
  1: { bg: "bg-white", text: "text-neutral-900", ring: "ring-neutral-300" },
  2: { bg: "bg-neutral-900", text: "text-white", ring: "ring-neutral-700" },
  3: { bg: "bg-red-500", text: "text-white", ring: "ring-red-400" },
  4: { bg: "bg-blue-500", text: "text-white", ring: "ring-blue-400" },
  5: { bg: "bg-yellow-400", text: "text-neutral-900", ring: "ring-yellow-300" },
  6: { bg: "bg-emerald-500", text: "text-white", ring: "ring-emerald-400" },
  7: { bg: "bg-pink-400", text: "text-white", ring: "ring-pink-300" },
};

const FALLBACK = { bg: "bg-neutral-200", text: "text-neutral-700", ring: "ring-neutral-300" };

export function BackNumber({ no }: { no: number }) {
  const s = BACK_NO_STYLES[no] ?? FALLBACK;
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-extrabold shadow-sm ring-1 ${s.bg} ${s.text} ${s.ring}`}
    >
      {no}
    </span>
  );
}
