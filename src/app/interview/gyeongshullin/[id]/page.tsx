"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Loader2,
  ArrowLeft,
  MapPin,
  ExternalLink,
  ChefHat,
  UtensilsCrossed,
  Quote,
  ImageIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import PhotoLightbox from "@/components/PhotoLightbox";
import {
  naverMapUrl,
  type GyeongshullinRestaurant,
} from "@/lib/gyeongshullin";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function GyeongshullinDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [data, setData] = useState<GyeongshullinRestaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  function openLightbox(photos: string[], startIndex: number) {
    setLightboxPhotos(photos);
    setLightboxIndex(startIndex);
    setLightboxOpen(true);
  }

  useEffect(() => {
    // 전체 목록을 받아 find하지 않고, 단건 API로 필요한 1건만 조회
    fetch(`/api/gyeongshullin/${id}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const r = (await res.json()) as GyeongshullinRestaurant;
        setData(r);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <ChefHat className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              해당 가게를 찾을 수 없어요
            </p>
            <Link
              href="/interview/gyeongshullin"
              className="mt-4 text-xs font-medium text-brand hover:underline"
            >
              ← 륜슐랭으로 돌아가기
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <div className="px-4 pt-4">
        <Link
          href="/interview/gyeongshullin"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          륜슐랭
        </Link>
      </div>

      <div className="px-4 pt-6">
        <h1
          className="text-2xl font-bold tracking-tight text-white sm:text-3xl"
          style={{
            textShadow:
              "0 2px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1), 1px 1px 0 rgba(0,0,0,0.6), -1px -1px 0 rgba(0,0,0,0.6), 1px -1px 0 rgba(0,0,0,0.6), -1px 1px 0 rgba(0,0,0,0.6)",
          }}
        >
          {data.name}
        </h1>
        {data.menu && (
          <p
            className="mt-1 text-sm font-medium text-white"
            style={{
              textShadow:
                "0 1px 3px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1)",
            }}
          >
            {data.menu}
          </p>
        )}
      </div>

      {/* Recommender */}
      <div className="mt-5 px-4">
        <Card className="border-brand/40 bg-white">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-base font-bold text-white">
              {data.recommenderName?.[0] ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-brand">
                추천 선수
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-sm font-bold text-foreground">
                  {data.recommenderName}
                </span>
                {data.recommenderGrade && (
                  <span className="text-xs text-muted-foreground">
                    {data.recommenderGrade}
                  </span>
                )}
                {data.recommenderRegion && (
                  <span className="text-xs text-muted-foreground">
                    · {data.recommenderRegion}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Memo */}
      {data.memo && (
        <div className="mt-5 px-4">
          <Card>
            <CardContent className="py-5">
              <Quote className="mb-2 h-4 w-4 text-brand" />
              <p className="text-sm leading-relaxed text-foreground">
                {data.memo}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Address */}
      <div className="mt-5 px-4">
        <Card>
          <CardContent className="py-4">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <MapPin className="h-3 w-3" />
              위치
            </div>
            <a
              href={naverMapUrl(data.name, data.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start justify-between gap-2"
            >
              <span className="text-sm text-foreground group-hover:text-brand">
                {data.address}
              </span>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground group-hover:text-brand" />
            </a>
            <p className="mt-1 text-[11px] text-muted-foreground">
              주소를 누르면 네이버 지도에서 열려요
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Menu photos */}
      {data.menuPhotos.length > 0 && (
        <div className="mt-5 px-4">
          <div
            className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white"
            style={{
              textShadow:
                "0 1px 3px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1)",
            }}
          >
            <UtensilsCrossed
              className="h-3 w-3"
              style={{
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))",
              }}
            />
            메뉴판
          </div>
          <div className="grid grid-cols-1 gap-2">
            {data.menuPhotos.map((url, i) => (
              <button
                type="button"
                key={`menu-${i}`}
                onClick={() => openLightbox(data.menuPhotos, i)}
                className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-muted cursor-zoom-in"
                aria-label="메뉴판 크게 보기"
              >
                <Image
                  src={url}
                  alt={`${data.name} 메뉴판 ${i + 1}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 720px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Other food photos */}
      {data.foodPhotos.length > 0 && (
        <div className="mt-5 px-4">
          <div
            className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white"
            style={{
              textShadow:
                "0 1px 3px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1)",
            }}
          >
            <ImageIcon
              className="h-3 w-3"
              style={{
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))",
              }}
            />
            사진
          </div>
          <div className="grid grid-cols-2 gap-2">
            {data.foodPhotos.map((url, i) => (
              <button
                type="button"
                key={`photo-${i}`}
                onClick={() => openLightbox(data.foodPhotos, i)}
                className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted cursor-zoom-in"
                aria-label="사진 크게 보기"
              >
                <Image
                  src={url}
                  alt={`${data.name} ${i + 1}`}
                  fill
                  sizes="(max-width: 640px) 50vw, 360px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {lightboxOpen && (
        <PhotoLightbox
          photos={lightboxPhotos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
