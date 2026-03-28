"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
import { UnionBadge } from "@/components/ui/UnionBadge";
import { BackNumber } from "@/components/ui/back-number";
import { RaceTabNav } from "@/components/race-tab-nav";
import Link from "next/link";

interface RaceOdds {
  단승: number;
  연승1착: number;
  연승2착: number;
  쌍승: number;
  복승: number;
  삼복승: number;
  삼쌍승: number;
  쌍복승: number;
}

interface RaceResult {
  backNo: number;
  name: string;
  rank: number;
  gap: string;
  raceTime: string;
  tactic: string;
  disqualified: string;
  warning: string;
  caution: string;
  withdrawal: string;
  finish: string;
  record200m: string;
  speed200m: number;
  training: string;
  isUnion: boolean;
}

interface RaceEnvironment {
  time: string;
  weather: string;
  windDir: string;
  windSpeed: string;
  temp: string;
  humidity: string;
  record200m: string;
  lastLap: string;
}

interface Race {
  year: number;
  round: number;
  day: number;
  raceNo: number;
  date: string;
  environment: RaceEnvironment;
  results: RaceResult[];
  odds: RaceOdds | null;
}

interface RoundMeta {
  round: number;
  days: number[];
}

export default function RaceResultsPage() {
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [rounds, setRounds] = useState<RoundMeta[]>([]);
  const [selectedRound, setSelectedRound] = useState<string>("");
  const [days, setDays] = useState<number[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(false);

  // Load years
  useEffect(() => {
    fetch("/api/data/race-results")
      .then((r) => r.json())
      .then((d) => {
        setYears(d.years || []);
        if (d.years?.length) setSelectedYear(String(d.years[0]));
      });
  }, []);

  // Load rounds when year changes
  useEffect(() => {
    if (!selectedYear) return;
    setSelectedRound("");
    setSelectedDay("");
    setRaces([]);
    fetch(`/api/data/race-results?year=${selectedYear}`)
      .then((r) => r.json())
      .then((d) => {
        setRounds(d.rounds || []);
        if (d.rounds?.length) setSelectedRound(String(d.rounds[d.rounds.length - 1].round));
      });
  }, [selectedYear]);

  // Update days when round changes
  useEffect(() => {
    if (!selectedRound) return;
    setSelectedDay("");
    setRaces([]);
    const found = rounds.find((r) => r.round === parseInt(selectedRound, 10));
    if (found) {
      setDays(found.days);
      setSelectedDay(String(found.days[found.days.length - 1]));
    }
  }, [selectedRound, rounds]);

  // Load races when day changes
  const loadRaces = useCallback(async () => {
    if (!selectedYear || !selectedRound || !selectedDay) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/data/race-results?year=${selectedYear}&round=${selectedRound}&day=${selectedDay}`
      );
      const d = await res.json();
      setRaces(d.races || []);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedRound, selectedDay]);

  useEffect(() => {
    loadRaces();
  }, [loadRaces]);

  const tacticColor = (tactic: string) => {
    switch (tactic) {
      case "선행": return "bg-red-100 text-red-700";
      case "젖히기": return "bg-orange-100 text-orange-700";
      case "추입": return "bg-blue-100 text-blue-700";
      case "마크": return "bg-green-100 text-green-700";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">경주결과 조회</h1>

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

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          데이터 로딩 중...
        </div>
      ) : races.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {selectedYear ? "경주 데이터가 없습니다." : "연도를 선택해주세요."}
        </div>
      ) : (
        <div className="space-y-6">
          <RaceTabNav raceNos={races.map((r) => r.raceNo).sort((a, b) => a - b)} />
          {races
            .sort((a, b) => a.raceNo - b.raceNo)
            .map((race) => (
              <Card key={race.raceNo} id={`race-${race.raceNo}`} className="scroll-mt-16">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{race.raceNo}경주</CardTitle>
                    <Badge variant="outline">{race.date}</Badge>
                    {race.environment.time !== "-" && (
                      <Badge variant="secondary">{race.environment.time}</Badge>
                    )}
                    {race.environment.weather !== "-" && (
                      <Badge variant="secondary">{race.environment.weather}</Badge>
                    )}
                    {race.environment.temp !== "-" && (
                      <Badge variant="secondary">{race.environment.temp}</Badge>
                    )}
                    {race.environment.windDir !== "-" && race.environment.windSpeed !== "-" && (
                      <Badge variant="secondary">
                        {race.environment.windDir} {race.environment.windSpeed}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Results Table */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">번호</TableHead>
                          <TableHead>선수명</TableHead>
                          <TableHead className="w-12 text-center">착순</TableHead>
                          <TableHead className="w-16 text-center">착차</TableHead>
                          <TableHead className="text-center">주행시간</TableHead>
                          <TableHead className="w-16 text-center">승부수</TableHead>
                          <TableHead className="w-12 text-center">실격</TableHead>
                          <TableHead className="w-12 text-center">경고</TableHead>
                          <TableHead className="w-12 text-center">주의</TableHead>
                          <TableHead className="w-16 text-center">기권구분</TableHead>
                          <TableHead className="w-16 text-center">골인구분</TableHead>
                          <TableHead className="w-20 text-center">200M시속</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {race.results
                          .sort((a, b) => a.backNo - b.backNo)
                          .map((r) => (
                            <TableRow
                              key={r.backNo}
                              className={r.rank >= 1 && r.rank <= 3 ? "bg-red-50" : ""}
                            >
                              <TableCell className="text-center">
                                <BackNumber no={r.backNo} />
                              </TableCell>
                              <TableCell className="font-medium">
                                <span className="flex items-center gap-1">
                                  {r.name}
                                  <UnionBadge isUnion={r.isUnion ?? false} />
                                  {r.training && (
                                    <Link href={`/training/${encodeURIComponent(r.training)}`} onClick={(e) => e.stopPropagation()}>
                                      <Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent">{r.training}</Badge>
                                    </Link>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="text-center font-bold">{r.rank}</TableCell>
                              <TableCell className="text-center">{r.gap}</TableCell>
                              <TableCell className="text-center font-mono text-sm">{r.raceTime}</TableCell>
                              <TableCell className="text-center">
                                {r.tactic !== "-" ? (
                                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tacticColor(r.tactic)}`}>
                                    {r.tactic}
                                  </span>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                              <TableCell className="text-center text-sm">{r.disqualified}</TableCell>
                              <TableCell className="text-center text-sm">{r.warning}</TableCell>
                              <TableCell className="text-center text-sm">{r.caution}</TableCell>
                              <TableCell className="text-center text-sm">{r.withdrawal}</TableCell>
                              <TableCell className="text-center text-sm">{r.finish}</TableCell>
                              <TableCell className="text-center font-mono text-sm">{r.speed200m > 0 ? r.speed200m : "-"}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Odds */}
                  {race.odds && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-muted-foreground">배당률</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="px-3 py-2 text-center font-medium">단승</th>
                              <th className="px-3 py-2 text-center font-medium">연승1착</th>
                              <th className="px-3 py-2 text-center font-medium">연승2착</th>
                              <th className="px-3 py-2 text-center font-medium">쌍승</th>
                              <th className="px-3 py-2 text-center font-medium">복승</th>
                              <th className="px-3 py-2 text-center font-medium">삼복승</th>
                              <th className="px-3 py-2 text-center font-medium">삼쌍승</th>
                              <th className="px-3 py-2 text-center font-medium">쌍복승</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="px-3 py-2 text-center font-mono font-semibold">{race.odds.단승 || "-"}</td>
                              <td className="px-3 py-2 text-center font-mono font-semibold">{race.odds.연승1착 || "-"}</td>
                              <td className="px-3 py-2 text-center font-mono font-semibold">{race.odds.연승2착 || "-"}</td>
                              <td className="px-3 py-2 text-center font-mono font-semibold">{race.odds.쌍승 || "-"}</td>
                              <td className="px-3 py-2 text-center font-mono font-semibold">{race.odds.복승 || "-"}</td>
                              <td className="px-3 py-2 text-center font-mono font-semibold">{race.odds.삼복승 || "-"}</td>
                              <td className="px-3 py-2 text-center font-mono font-semibold">{race.odds.삼쌍승 || "-"}</td>
                              <td className="px-3 py-2 text-center font-mono font-semibold">{race.odds.쌍복승 || "-"}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
