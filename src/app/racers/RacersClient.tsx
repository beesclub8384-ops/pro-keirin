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

interface Racer {
  name: string;
  grade: string;
  cohort: string;
  initial: string;
}

const CONSONANT_ORDER = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const GRADE_FILTERS = ["전체", "B", "A", "S", "SS"] as const;
type GradeFilter = (typeof GRADE_FILTERS)[number];

function gradeLetter(grade: string): string {
  if (grade === "SS") return "SS";
  if (grade.startsWith("S")) return "S";
  if (grade.startsWith("A")) return "A";
  if (grade.startsWith("B")) return "B";
  return "--";
}

function gradeBadgeClass(grade: string): string {
  if (grade === "SS") return "bg-red-500 text-white border-transparent";
  if (grade.startsWith("S")) return "bg-purple-500 text-white border-transparent";
  if (grade.startsWith("A")) return "bg-blue-500 text-white border-transparent";
  if (grade.startsWith("B")) return "bg-green-500 text-white border-transparent";
  return "bg-gray-400 text-white border-transparent";
}

const OUTSIDE_TEXT_STYLE: React.CSSProperties = {
  textShadow:
    "0 1px 3px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1), 1px 1px 0 rgba(0,0,0,0.5), -1px -1px 0 rgba(0,0,0,0.5)",
};

export default function RacersClient({ racers }: { racers: Racer[] }) {
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("전체");
  const [cohortFilter, setCohortFilter] = useState<string>("전체");

  const cohortOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of racers) {
      if (r.cohort) set.add(r.cohort);
    }
    return Array.from(set).sort();
  }, [racers]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = { SS: 0, S: 0, A: 0, B: 0, "--": 0 };
    for (const r of racers) {
      counts[gradeLetter(r.grade)] = (counts[gradeLetter(r.grade)] || 0) + 1;
    }
    return counts;
  }, [racers]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return racers.filter((r) => {
      if (q && !r.name.includes(q)) return false;
      if (gradeFilter !== "전체" && gradeLetter(r.grade) !== gradeFilter) return false;
      if (cohortFilter !== "전체" && r.cohort !== cohortFilter) return false;
      return true;
    });
  }, [racers, query, gradeFilter, cohortFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, Racer[]> = {};
    for (const r of filtered) {
      if (!map[r.initial]) map[r.initial] = [];
      map[r.initial].push(r);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.name.localeCompare(b.name, "ko"));
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
        <p
          className="mt-1 text-sm text-white"
          style={OUTSIDE_TEXT_STYLE}
        >
          전체 {racers.length}명 · SS {stats.SS} · S {stats.S} · A {stats.A} · B {stats.B}
          {stats["--"] > 0 ? ` · -- ${stats["--"]}` : ""}
        </p>
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
                {list.map((r) => (
                  <Card key={`${r.name}-${r.cohort}-${r.grade}`}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="text-lg font-bold text-foreground truncate">
                          {r.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.cohort || "-"}
                        </div>
                      </div>
                      <Badge className={gradeBadgeClass(r.grade)}>
                        {r.grade || "--"}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
