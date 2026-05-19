import { getVideoUrl } from "@/lib/video-url";

interface Props {
  venue: string | null | undefined;
  year?: number | null;
  round: string | number | null | undefined;
  day: number | null | undefined;
  raceNo: number | null | undefined;
  date: string | null | undefined;
  className?: string;
}

/** 경주 영상 보기 버튼. URL 생성 불가 시 아무것도 렌더하지 않음. */
export function VideoButton({ venue, year, round, day, raceNo, date, className }: Props) {
  const url = getVideoUrl(venue, year ?? null, round, day, raceNo, date);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={
        className ??
        "inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand hover:bg-brand/20 transition-colors whitespace-nowrap"
      }
    >
      ▶ 영상
    </a>
  );
}
