"use client";

import { useEffect, useState, useCallback } from "react";
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
  record200m: string;
  speed200m: number;
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
      setSelectedDay(String(found.days[0]));
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
          {races
            .sort((a, b) => a.raceNo - b.raceNo)
            .map((race) => (
              <Card key={race.raceNo}>
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
                          <TableHead className="w-16">착순</TableHead>
                          <TableHead className="w-16">번호</TableHead>
                          <TableHead>선수명</TableHead>
                          <TableHead>주행시간</TableHead>
                          <TableHead className="w-20">착차</TableHead>
                          <TableHead className="w-20">전법</TableHead>
                          <TableHead className="w-24">200m</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {race.results
                          .sort((a, b) => a.rank - b.rank)
                          .map((r) => (
                            <TableRow key={r.backNo}>
                              <TableCell className="font-bold">{r.rank}</TableCell>
                              <TableCell>
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
                                  {r.backNo}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium">{r.name}</TableCell>
                              <TableCell className="font-mono text-sm">{r.raceTime}</TableCell>
                              <TableCell>{r.gap}</TableCell>
                              <TableCell>
                                {r.tactic !== "-" && (
                                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tacticColor(r.tactic)}`}>
                                    {r.tactic}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-sm">{r.record200m}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Odds */}
                  {race.odds && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-muted-foreground">배당률</h4>
                      <div className="flex flex-wrap gap-2">
                        {race.odds.단승 > 0 && (
                          <Badge variant="outline">단승 {race.odds.단승}</Badge>
                        )}
                        {race.odds.연승1착 > 0 && (
                          <Badge variant="outline">연승1착 {race.odds.연승1착}</Badge>
                        )}
                        {race.odds.연승2착 > 0 && (
                          <Badge variant="outline">연승2착 {race.odds.연승2착}</Badge>
                        )}
                        {race.odds.쌍승 > 0 && (
                          <Badge variant="outline">쌍승 {race.odds.쌍승}</Badge>
                        )}
                        {race.odds.복승 > 0 && (
                          <Badge variant="outline">복승 {race.odds.복승}</Badge>
                        )}
                        {race.odds.삼복승 > 0 && (
                          <Badge variant="outline">삼복승 {race.odds.삼복승}</Badge>
                        )}
                        {race.odds.삼쌍승 > 0 && (
                          <Badge variant="outline">삼쌍승 {race.odds.삼쌍승}</Badge>
                        )}
                        {race.odds.쌍복승 > 0 && (
                          <Badge variant="outline">쌍복승 {race.odds.쌍복승}</Badge>
                        )}
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
