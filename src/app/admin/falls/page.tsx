"use client";

/**
 * 낙차 대장 (/admin/falls) — 1단계: 조회 전용
 *
 * 화면이 지키는 원칙:
 *  - 낙차/사고와 실격은 **다른 배지**로 표시한다 (한 선수가 둘 다일 수 있다)
 *  - 완주 후 낙차(골인후낙차 등)는 착순이 있는 기록이라 경주 중 낙차와 구분한다
 *  - 사고 0건을 그냥 "0"으로 쓰지 않는다. 그 날·구장의 경주 수·선수 행 수를 같이 보여줘
 *    실제 무사고인지 수집이 안 된 건지 보는 사람이 판단할 수 있게 한다
 *  - racer_id 가 확정되지 않은 행은 숨기지 않고 경고로 남긴다
 *
 * 로그인은 기존 관리자 쿠키(interview_admin_token)를 그대로 쓴다.
 * 이 화면의 게이팅은 UX 용이고, 실제 차단은 /api/admin/falls 의 withAdmin() 이 한다.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, LockKeyhole, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const VENUES = ["광명", "창원", "부산"] as const;
type VenueFilter = "all" | (typeof VENUES)[number];

interface FallRow {
  key: string;
  date: string;
  venue: string;
  raceNo: number;
  backNo: number;
  racerId: string | null;
  name: string;
  rank: number | null;
  grade: string | null;
  fallType: "낙차" | "사고" | null;
  withdrawalRaw: string | null;
  isDisqualified: boolean;
  disqualifiedRaw: string | null;
  finishNote: string | null;
  didNotFinish: boolean;
  matched: boolean;
}

interface DayVenueTotals {
  date: string;
  venue: string;
  raceCount: number;
  entryCount: number;
  dcEntryCount: number;
  fallCount: number;
}

interface FallWarning {
  date: string;
  venue: string;
  dcEntryCount: number;
  entryCount: number;
  missingResults: number;
  missingEntries: number;
  kind: string;
}

interface FallsReport {
  range: { from: string; to: string; venue: string };
  rows: FallRow[];
  totals: DayVenueTotals[];
  warnings: FallWarning[];
  latestDataDate: string | null;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayVenueKey(date: string, venue: string): string {
  return `${date}|${venue}`;
}

export default function FallsLedgerPage() {
  const [authState, setAuthState] = useState<"checking" | "in" | "out">(
    "checking",
  );
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const today = new Date();
  const [from, setFrom] = useState(
    toISODate(new Date(today.getTime() - 29 * 86_400_000)),
  );
  const [to, setTo] = useState(toISODate(today));
  const [venue, setVenue] = useState<VenueFilter>("all");

  const [data, setData] = useState<FallsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------- 인증 상태
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/interview/admin/auth", {
          cache: "no-store",
        });
        const json = await res.json();
        if (cancelled) return;
        setAuthState(json.authenticated ? "in" : "out");
      } catch {
        if (!cancelled) setAuthState("out");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/interview/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAuthError(json.error ?? "로그인에 실패했습니다");
        return;
      }
      setPasswordInput("");
      setAuthState("in");
    } catch {
      setAuthError("네트워크 오류");
    } finally {
      setAuthLoading(false);
    }
  }

  // ---------------------------------------------------------------- 조회
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to, venue });
      const res = await fetch(`/api/admin/falls?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) setAuthState("out");
        setError(json.error ?? `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(json as FallsReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, venue]);

  useEffect(() => {
    if (authState === "in") void load();
  }, [authState, load]);

  // ---------------------------------------------------------------- 비밀번호 화면
  if (authState === "checking") {
    return (
      <main className="p-8 text-center text-muted-foreground">
        확인 중...
      </main>
    );
  }

  if (authState === "out") {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center p-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LockKeyhole className="size-5" />
              관리자 전용
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              비밀번호를 입력하면 낙차 대장이 열립니다.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="비밀번호"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="h-12 text-base"
                autoFocus
              />
              {authError && (
                <p className="text-sm font-medium text-destructive">
                  {authError}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full text-base"
                disabled={authLoading}
              >
                {authLoading ? "확인 중..." : "들어가기"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  // ---------------------------------------------------------------- 대장 화면
  // 사고가 있는 날짜·구장만이 아니라, 조회 기간의 모든 날짜·구장을 순서대로 보여준다
  // (0건인 날의 분모를 봐야 수집 누락을 알아챌 수 있다)
  const groups = (data?.totals ?? []).map((t) => ({
    totals: t,
    rows: (data?.rows ?? []).filter(
      (r) => r.date === t.date && r.venue === t.venue,
    ),
  }));

  const fallSum = (data?.rows ?? []).filter((r) => r.fallType !== null).length;
  const dqSum = (data?.rows ?? []).filter((r) => r.isDisqualified).length;
  const finishSum = (data?.rows ?? []).filter((r) => r.finishNote !== null).length;
  const unmatchedSum = (data?.rows ?? []).filter((r) => !r.matched).length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 pb-16">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">낙차 대장</h1>
          <p className="text-sm text-muted-foreground">
            낙차·사고·실격 조회 (읽기 전용)
            {data?.latestDataDate && (
              <> · 최종 데이터 일자 {data.latestDataDate}</>
            )}
          </p>
        </div>
        <Link
          href="/vault"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowLeft className="size-4" />
          대납으로
        </Link>
      </div>

      {/* 필터 */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">시작일</span>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">종료일</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-10"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">구장</span>
            <Select
              value={venue}
              onValueChange={(v) => setVenue(v as VenueFilter)}
            >
              <SelectTrigger className="h-10 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {VENUES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button onClick={() => void load()} disabled={loading} className="h-10">
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            {loading ? "조회 중..." : "조회"}
          </Button>
          <p className="text-xs text-muted-foreground">최대 92일</p>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6 text-sm font-medium text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {/* 요약 */}
      {data && (
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 pt-6 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">낙차·사고</p>
              <p className="text-2xl font-bold text-orange-600">{fallSum}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">실격</p>
              <p className="text-2xl font-bold text-red-600">{dqSum}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">골인 후 특이</p>
              <p className="text-2xl font-bold text-slate-600">{finishSum}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">racer_id 미확정</p>
              <p
                className={
                  unmatchedSum > 0
                    ? "text-2xl font-bold text-amber-600"
                    : "text-2xl font-bold text-slate-400"
                }
              >
                {unmatchedSum}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 경고 줄 — 출주표는 있는데 결과가 없는 날짜·구장 */}
      {data && data.warnings.length > 0 && (
        <Card className="border-amber-400 bg-amber-50/70">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <AlertTriangle className="size-4" />
              수집 불일치 {data.warnings.length}건
            </CardTitle>
            <p className="text-xs text-amber-800">
              출주표와 결과의 행 수가 어긋난 날짜·구장입니다. 이 구간의 낙차
              건수는 실제보다 적을 수 있습니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.warnings.map((w) => (
              <div
                key={dayVenueKey(w.date, w.venue)}
                className="flex flex-wrap items-center gap-x-2 text-amber-900"
              >
                <span className="font-semibold">
                  {w.date} · {w.venue}
                </span>
                <span className="rounded bg-amber-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                  {w.kind}
                </span>
                <span className="text-amber-800">
                  출주표 {w.dcEntryCount}행 / 결과 {w.entryCount}행
                  {w.missingResults > 0 && <> · 결과 없는 엔트리 {w.missingResults}</>}
                  {w.missingEntries > 0 && <> · 출주표 없는 결과 {w.missingEntries}</>}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 날짜·구장별 목록 */}
      {data && groups.length === 0 && !loading && (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            이 기간에 적재된 경주가 없습니다. (휴장일 수도, 수집이 안 된 것일 수도
            있습니다 — 수집 실행 시각은 DB에 기록되지 않습니다)
          </CardContent>
        </Card>
      )}

      {groups.map(({ totals, rows }) => (
        <Card key={dayVenueKey(totals.date, totals.venue)}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-x-2 text-base">
              <span>
                {totals.date} · {totals.venue}
              </span>
              {totals.raceCount === 0 ? (
                <span className="rounded bg-slate-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                  데이터 없음(수집 미확인)
                </span>
              ) : (
                <span className="text-sm font-normal text-muted-foreground">
                  {totals.raceCount}경주 / {totals.entryCount}행
                  {totals.dcEntryCount !== totals.entryCount && (
                    <span className="text-amber-700">
                      {" "}
                      (출주표 {totals.dcEntryCount}행)
                    </span>
                  )}
                  {" · "}
                  {rows.length === 0 ? (
                    <span className="text-slate-500">사고 0건</span>
                  ) : (
                    <span className="font-semibold text-orange-600">
                      {rows.length}건
                    </span>
                  )}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          {rows.length > 0 && (
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3">경주</th>
                    <th className="pb-2 pr-3">차번</th>
                    <th className="pb-2 pr-3">선수</th>
                    <th className="pb-2 pr-3">racer_id</th>
                    <th className="pb-2 pr-3">착순</th>
                    <th className="pb-2 pr-3">낙차·사고</th>
                    <th className="pb-2 pr-3">실격</th>
                    <th className="pb-2 pr-3">골인 후</th>
                    <th className="pb-2">지급</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="py-2 pr-3">{r.raceNo}R</td>
                      <td className="py-2 pr-3">{r.backNo}</td>
                      <td className="py-2 pr-3 font-medium">{r.name}</td>
                      <td className="py-2 pr-3 text-xs">
                        {r.matched && r.racerId ? (
                          <span className="text-muted-foreground">
                            {r.racerId}
                          </span>
                        ) : (
                          <span
                            className="font-semibold text-amber-600"
                            title="출주표에서 선수를 찾지 못했습니다 (동명이인이면 확정 불가)"
                          >
                            ⚠ 미확정
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {r.rank ?? (
                          <span className="text-muted-foreground">미완주</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {r.fallType ? (
                          <span
                            className={
                              r.fallType === "낙차"
                                ? "rounded bg-orange-500 px-1.5 py-0.5 text-xs font-semibold text-white"
                                : "rounded bg-amber-600 px-1.5 py-0.5 text-xs font-semibold text-white"
                            }
                          >
                            {r.fallType}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {r.withdrawalRaw && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {r.withdrawalRaw}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {r.isDisqualified ? (
                          <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                            실격
                            {r.disqualifiedRaw &&
                              r.disqualifiedRaw !== "1" &&
                              ` ${r.disqualifiedRaw}`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {r.finishNote ? (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 font-medium text-slate-700">
                            {r.finishNote}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      {/* 2단계(통장 캡처 → 낙차위로금 지급)에서 채울 자리 */}
                      <td className="py-2 text-muted-foreground">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          )}
        </Card>
      ))}

      <p className="text-xs text-muted-foreground">
        착순이 있는 &quot;골인 후&quot; 기록은 완주 후 낙차로, 경주 중 낙차와 성격이
        다릅니다. 합산하지 마세요.
      </p>
    </main>
  );
}
