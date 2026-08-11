"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Copy,
  Check,
  MessageSquare,
  X,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AdminRequest {
  id: number;
  racerId: string | null;
  playerName: string;
  grade: string | null;
  region: string | null;
  formToken: string;
  status: "pending" | "sent" | "completed";
  restaurantId: number | null;
  sentAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

type FilterKey = "all" | "sent" | "completed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "sent", label: "발송됨" },
  { key: "completed", label: "완료" },
];

const STATUS_STYLE: Record<AdminRequest["status"], string> = {
  pending: "bg-zinc-100 text-zinc-700 border-zinc-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-green-100 text-green-700 border-green-200",
};

const STATUS_LABEL: Record<AdminRequest["status"], string> = {
  pending: "대기",
  sent: "발송됨",
  completed: "완료",
};

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function getFormUrl(token: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/interview/gyeongshullin/form/${token}`;
}

export default function GyeongshullinRequestsAdmin() {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showNew, setShowNew] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // 신규 요청 폼
  const [newName, setNewName] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function fetchRequests() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gyeongshullin/admin/requests", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "요청 목록을 불러오지 못했습니다");
      } else {
        setRequests(json.requests || []);
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRequests();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  const counts = useMemo(() => {
    const c = { all: requests.length, sent: 0, completed: 0 };
    for (const r of requests) {
      if (r.status === "sent") c.sent++;
      else if (r.status === "completed") c.completed++;
    }
    return c;
  }, [requests]);

  async function handleCreate() {
    setCreateError(null);
    if (!newName.trim()) {
      setCreateError("이름을 입력해주세요");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/gyeongshullin/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: newName.trim(),
          grade: newGrade.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCreateError(json.error || "생성 실패");
        return;
      }
      setNewName("");
      setNewGrade("");
      setShowNew(false);
      await fetchRequests();
    } catch {
      setCreateError("네트워크 오류");
    } finally {
      setCreating(false);
    }
  }

  async function copyUrl(r: AdminRequest) {
    const url = getFormUrl(r.formToken);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(r.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // 클립보드 접근 실패 시 프롬프트로 대체
      window.prompt("아래 URL을 복사해주세요:", url);
    }
  }

  async function handleDelete(id: number, playerName: string) {
    if (!confirm(`${playerName} 요청을 삭제할까요?`)) return;
    try {
      const res = await fetch(`/api/gyeongshullin/admin/requests/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "삭제 실패");
        return;
      }
      await fetchRequests();
    } catch {
      alert("네트워크 오류");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-12">
      {/* 헤더 */}
      <div className="mb-5">
        <Link
          href="/interview/gyeongshullin/admin"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          륜슐랭 관리
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              맛집 요청 관리
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              전체 {counts.all}건 · 발송 {counts.sent} · 완료 {counts.completed}
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setShowNew(!showNew)}
            className="gap-1.5"
          >
            {showNew ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showNew ? "닫기" : "새 요청"}
          </Button>
        </div>
      </div>

      {/* 신규 요청 폼 */}
      {showNew && (
        <Card className="mb-5 border-brand/30">
          <CardContent className="space-y-3 py-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                선수 이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="예: 노태양"
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                조합원 명단에서 자동으로 팀을 조회합니다
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                기수 (선택)
              </label>
              <input
                type="text"
                value={newGrade}
                onChange={(e) => setNewGrade(e.target.value)}
                placeholder="예: 25기"
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            {createError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {createError}
              </div>
            )}
            <Button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="w-full gap-1.5"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              요청 생성하기
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-white text-foreground hover:bg-muted"
              }`}
            >
              {f.label}
              <span
                className={`ml-1 text-[10px] ${
                  active ? "text-white/80" : "text-muted-foreground"
                }`}
              >
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-red-500">
            {error}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {filter === "all"
                ? "아직 요청이 없습니다. [새 요청]을 눌러 시작하세요."
                : `${FILTERS.find((f) => f.key === filter)?.label} 상태의 요청이 없습니다`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const isCopied = copiedId === r.id;
            return (
              <Card key={r.id}>
                <CardContent className="py-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-foreground">
                      {r.playerName}
                    </span>
                    {r.grade && (
                      <Badge variant="secondary" className="text-[11px]">
                        {r.grade}
                      </Badge>
                    )}
                    {r.region && (
                      <Badge variant="outline" className="text-[11px]">
                        {r.region}
                      </Badge>
                    )}
                    <span
                      className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span>생성: {formatDate(r.createdAt)}</span>
                    {r.sentAt && <span>발송: {formatDate(r.sentAt)}</span>}
                    {r.completedAt && (
                      <span>완료: {formatDate(r.completedAt)}</span>
                    )}
                  </div>

                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyUrl(r)}
                      className="flex-1 gap-1.5"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-green-600" />
                          복사됨
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          URL 복사
                        </>
                      )}
                    </Button>
                    {r.status === "completed" && r.restaurantId && (
                      <Link
                        href={`/interview/gyeongshullin/admin/${r.restaurantId}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-3 text-xs font-medium hover:bg-muted"
                      >
                        가게 편집
                      </Link>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(r.id, r.playerName)}
                      className="border-red-200 text-red-600 hover:bg-red-50 px-2"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
