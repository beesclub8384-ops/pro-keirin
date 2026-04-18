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
import { Badge } from "@/components/ui/badge";
import {
  naverMapUrl,
  type GyeongshullinRestaurant,
} from "@/lib/gyeongshullin";

const GRADE_COLORS: Record<string, string> = {
  "특선": "bg-red-100 text-red-700 border-red-200",
  "우수": "bg-blue-100 text-blue-700 border-blue-200",
  "선발": "bg-emerald-100 text-emerald-700 border-emerald-200",
};

function gradeColor(grade: string): string {
  return GRADE_COLORS[grade] ?? "bg-zinc-100 text-zinc-700 border-zinc-200";
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function GyeongshullinDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [data, setData] = useState<GyeongshullinRestaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch("/api/gyeongshullin/published")
      .then((res) => res.json())
      .then((all: GyeongshullinRestaurant[]) => {
        if (!Array.isArray(all)) {
          setNotFound(true);
          return;
        }
        const found = all.find((r) => String(r.id) === id);
        if (found) {
          setData(found);
        } else {
          setNotFound(true);
        }
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
              href="/gyeongshullin"
              className="mt-4 text-xs font-medium text-brand hover:underline"
            >
              ← 경슐랭으로 돌아가기
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const mainPhoto = data.foodPhotos[0];
  const otherPhotos = data.foodPhotos.slice(1);

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <div className="px-4 pt-4">
        <Link
          href="/gyeongshullin"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          경슐랭
        </Link>
      </div>

      <div className="relative mt-3 aspect-[4/3] w-full bg-muted sm:mx-4 sm:mt-4 sm:aspect-[16/9] sm:overflow-hidden sm:rounded-xl">
        {mainPhoto ? (
          <Image
            src={mainPhoto}
            alt={data.name}
            fill
            sizes="(max-width: 640px) 100vw, 720px"
            className="object-cover"
            priority
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ChefHat className="h-12 w-12" />
          </div>
        )}
      </div>

      <div className="px-4 pt-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {data.name}
        </h1>
        {data.menu && (
          <p className="mt-1 text-sm text-muted-foreground">{data.menu}</p>
        )}
      </div>

      {/* Recommender */}
      <div className="mt-5 px-4">
        <Card className="border-brand/30 bg-brand/5">
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
                  <Badge
                    variant="outline"
                    className={`px-1.5 py-0 text-[10px] ${gradeColor(data.recommenderGrade)}`}
                  >
                    {data.recommenderGrade}
                  </Badge>
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
              href={naverMapUrl(`${data.name} ${data.address}`)}
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
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <UtensilsCrossed className="h-3 w-3" />
            메뉴판
          </div>
          <div className="grid grid-cols-1 gap-2">
            {data.menuPhotos.map((url, i) => (
              <div
                key={`menu-${i}`}
                className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-muted"
              >
                <Image
                  src={url}
                  alt={`${data.name} 메뉴판 ${i + 1}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 720px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other food photos */}
      {otherPhotos.length > 0 && (
        <div className="mt-5 px-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <ImageIcon className="h-3 w-3" />
            사진
          </div>
          <div className="grid grid-cols-2 gap-2">
            {otherPhotos.map((url, i) => (
              <div
                key={`photo-${i}`}
                className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted"
              >
                <Image
                  src={url}
                  alt={`${data.name} ${i + 2}`}
                  fill
                  sizes="(max-width: 640px) 50vw, 360px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
