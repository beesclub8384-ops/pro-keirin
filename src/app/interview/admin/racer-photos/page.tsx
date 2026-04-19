"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Loader2,
  Search,
  Upload,
  X,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Racer {
  racerId: string;
  name: string;
  region: string;
  photoUrl: string | null;
}

function firstChar(name: string): string {
  const t = (name ?? "").trim();
  return t.length > 0 ? t.slice(0, 1) : "?";
}

export default function RacerPhotoAdminPage() {
  const [racers, setRacers] = useState<Racer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetRacerIdRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/interview/admin/racer-list", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (json.racers) setRacers(json.racers);
      })
      .catch(() => setError("선수 목록을 불러오지 못했습니다"))
      .finally(() => setLoading(false));
  }, []);

  function triggerUpload(racerId: string) {
    targetRacerIdRef.current = racerId;
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const racerId = targetRacerIdRef.current;
    e.target.value = "";
    if (!file || !racerId) return;

    setError(null);
    setUploadingId(racerId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("racerId", racerId);
      const res = await fetch("/api/interview/admin/racer-photo", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "업로드 실패");
      }
      setRacers((prev) =>
        prev.map((r) =>
          r.racerId === racerId ? { ...r, photoUrl: json.url as string } : r,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploadingId(null);
      targetRacerIdRef.current = null;
    }
  }

  async function handleDelete(racerId: string) {
    if (!confirm("사진을 삭제하시겠어요?")) return;
    setError(null);
    setUploadingId(racerId);
    try {
      const res = await fetch(
        `/api/interview/admin/racer-photo?racerId=${encodeURIComponent(racerId)}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "삭제 실패");
      setRacers((prev) =>
        prev.map((r) =>
          r.racerId === racerId ? { ...r, photoUrl: null } : r,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setUploadingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return racers;
    return racers.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.region.toLowerCase().includes(q) ||
        r.racerId.includes(q),
    );
  }, [racers, query]);

  const photoCount = racers.filter((r) => r.photoUrl).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-12">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFileSelected}
      />

      <div className="mb-5">
        <Link
          href="/interview/admin"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          관리자 홈
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground">
          선수 사진 관리
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          전체 {racers.length}명 · 사진 등록 {photoCount}명
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="선수 이름, 지역 검색..."
          className="w-full rounded-lg border border-border bg-white py-2.5 pl-10 pr-3 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-brand" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <Users className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {query ? "검색 결과가 없어요" : "선수 목록이 비어있어요"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const isBusy = uploadingId === r.racerId;
            return (
              <Card key={r.racerId}>
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border border-border">
                    {r.photoUrl ? (
                      <Image
                        src={r.photoUrl}
                        alt={r.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-base font-bold text-muted-foreground">
                        {firstChar(r.name)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {r.name}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {r.region}
                    </div>
                  </div>

                  <div className="flex gap-1.5">
                    {r.photoUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(r.racerId)}
                        disabled={isBusy}
                        className="border-red-200 text-red-600 hover:bg-red-50 px-2"
                        aria-label="사진 삭제"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => triggerUpload(r.racerId)}
                      disabled={isBusy}
                      className="gap-1"
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {r.photoUrl ? "교체" : "업로드"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
