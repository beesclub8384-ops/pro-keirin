"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import GyeongshullinAdminForm from "@/components/GyeongshullinAdminForm";
import type { GyeongshullinRestaurant } from "@/lib/gyeongshullin";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function GyeongshullinAdminEditPage({ params }: PageProps) {
  const { id } = use(params);
  const [data, setData] = useState<GyeongshullinRestaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/gyeongshullin/admin/restaurants/${id}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const json = (await res.json()) as GyeongshullinRestaurant;
        setData(json);
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
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <p className="text-sm font-medium text-foreground">
              해당 가게를 찾을 수 없어요
            </p>
            <Link
              href="/gyeongshullin/admin"
              className="mt-4 text-xs font-medium text-brand hover:underline"
            >
              ← 관리자 목록으로
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <GyeongshullinAdminForm initial={data} />;
}
