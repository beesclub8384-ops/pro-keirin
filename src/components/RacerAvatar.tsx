import Image from "next/image";
import { splitKoreanName } from "@/lib/racer-avatar";

interface Props {
  name: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}

export default function RacerAvatar({
  name,
  photoUrl,
  size = 32,
  className = "",
}: Props) {
  const { surname } = splitKoreanName(name);
  const fontSize = size >= 40 ? "text-base" : "text-sm";

  // 선수 사진 비노출 (선수 요청) - 복원 시 이 조건 제거 (displayPhotoUrl = photoUrl)
  const HIDE_PHOTOS: boolean = true;
  const displayPhotoUrl = HIDE_PHOTOS ? null : photoUrl;

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative flex-shrink-0 overflow-hidden rounded-full border border-border ${className}`}
    >
      {displayPhotoUrl ? (
        <Image
          src={displayPhotoUrl}
          alt={name}
          fill
          sizes={`${size}px`}
          className="object-cover"
          unoptimized
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center bg-muted font-bold text-muted-foreground ${fontSize}`}
        >
          {surname || "?"}
        </div>
      )}
    </div>
  );
}
