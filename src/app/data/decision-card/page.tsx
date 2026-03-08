"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import { BackNumber } from "@/components/ui/back-number";
import { RaceTabNav } from "@/components/race-tab-nav";
import Link from "next/link";

interface Entry {
  backNo: number;
  racerId: string;
  name: string;
  generation: number;
  age: number;
  winRateVenue: number;
  top2RateVenue: number;
  top3RateVenue: number;
  winRateTotal: number;
  top2RateTotal: number;
  top3RateTotal: number;
  place1st: number;
  place2nd: number;
  place3rd: number;
  tacticPreemptTotal: string;
  tacticPushTotal: string;
  tacticChaseTotal: string;
  tacticMarkTotal: string;
  gradeAdjust: string;
  recent3ScoreVenue: string;
  recent3ScoreTotal: string;
  performanceRank: string;
  isAbsent?: boolean;
  training: string;
}

interface DecisionRace {
  raceNo: number;
  startTime: string;
  laps: string;
  raceType: string;
  entries: Entry[];
}

interface DecisionPage {
  year: number;
  round: number;
  day: number;
  date: string;
  races: DecisionRace[];
}

interface RoundMeta {
  round: number;
  days: number[];
}

export default function DecisionCardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">로딩 중...</div>}>
      <DecisionCardContent />
    </Suspense>
  );
}

function DecisionCardContent() {
  const searchParams = useSearchParams();
  const paramYear = searchParams.get("year");
  const paramRound = searchParams.get("round");
  const paramDay = searchParams.get("day");
  const initializedRef = useRef(false);

  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState("");
  const [rounds, setRounds] = useState<RoundMeta[]>([]);
  const [selectedRound, setSelectedRound] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [pages, setPages] = useState<DecisionPage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/data/decision-card")
      .then((r) => r.json())
      .then((d) => {
        setYears(d.years || []);
        if (paramYear) {
          setSelectedYear(paramYear);
        } else if (d.years?.length) {
          setSelectedYear(String(d.years[0]));
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedYear) return;
    if (!initializedRef.current) {
      // 첫 로드: round/day 리셋하지 않음 (URL 파라미터 우선)
    } else {
      setSelectedRound("");
      setSelectedDay("");
      setPages([]);
    }
    fetch(`/api/data/decision-card?year=${selectedYear}`)
      .then((r) => r.json())
      .then((d) => {
        const roundsList: RoundMeta[] = d.rounds || [];
        setRounds(roundsList);
        if (roundsList.length > 0) {
          if (!initializedRef.current && paramRound) {
            setSelectedRound(paramRound);
          } else {
            // 최신 회차 선택
            setSelectedRound(String(roundsList[roundsList.length - 1].round));
          }
        }
      });
  }, [selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedRound) return;
    if (initializedRef.current) {
      setSelectedDay("");
      setPages([]);
    }
    const found = rounds.find((r) => r.round === parseInt(selectedRound, 10));
    if (found) {
      setDays(found.days);
      if (!initializedRef.current && paramDay) {
        setSelectedDay(paramDay);
      } else {
        // 가장 큰 일차(최신) 선택
        setSelectedDay(String(found.days[found.days.length - 1]));
      }
      initializedRef.current = true;
    }
  }, [selectedRound, rounds]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = useCallback(async () => {
    if (!selectedYear || !selectedRound || !selectedDay) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/data/decision-card?year=${selectedYear}&round=${selectedRound}&day=${selectedDay}`
      );
      const d = await res.json();
      setPages(d.pages || []);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedRound, selectedDay]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">출주표 조회</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="연도" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedRound} onValueChange={setSelectedRound}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="회차" />
          </SelectTrigger>
          <SelectContent>
            {rounds.map((r) => (
              <SelectItem key={r.round} value={String(r.round)}>{r.round}회차</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedDay} onValueChange={setSelectedDay}>
          <SelectTrigger className="w-[100px]">
            <SelectValue placeholder="일차" />
          </SelectTrigger>
          <SelectContent>
            {days.map((d) => (
              <SelectItem key={d} value={String(d)}>{d}일차</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          데이터 로딩 중...
        </div>
      ) : pages.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {selectedYear ? "출주표 데이터가 없습니다." : "연도를 선택해주세요."}
        </div>
      ) : (
        <>
        <RaceTabNav raceNos={pages.flatMap((p) => p.races.map((r) => r.raceNo)).sort((a, b) => a - b)} />
        {pages.map((page) =>
          page.races
            .sort((a, b) => a.raceNo - b.raceNo)
            .map((race) => (
              <Card key={`${page.round}-${page.day}-${race.raceNo}`} id={`race-${race.raceNo}`} className="scroll-mt-16 overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{race.raceNo}경주</CardTitle>
                    <Badge variant="outline">{page.date}</Badge>
                    <Badge variant="secondary">{race.startTime}</Badge>
                    <Badge variant="secondary">{race.laps}주회</Badge>
                    <Badge>{race.raceType}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">번호</TableHead>
                          <TableHead className="w-20">선수명</TableHead>
                          <TableHead className="w-20">기수/나이</TableHead>
                          <TableHead className="w-20">승률(광명)</TableHead>
                          <TableHead className="w-20">연대율</TableHead>
                          <TableHead className="w-20">삼연대율</TableHead>
                          <TableHead className="w-24">입상(1/2/3)</TableHead>
                          <TableHead>등급조정</TableHead>
                          <TableHead className="w-20">최근3회</TableHead>
                          <TableHead className="w-24">성적순위</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...race.entries].sort((a, b) => a.backNo - b.backNo).map((entry) => (
                          <TableRow key={entry.backNo} className={entry.isAbsent ? "opacity-60" : ""}>
                            <TableCell>
                              <BackNumber no={entry.backNo} />
                            </TableCell>
                            <TableCell className="font-medium">
                              <span className="flex items-center gap-1">
                                {entry.name}
                                {entry.training && (
                                  <Link href={`/training/${encodeURIComponent(entry.training)}`} onClick={(e) => e.stopPropagation()}>
                                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent">{entry.training}</Badge>
                                  </Link>
                                )}
                                {entry.isAbsent && (
                                  <span className="inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-400">결장</span>
                                )}
                              </span>
                            </TableCell>
                            {entry.isAbsent ? (
                              <TableCell colSpan={8} className="text-center text-xs text-muted-foreground">—</TableCell>
                            ) : (
                              <>
                                <TableCell className="text-sm">
                                  {entry.generation}기/{entry.age}세
                                </TableCell>
                                <TableCell className="font-medium">{entry.winRateVenue}%</TableCell>
                                <TableCell>{entry.top2RateVenue}%</TableCell>
                                <TableCell>{entry.top3RateVenue}%</TableCell>
                                <TableCell className="text-sm">
                                  {entry.place1st}/{entry.place2nd}/{entry.place3rd}
                                </TableCell>
                                <TableCell className="text-xs">{entry.gradeAdjust}</TableCell>
                                <TableCell className="font-mono text-sm">
                                  {entry.recent3ScoreTotal}
                                </TableCell>
                                <TableCell className="text-sm">{entry.performanceRank}</TableCell>
                              </>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Tactic summary */}
                  <div className="mt-3 border-t pt-3">
                    <h4 className="mb-2 text-xs font-semibold text-muted-foreground">전법 성적 (전체)</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="px-2 py-1 text-left">번호</th>
                            <th className="px-2 py-1">선행</th>
                            <th className="px-2 py-1">젖히기</th>
                            <th className="px-2 py-1">추입</th>
                            <th className="px-2 py-1">마크</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...race.entries].sort((a, b) => a.backNo - b.backNo).map((entry) => (
                            <tr key={entry.backNo} className={`border-t${entry.isAbsent ? " opacity-60" : ""}`}>
                              <td className="px-2 py-1 font-medium">{entry.backNo}</td>
                              <td className="px-2 py-1 text-center">{entry.isAbsent ? "—" : (entry.tacticPreemptTotal || "-")}</td>
                              <td className="px-2 py-1 text-center">{entry.isAbsent ? "—" : (entry.tacticPushTotal || "-")}</td>
                              <td className="px-2 py-1 text-center">{entry.isAbsent ? "—" : (entry.tacticChaseTotal || "-")}</td>
                              <td className="px-2 py-1 text-center">{entry.isAbsent ? "—" : (entry.tacticMarkTotal || "-")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
        )}
        </>
      )}
    </div>
  );
}
