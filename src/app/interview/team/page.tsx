"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import Image from "next/image";
import PhotoLightbox from "@/components/PhotoLightbox";
import { splitKoreanName } from "@/lib/racer-avatar";

const textShadow = "0 2px 4px rgba(0,0,0,0.5)";

// 선수 사진 비노출 (선수 요청) - 복원 시 false로 변경
const HIDE_PHOTOS: boolean = true;

interface Player {
  racerId: string;
  name: string;
  photoUrl: string | null;
}

interface RegionGroup {
  region: string;
  players: Player[];
}

export default function InterviewTeamPage() {
  const [regions, setRegions] = useState<RegionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRegion, setOpenRegion] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    fetch("/api/interview/team", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setRegions(json.regions ?? []);
        }
      })
      .catch(() => setError("데이터를 불러오지 못했습니다"))
      .finally(() => setLoading(false));
  }, []);

  const totalPlayers = regions.reduce((s, r) => s + r.players.length, 0);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/interview"
          className="inline-flex items-center gap-1 text-sm font-medium text-white/70 hover:text-white transition-colors"
          style={{ textShadow }}
        >
          <ChevronLeft className="h-4 w-4" />
          돌아가기
        </Link>
      </div>

      <h1
        className="text-2xl sm:text-3xl font-bold text-white mb-2"
        style={{ textShadow }}
      >
        팀
      </h1>
      {!loading && !error && (
        <p
          className="text-sm text-white/70 mb-8"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
        >
          프로경륜선수노동조합 소속 {totalPlayers}명
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-white/70" />
        </div>
      ) : error ? (
        <div className="rounded-xl bg-white/95 shadow-lg backdrop-blur-sm py-16 text-center">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : (
        <div className="rounded-xl bg-white/95 shadow-lg backdrop-blur-sm overflow-hidden divide-y divide-border">
          {regions.map((rg) => {
            const isOpen = openRegion === rg.region;
            return (
              <div key={rg.region}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenRegion(isOpen ? null : rg.region)
                  }
                  className="flex w-full items-center justify-between px-5 py-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-bold text-foreground">
                      {rg.region}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {rg.players.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-border bg-muted/30 px-5 py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {rg.players.map((p) => {
                        const { surname } = splitKoreanName(p.name);
                        return (
                          <div
                            key={p.racerId}
                            className="flex items-center gap-2.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand/30"
                          >
                            {!HIDE_PHOTOS &&
                              (p.photoUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setLightboxPhoto(p.photoUrl)}
                                  className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border border-border cursor-zoom-in"
                                  aria-label={`${p.name} 사진 크게 보기`}
                                >
                                  <Image
                                    src={p.photoUrl}
                                    alt={p.name}
                                    fill
                                    sizes="32px"
                                    className="object-cover"
                                    unoptimized
                                  />
                                </button>
                              ) : (
                                <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border border-border">
                                  <div className="flex h-full w-full items-center justify-center bg-muted text-sm font-bold text-muted-foreground">
                                    {surname}
                                  </div>
                                </div>
                              ))}
                            <a
                              href={`https://www.kcycle.or.kr/racer/info/${p.racerId}/${currentYear}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex flex-1 min-w-0 items-center justify-between gap-2 hover:text-brand"
                            >
                              <span className="flex-1 truncate">{p.name}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {lightboxPhoto && (
        <PhotoLightbox
          photos={[lightboxPhoto]}
          startIndex={0}
          onClose={() => setLightboxPhoto(null)}
        />
      )}
    </div>
  );
}
