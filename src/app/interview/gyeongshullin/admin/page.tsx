"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Plus, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GyeongshullinRestaurant } from "@/lib/gyeongshullin";

export default function GyeongshullinAdminPage() {
  const [list, setList] = useState<GyeongshullinRestaurant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gyeongshullin/admin/restaurants", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setList(data);
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  const draftCount = list.filter((r) => r.status === "draft").length;
  const publishedCount = list.filter((r) => r.status === "published").length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-12">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            경슐랭 관리
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            공개됨 {publishedCount}건 · 임시저장 {draftCount}건
          </p>
        </div>
        <Link href="/interview/gyeongshullin/admin/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            새 가게
          </Button>
        </Link>
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
              등록된 가게가 없어요
            </p>
            <Link
              href="/interview/gyeongshullin/admin/new"
              className="mt-4 text-xs font-medium text-brand hover:underline"
            >
              첫 가게 등록하기 →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <Link
              key={r.id}
              href={`/interview/gyeongshullin/admin/${r.id}`}
              className="block"
            >
              <Card className="transition hover:border-brand/40 hover:shadow-sm">
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                    {r.foodPhotos[0] ? (
                      <Image
                        src={r.foodPhotos[0]}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ChefHat className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {r.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          r.status === "published"
                            ? "border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700"
                            : "border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-700"
                        }
                      >
                        {r.status === "published" ? "공개" : "초안"}
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {r.recommenderName}
                      {r.recommenderGrade && ` · ${r.recommenderGrade}`}
                      {r.recommenderRegion && ` · ${r.recommenderRegion}`}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {r.address}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
