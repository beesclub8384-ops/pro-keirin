"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

interface RacerTactics {
  preemptive: number[];
  push: number[];
  chase: number[];
  mark: number[];
}

interface RacerViolations {
  disqualification: number;
  warning: number;
  caution: number;
  fallWithdraw: number;
  fallEntry: number;
  accidentWithdraw: number;
  accidentEntry: number;
}

interface RankingEntry {
  rank: number;
  name: string;
  generation: number;
  grade: string;
  runDays: number;
  avgScore: number;
  recent3: number;
  winRate: number;
  top2Rate: number;
}

interface RacerResult {
  racerId: string;
  name: string;
  year: number;
  birthYear: string;
  height: number;
  weight: number;
  bloodType: string;
  gradeChange: string;
  winRate: number;
  top2Rate: number;
  top3Rate: number;
  raceCount: number;
  runDays: number;
  recent3Score: number;
  recent3Rank: number;
  totalAvgScore: number;
  totalRankScore: number;
  recent200m: string;
  training: string;
  tactics: RacerTactics;
  violations: RacerViolations;
  ranking?: RankingEntry;
}

interface RacerGroup {
  racerId: string;
  name: string;
  profiles: RacerResult[];
}

export default function RacerSearchPage() {
  const [query, setQuery] = useState("");
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState("all");
  const [results, setResults] = useState<RacerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [profileYears, setProfileYears] = useState<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    fetch("/api/data/racer-search")
      .then((r) => r.json())
      .then((d) => setYears(d.years || []));
  }, []);

  const doSearch = useCallback(async (q: string, year: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const yearParam = year !== "all" ? `&year=${year}` : "";
      const res = await fetch(`/api/data/racer-search?q=${encodeURIComponent(q.trim())}${yearParam}`);
      const d = await res.json();
      setResults(d.results || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query, selectedYear);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selectedYear, doSearch]);

  const toggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // Group results by racer (racerId)
  const racerMap = new Map<string, RacerGroup>();
  for (const r of results) {
    if (!racerMap.has(r.racerId)) {
      racerMap.set(r.racerId, { racerId: r.racerId, name: r.name, profiles: [] });
    }
    racerMap.get(r.racerId)!.profiles.push(r);
  }
  // Sort profiles within each group by year desc
  for (const group of racerMap.values()) {
    group.profiles.sort((a, b) => b.year - a.year);
  }
  const racers = Array.from(racerMap.values());

  const getSelectedProfile = (group: RacerGroup): RacerResult => {
    const selectedYr = profileYears[group.racerId];
    if (selectedYr) {
      const found = group.profiles.find((p) => p.year === parseInt(selectedYr, 10));
      if (found) return found;
    }
    return group.profiles[0];
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">선수 검색</h1>

      {/* Search Bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="선수명을 입력하세요"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="전체 연도" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 연도</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          검색 중...
        </div>
      ) : racers.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {query ? "검색 결과가 없습니다." : "선수명을 입력하면 검색됩니다."}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {racers.length}명 검색됨
          </p>

          {racers.map((group) => {
            const racer = getSelectedProfile(group);
            const uid = group.racerId;
            const isExpanded = expandedId === uid;
            return (
              <Card key={uid}>
                <CardHeader
                  className="cursor-pointer pb-3"
                  onClick={() => toggle(uid)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{group.name}</CardTitle>
                    <Badge variant="outline">{racer.gradeChange}</Badge>
                    {racer.ranking && (
                      <Badge variant="secondary">순위 {racer.ranking.rank}위</Badge>
                    )}
                    <span className="text-sm text-muted-foreground">
                      승률 {racer.winRate}% · 연대율 {racer.top2Rate}%
                    </span>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-4 pt-0">
                    {/* Year selector */}
                    {group.profiles.length > 1 && (
                      <Select
                        value={profileYears[group.racerId] ?? String(group.profiles[0].year)}
                        onValueChange={(v) =>
                          setProfileYears((prev) => ({ ...prev, [group.racerId]: v }))
                        }
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {group.profiles.map((p) => (
                            <SelectItem key={p.year} value={String(p.year)}>
                              {p.year}년
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Body Info */}
                    {(racer.birthYear || racer.height > 0 || racer.bloodType) && (
                      <div className="flex flex-wrap gap-3 text-sm">
                        {racer.birthYear && (
                          <Badge variant="outline">출생 {racer.birthYear}</Badge>
                        )}
                        {racer.height > 0 && racer.weight > 0 && (
                          <Badge variant="outline">{racer.height}cm / {racer.weight}kg</Badge>
                        )}
                        {racer.bloodType && (
                          <Badge variant="outline">{racer.bloodType}</Badge>
                        )}
                      </div>
                    )}

                    {/* Profile */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                      <div>
                        <span className="text-muted-foreground">훈련지:</span>{" "}
                        <span className="font-medium">{racer.training.split("/")[0].trim()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">출주일수:</span>{" "}
                        <span className="font-medium">{racer.runDays}일</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">경주횟수:</span>{" "}
                        <span className="font-medium">{racer.raceCount}회</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">최근3회 득점:</span>{" "}
                        <span className="font-medium">{racer.recent3Score}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">최근3회 순위:</span>{" "}
                        <span className="font-medium">{racer.recent3Rank}위</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">200m 기록:</span>{" "}
                        <span className="font-medium">{racer.recent200m}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">삼연대율:</span>{" "}
                        <span className="font-medium">{racer.top3Rate}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">평균득점:</span>{" "}
                        <span className="font-medium">{racer.totalAvgScore}</span>
                      </div>
                    </div>

                    {/* Tactics */}
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                        전법 분포 (1착/2착/3착)
                      </h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>전법</TableHead>
                            <TableHead className="text-center">1착</TableHead>
                            <TableHead className="text-center">2착</TableHead>
                            <TableHead className="text-center">3착</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {([
                            ["선행", racer.tactics.preemptive],
                            ["젖히기", racer.tactics.push],
                            ["추입", racer.tactics.chase],
                            ["마크", racer.tactics.mark],
                          ] as [string, number[]][]).map(([name, vals]) => (
                            <TableRow key={name}>
                              <TableCell className="font-medium">{name}</TableCell>
                              <TableCell className="text-center">{vals[0]}</TableCell>
                              <TableCell className="text-center">{vals[1]}</TableCell>
                              <TableCell className="text-center">{vals[2]}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Violations */}
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                        위반 이력
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">실격 {racer.violations.disqualification}</Badge>
                        <Badge variant="outline">경고 {racer.violations.warning}</Badge>
                        <Badge variant="outline">주의 {racer.violations.caution}</Badge>
                        <Badge variant="outline">낙차출주 {racer.violations.fallEntry}</Badge>
                        <Badge variant="outline">낙차불출 {racer.violations.fallWithdraw}</Badge>
                        <Badge variant="outline">사고출주 {racer.violations.accidentEntry}</Badge>
                        <Badge variant="outline">사고불출 {racer.violations.accidentWithdraw}</Badge>
                      </div>
                    </div>

                    {/* Ranking */}
                    {racer.ranking && (
                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                          랭킹 정보
                        </h4>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                          <div>순위: <span className="font-medium">{racer.ranking.rank}위</span></div>
                          <div>등급: <span className="font-medium">{racer.ranking.grade}</span></div>
                          <div>기수: <span className="font-medium">{racer.ranking.generation}기</span></div>
                          <div>평균득점: <span className="font-medium">{racer.ranking.avgScore}</span></div>
                          <div>최근3회: <span className="font-medium">{racer.ranking.recent3}</span></div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
