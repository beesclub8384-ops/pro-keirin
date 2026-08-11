"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface RacerWithAvailability {
  name: string;
  grade: string;
  cohort: string;
  initial: string;
  recent30: number;
  recent90: number;
  lastRaceDate: string | null;
  totalDays: number;
  isDupName: boolean;
}

type ActivityStatus = "active" | "sporadic" | "inactive";

const CONSONANT_ORDER = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
// 등급은 높은 순(SS → B3)으로 정렬해서 표시
const GRADE_ORDER_DESC = ["SS", "S1", "S2", "S3", "A1", "A2", "A3", "B1", "B2", "B3"] as const;
const GRADE_FILTERS = ["전체", ...GRADE_ORDER_DESC] as const;
type GradeFilter = (typeof GRADE_FILTERS)[number];
const STATUS_FILTERS = ["전체", "active", "sporadic", "inactive"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function activityOf(r: RacerWithAvailability): ActivityStatus {
  if (r.recent30 >= 1) return "active";
  if (r.recent90 >= 1) return "sporadic";
  return "inactive";
}

// 정렬 키: SS(0) < S1(1) < ... < B3(9). 매칭 안 되면 99
function gradeSortKey(grade: string): number {
  const i = (GRADE_ORDER_DESC as readonly string[]).indexOf(grade);
  return i === -1 ? 99 : i;
}

// 10단계 등급 색상 (숫자가 낮을수록 진함)
function gradeBadgeClass(grade: string): string {
  switch (grade) {
    case "SS":
      return "bg-red-600 text-white border-transparent";
    case "S1":
      return "bg-purple-700 text-white border-transparent";
    case "S2":
      return "bg-purple-500 text-white border-transparent";
    case "S3":
      return "bg-purple-400 text-white border-transparent";
    case "A1":
      return "bg-blue-700 text-white border-transparent";
    case "A2":
      return "bg-blue-500 text-white border-transparent";
    case "A3":
      return "bg-blue-400 text-white border-transparent";
    case "B1":
      return "bg-green-700 text-white border-transparent";
    case "B2":
      return "bg-green-500 text-white border-transparent";
    case "B3":
      return "bg-green-400 text-white border-transparent";
    default:
      return "bg-gray-400 text-white border-transparent";
  }
}

const OUTSIDE_TEXT_STYLE: React.CSSProperties = {
  textShadow:
    "0 1px 3px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1), 1px 1px 0 rgba(0,0,0,0.5), -1px -1px 0 rgba(0,0,0,0.5)",
};

const STATUS_LABEL: Record<ActivityStatus, string> = {
  active: "🟢 활성",
  sporadic: "🟡 산발",
  inactive: "🔴 비활성",
};

function statusBorderClass(s: ActivityStatus): string {
  switch (s) {
    case "active":
      return "border-l-4 border-l-green-500";
    case "sporadic":
      return "border-l-4 border-l-yellow-500";
    case "inactive":
      return "border-l-4 border-l-red-400";
  }
}

interface Props {
  racers: RacerWithAvailability[];
  asOfDate: string | null;
  dupNames: string[];
}

export default function RacersClient({ racers, asOfDate, dupNames }: Props) {
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("전체");
  const [cohortFilter, setCohortFilter] = useState<string>("전체");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("전체");

  const cohortOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of racers) if (r.cohort) set.add(r.cohort);
    return Array.from(set).sort();
  }, [racers]);

  const gradeStats = useMemo(() => {
    const counts: Record<string, number> = { SS: 0, S: 0, A: 0, B: 0, "--": 0 };
    for (const r of racers) {
      if (r.grade === "SS") counts.SS++;
      else if (r.grade.startsWith("S")) counts.S++;
      else if (r.grade.startsWith("A")) counts.A++;
      else if (r.grade.startsWith("B")) counts.B++;
      else counts["--"]++;
    }
    return counts;
  }, [racers]);

  const activityStats = useMemo(() => {
    const counts: Record<ActivityStatus, number> = { active: 0, sporadic: 0, inactive: 0 };
    for (const r of racers) counts[activityOf(r)]++;
    return counts;
  }, [racers]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return racers.filter((r) => {
      if (q && !r.name.includes(q)) return false;
      if (gradeFilter !== "전체" && r.grade !== gradeFilter) return false;
      if (cohortFilter !== "전체" && r.cohort !== cohortFilter) return false;
      if (statusFilter !== "전체" && activityOf(r) !== statusFilter) return false;
      return true;
    });
  }, [racers, query, gradeFilter, cohortFilter, statusFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, RacerWithAvailability[]> = {};
    for (const r of filtered) {
      if (!map[r.initial]) map[r.initial] = [];
      map[r.initial].push(r);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const dg = gradeSortKey(a.grade) - gradeSortKey(b.grade);
        if (dg !== 0) return dg;
        return a.name.localeCompare(b.name, "ko");
      });
    }
    return CONSONANT_ORDER
      .filter((c) => map[c]?.length)
      .map((c) => ({ initial: c, list: map[c] }));
  }, [filtered]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-5">
      <div>
        <h1
          className="text-2xl sm:text-3xl font-bold text-white"
          style={OUTSIDE_TEXT_STYLE}
        >
          전체선수
        </h1>
        <p className="mt-1 text-sm text-white" style={OUTSIDE_TEXT_STYLE}>
          전체 {racers.length}명 · SS {gradeStats.SS} · S {gradeStats.S} · A {gradeStats.A} · B {gradeStats.B}
          {gradeStats["--"] > 0 ? ` · -- ${gradeStats["--"]}` : ""}
        </p>
        {asOfDate && (
          <p className="mt-0.5 text-xs text-white/90" style={OUTSIDE_TEXT_STYLE}>
            전 경기장 출전 기준 · {asOfDate}
            {dupNames.length > 0 ? ` · 동명이인 ${dupNames.length}명 합산` : ""}
          </p>
        )}
      </div>

      {/* 가용율 통계 (3개 카드) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3 text-center">
            <div className="text-xs text-muted-foreground">🟢 활성 (30일)</div>
            <div className="text-2xl font-bold text-foreground">{activityStats.active}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-3 text-center">
            <div className="text-xs text-muted-foreground">🟡 산발 (90일)</div>
            <div className="text-2xl font-bold text-foreground">{activityStats.sporadic}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-400">
          <CardContent className="p-3 text-center">
            <div className="text-xs text-muted-foreground">🔴 비활성</div>
            <div className="text-2xl font-bold text-foreground">{activityStats.inactive}</div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 영역 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Input
            placeholder="이름 검색 (예: 김)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-sm"
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground mr-1">등급</span>
            {GRADE_FILTERS.map((g) => (
              <Button
                key={g}
                size="sm"
                variant={gradeFilter === g ? "default" : "outline"}
                onClick={() => setGradeFilter(g)}
              >
                {g}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground mr-1">가용</span>
            {STATUS_FILTERS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                onClick={() => setStatusFilter(s)}
              >
                {s === "전체" ? "전체" : STATUS_LABEL[s]}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground mr-1">기수</span>
            <Select value={cohortFilter} onValueChange={setCohortFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="전체">전체</SelectItem>
                {cohortOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              결과 {filtered.length}명
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 자음별 섹션 */}
      {grouped.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            조건에 맞는 선수가 없습니다
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ initial, list }) => (
            <section key={initial}>
              <div className="mb-3 flex items-baseline gap-2">
                <h2
                  className="text-xl font-bold text-white"
                  style={OUTSIDE_TEXT_STYLE}
                >
                  {initial}
                </h2>
                <span
                  className="text-xs font-medium text-white"
                  style={OUTSIDE_TEXT_STYLE}
                >
                  · {list.length}명
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {list.map((r) => {
                  const status = activityOf(r);
                  return (
                    <Card
                      key={`${r.name}-${r.cohort}-${r.grade}`}
                      className={statusBorderClass(status)}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="text-lg font-bold text-foreground truncate flex items-center gap-1">
                              {r.name}
                              {r.isDupName && (
                                <span className="text-[10px] font-normal text-amber-600" title="동명이인 합산">
                                  ⚠
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.cohort || "-"}
                            </div>
                          </div>
                          <Badge className={gradeBadgeClass(r.grade)}>
                            {r.grade || "--"}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground border-t pt-2">
                          {status === "active" && (
                            <span>🟢 최근 30일 {r.recent30}회</span>
                          )}
                          {status === "sporadic" && (
                            <span>
                              🟡 최근 90일 {r.recent90}회
                              {r.lastRaceDate ? ` · 마지막 ${r.lastRaceDate}` : ""}
                            </span>
                          )}
                          {status === "inactive" && (
                            <span>
                              🔴 {r.lastRaceDate ? `마지막 출전: ${r.lastRaceDate}` : "출전 기록 없음"}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
