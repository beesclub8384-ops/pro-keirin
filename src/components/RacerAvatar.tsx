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

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative flex-shrink-0 overflow-hidden rounded-full border border-border ${className}`}
    >
      {photoUrl ? (
        <Image
          src={photoUrl}
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
