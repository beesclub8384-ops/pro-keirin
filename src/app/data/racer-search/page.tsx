"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
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
import { UnionBadge } from "@/components/ui/UnionBadge";

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
  isUnion: boolean;
  ranking?: RankingEntry;
}

interface RacerGroup {
  racerId: string;
  name: string;
  profiles: RacerResult[];
}

// 노조 통계 응답 타입 (/api/data/union-stats)
type Org = "pro" | "kor" | "gray";
const GRADE_KEYS = ["SS", "S1", "S2", "S3", "A1", "A2", "A3", "B1", "B2", "B3"] as const;
const AGE_KEYS = ["20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55+"] as const;

interface UnionStats {
  asOf: string;
  refYear: number;
  summary: { pro: number; kor: number; gray: number; total: number };
  gradeByOrg: Record<Org, Record<string, number>>;
  ageByOrg: Record<Org, Record<string, number>>;
  avgAge: { pro: number | null; kor: number | null; gray: number | null; total: number | null };
  ssByOrg: { pro: number; kor: number; gray: number };
  upperGradeRatio: { pro: number; kor: number; gray: number };
}

const ORG_COLORS = {
  pro: "#2563eb", // blue-600 — 프로경노
  kor: "#9ca3af", // gray-400 — 한경노
  gray: "#facc15", // yellow-400 — 회색지대
} as const;
const ORG_LABELS = { pro: "프로경노", kor: "한경노", gray: "회색지대" } as const;

function StatsSection({ stats }: { stats: UnionStats }) {
  const gradeChart = useMemo(
    () =>
      GRADE_KEYS.map((g) => ({
        grade: g,
        pro: stats.gradeByOrg.pro?.[g] ?? 0,
        kor: stats.gradeByOrg.kor?.[g] ?? 0,
        gray: stats.gradeByOrg.gray?.[g] ?? 0,
      })),
    [stats]
  );
  const ageChart = useMemo(
    () =>
      AGE_KEYS.map((a) => ({
        ageRange: a,
        pro: stats.ageByOrg.pro?.[a] ?? 0,
        kor: stats.ageByOrg.kor?.[a] ?? 0,
        gray: stats.ageByOrg.gray?.[a] ?? 0,
      })),
    [stats]
  );

  const upperPct = (stats.upperGradeRatio.pro * 100).toFixed(1);
  const proRatio = ((stats.summary.pro / stats.summary.total) * 100).toFixed(1);
  const ssAllInPro =
    stats.ssByOrg.pro > 0 &&
    stats.ssByOrg.pro === stats.ssByOrg.pro + stats.ssByOrg.kor + stats.ssByOrg.gray;
  const ageDiff =
    stats.avgAge.pro != null && stats.avgAge.kor != null
      ? +(stats.avgAge.kor - stats.avgAge.pro).toFixed(2)
      : null;

  return (
    <section className="space-y-4">
      {/* ① KPI 카드 4개 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">SS등급</div>
            <div className="mt-1 text-xl font-bold text-foreground">
              {stats.ssByOrg.pro}명 전원 프로경노
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {ssAllInPro ? "최상위 등급 독점" : `프로 ${stats.ssByOrg.pro} / 한경 ${stats.ssByOrg.kor} / 회색 ${stats.ssByOrg.gray}`}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-600">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">프로경노 상위등급 비율</div>
            <div className="mt-1 text-xl font-bold text-foreground">{upperPct}%</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">SS·S·A 합계 기준</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-400">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">프로경노 평균 나이</div>
            <div className="mt-1 text-xl font-bold text-foreground">
              {stats.avgAge.pro != null ? stats.avgAge.pro.toFixed(1) : "—"}세
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              전체 {stats.avgAge.total != null ? stats.avgAge.total.toFixed(1) : "—"}세 대비
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">프로경노 인원</div>
            <div className="mt-1 text-xl font-bold text-foreground">
              {stats.summary.pro}명 ({proRatio}%)
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              전체 {stats.summary.total}명 중
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ② 등급 분포 막대 차트 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">조직별 등급 분포</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeChart} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="grade" fontSize={12} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="pro" name="프로경노" fill={ORG_COLORS.pro} radius={[3, 3, 0, 0]} />
                <Bar dataKey="kor" name="한경노" fill={ORG_COLORS.kor} radius={[3, 3, 0, 0]} />
                <Bar dataKey="gray" name="회색지대" fill={ORG_COLORS.gray} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ③ 나이 분포 막대 차트 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">조직별 나이 분포 (5세 단위)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageChart} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="ageRange" fontSize={12} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="pro" name="프로경노" fill={ORG_COLORS.pro} radius={[3, 3, 0, 0]} />
                <Bar dataKey="kor" name="한경노" fill={ORG_COLORS.kor} radius={[3, 3, 0, 0]} />
                <Bar dataKey="gray" name="회색지대" fill={ORG_COLORS.gray} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ④ 평균 나이 비교 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">평균 나이 비교</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["pro", "kor", "gray"] as Org[]).map((org) => (
              <div
                key={org}
                className="rounded-md border p-3"
                style={{ borderLeftWidth: 4, borderLeftColor: ORG_COLORS[org] }}
              >
                <div className="text-xs text-muted-foreground">{ORG_LABELS[org]}</div>
                <div className="mt-1 text-2xl font-bold">
                  {stats.avgAge[org] != null ? stats.avgAge[org]!.toFixed(1) : "—"}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">세</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {stats.summary[org]}명
                </div>
              </div>
            ))}
          </div>
          {ageDiff != null && (
            <div className="mt-3 text-sm">
              <span className="rounded-md bg-red-50 px-2 py-1 font-semibold text-red-700">
                프로경노가 한경노보다 평균 {ageDiff.toFixed(1)}세 젊다
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function RacerSearchPage() {
  const [query, setQuery] = useState("");
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState("all");
  const [results, setResults] = useState<RacerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [profileYears, setProfileYears] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<UnionStats | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/data/racer-search")
      .then((r) => r.json())
      .then((d) => setYears(d.years || []));
    fetch("/api/data/union-stats")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setStats(d as UnionStats);
      })
      .catch(() => {});
  }, []);

  const doSearch = useCallback(async (q: string, year: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    // 이전 요청 취소
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      const yearParam = year !== "all" ? `&year=${year}` : "";
      const res = await fetch(
        `/api/data/racer-search?q=${encodeURIComponent(q.trim())}${yearParam}`,
        { signal: abortRef.current.signal }
      );
      const d = await res.json();
      setResults(d.results || []);
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // 취소된 요청은 무시
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

      {/* 노조/등급/나이 통계 */}
      {stats && <StatsSection stats={stats} />}

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
                    <CardTitle className="text-base">{group.name}<UnionBadge isUnion={racer.isUnion ?? false} /></CardTitle>
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
