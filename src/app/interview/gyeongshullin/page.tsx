"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, MapPin, ChefHat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { GyeongshullinRestaurant } from "@/lib/gyeongshullin";

type ViewMode = "by_region" | "all";

function MiniRestaurantCard({ r }: { r: GyeongshullinRestaurant }) {
  const photo = r.foodPhotos[0];
  return (
    <Link
      href={`/interview/gyeongshullin/${r.id}`}
      className="block overflow-hidden rounded-lg border border-border bg-white transition hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full bg-muted">
        {photo ? (
          <Image
            src={photo}
            alt={r.name}
            fill
            sizes="(max-width: 640px) 50vw, 200px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ChefHat className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <div className="line-clamp-1 text-sm font-semibold text-foreground">
          {r.name}
        </div>
        <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {r.address}
        </div>
      </div>
    </Link>
  );
}

interface RegionGroup {
  region: string;
  restaurants: GyeongshullinRestaurant[];
}

function groupByRegion(list: GyeongshullinRestaurant[]): RegionGroup[] {
  const map = new Map<string, RegionGroup>();
  for (const r of list) {
    const key = r.region || "기타";
    if (!map.has(key)) {
      map.set(key, { region: key, restaurants: [] });
    }
    map.get(key)!.restaurants.push(r);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.region.localeCompare(b.region),
  );
}

export default function GyeongshullinPage() {
  const [list, setList] = useState<GyeongshullinRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("by_region");

  useEffect(() => {
    fetch("/api/gyeongshullin/published", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setList(data);
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  const regionGroups = useMemo(() => groupByRegion(list), [list]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <div className="mb-6">
        <h1
          className="text-2xl font-bold tracking-tight text-white sm:text-3xl"
          style={{
            textShadow:
              "0 2px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1), 1px 1px 0 rgba(0,0,0,0.6), -1px -1px 0 rgba(0,0,0,0.6), 1px -1px 0 rgba(0,0,0,0.6), -1px 1px 0 rgba(0,0,0,0.6)",
          }}
        >
          륜<span className="text-base align-middle opacity-80">(輪)</span>슐랭
        </h1>
        <p
          className="mt-1 text-sm font-medium text-white"
          style={{
            textShadow:
              "0 1px 3px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1), 1px 1px 0 rgba(0,0,0,0.5), -1px -1px 0 rgba(0,0,0,0.5)",
          }}
        >
          맛 없는 건 안 먹는 경륜선수들의 추천 맛집
        </p>
      </div>

      {/* 조합원 CTA — 맛집 제출 버튼 */}
      <div className="mb-4">
        <Link
          href="/interview/gyeongshullin/submit"
          className="flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-sm font-medium text-brand transition-colors hover:bg-brand/10"
        >
          + 조합원이라면, 추천하고 싶은 맛집이 있으신가요?
        </Link>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {(
          [
            { key: "by_region", label: "지역별" },
            { key: "all", label: "전체" },
          ] as const
        ).map((tab) => {
          const active = view === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-white text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-brand" />
        </div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <ChefHat className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              아직 등록된 가게가 없어요
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              선수들의 추천이 모이면 여기에 표시됩니다
            </p>
          </CardContent>
        </Card>
      ) : view === "by_region" ? (
        <div className="space-y-7">
          {regionGroups.map((g) => (
            <section key={g.region}>
              <div className="mb-3 flex items-center gap-2">
                <MapPin
                  className="h-4 w-4 text-white"
                  style={{
                    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))",
                  }}
                />
                <span
                  className="text-sm font-semibold text-white"
                  style={{
                    textShadow:
                      "0 1px 3px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1), 1px 1px 0 rgba(0,0,0,0.5), -1px -1px 0 rgba(0,0,0,0.5)",
                  }}
                >
                  {g.region}
                </span>
                <span
                  className="text-xs font-medium text-white"
                  style={{
                    textShadow:
                      "0 1px 3px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1)",
                  }}
                >
                  · {g.restaurants.length}곳
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {g.restaurants.map((r) => (
                  <MiniRestaurantCard key={r.id} r={r} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {list.map((r) => (
            <MiniRestaurantCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}
