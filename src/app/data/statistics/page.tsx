"use client";

import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

// --- Types ---

interface DividendHigh {
  poolType: string;
  amount: string;
  raceDate: string;
}

interface DividendDistribution {
  poolType: string;
  range1: string;
  range2: string;
  range3: string;
  range4: string;
  range5: string;
  range6: string;
  range7: string;
  range8: string;
}

interface DividendData {
  year: number;
  highDividends: DividendHigh[];
  distribution: DividendDistribution[];
}

interface SalesEntry {
  rank: number;
  amount: string;
  raceDate: string;
}

interface SalesData {
  year: number;
  byRound: SalesEntry[];
  byDay: SalesEntry[];
  byRace: SalesEntry[];
}

interface HighDividendRow {
  rank: number;
  amount: string;
  raceDate: string;
  combination: string;
}

interface HighDividendTable {
  poolType: string;
  rows: HighDividendRow[];
}

interface HighDividendData {
  year: number;
  tables: HighDividendTable[];
}

interface NoHitPool {
  poolType: string;
  winNo: string;
  dividend: string;
  sales: string;
}

interface NoHitRace {
  title: string;
  pools: NoHitPool[];
}

interface MetaYears {
  dividendYears: number[];
  salesYears: number[];
  highDividendYears: number[];
}

// --- Component ---

export default function StatisticsPage() {
  const [meta, setMeta] = useState<MetaYears | null>(null);

  useEffect(() => {
    fetch("/api/data/statistics")
      .then((r) => r.json())
      .then(setMeta);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">통계 조회</h1>
      <Tabs defaultValue="dividend">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="dividend">배당률통계</TabsTrigger>
          <TabsTrigger value="sales">매출액통계</TabsTrigger>
          <TabsTrigger value="high-dividend">고배당순위</TabsTrigger>
          <TabsTrigger value="no-hit">무적중경주</TabsTrigger>
        </TabsList>

        <TabsContent value="dividend">
          {meta && <DividendTab years={meta.dividendYears} />}
        </TabsContent>
        <TabsContent value="sales">
          {meta && <SalesTab years={meta.salesYears} />}
        </TabsContent>
        <TabsContent value="high-dividend">
          {meta && <HighDividendTab years={meta.highDividendYears} />}
        </TabsContent>
        <TabsContent value="no-hit">
          <NoHitTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Dividend Tab ---

function DividendTab({ years }: { years: number[] }) {
  const [selectedYear, setSelectedYear] = useState(years.length ? String(years[0]) : "");
  const [data, setData] = useState<DividendData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!selectedYear) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/data/statistics?type=dividend&year=${selectedYear}`);
      const d = await res.json();
      setData(d.data || null);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4 pt-4">
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

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">로딩 중...</div>
      ) : !data ? (
        <div className="py-10 text-center text-muted-foreground">데이터 없음</div>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">최고배당률</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>승식</TableHead>
                      <TableHead>최고배당</TableHead>
                      <TableHead>경주정보</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.highDividends.map((h, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{h.poolType}</TableCell>
                        <TableCell className="font-mono">{h.amount}</TableCell>
                        <TableCell className="text-sm">{h.raceDate}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">배당률 분포</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>승식</TableHead>
                      <TableHead className="text-center">~10배</TableHead>
                      <TableHead className="text-center">%</TableHead>
                      <TableHead className="text-center">10~50배</TableHead>
                      <TableHead className="text-center">%</TableHead>
                      <TableHead className="text-center">50~100배</TableHead>
                      <TableHead className="text-center">%</TableHead>
                      <TableHead className="text-center">100배~</TableHead>
                      <TableHead className="text-center">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.distribution.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{d.poolType}</TableCell>
                        <TableCell className="text-center font-mono">{d.range1}</TableCell>
                        <TableCell className="text-center font-mono">{d.range2}</TableCell>
                        <TableCell className="text-center font-mono">{d.range3}</TableCell>
                        <TableCell className="text-center font-mono">{d.range4}</TableCell>
                        <TableCell className="text-center font-mono">{d.range5}</TableCell>
                        <TableCell className="text-center font-mono">{d.range6}</TableCell>
                        <TableCell className="text-center font-mono">{d.range7}</TableCell>
                        <TableCell className="text-center font-mono">{d.range8}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// --- Sales Tab ---

function SalesTab({ years }: { years: number[] }) {
  const [selectedYear, setSelectedYear] = useState(years.length ? String(years[0]) : "");
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!selectedYear) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/data/statistics?type=sales&year=${selectedYear}`);
      const d = await res.json();
      setData(d.data || null);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => { load(); }, [load]);

  const renderTable = (title: string, items: SalesEntry[]) => (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">순위</TableHead>
                <TableHead>매출액</TableHead>
                <TableHead>경주정보</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{item.rank}</TableCell>
                  <TableCell className="font-mono">{item.amount}</TableCell>
                  <TableCell className="text-sm">{item.raceDate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4 pt-4">
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

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">로딩 중...</div>
      ) : !data ? (
        <div className="py-10 text-center text-muted-foreground">데이터 없음</div>
      ) : (
        <>
          {data.byRound.length > 0 && renderTable("회차별 최고매출", data.byRound)}
          {data.byDay.length > 0 && renderTable("일차별 최고매출", data.byDay)}
          {data.byRace.length > 0 && renderTable("경주별 최고매출", data.byRace)}
        </>
      )}
    </div>
  );
}

// --- High Dividend Tab ---

function HighDividendTab({ years }: { years: number[] }) {
  const [selectedYear, setSelectedYear] = useState(years.length ? String(years[0]) : "");
  const [data, setData] = useState<HighDividendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPool, setSelectedPool] = useState("");

  const load = useCallback(async () => {
    if (!selectedYear) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/data/statistics?type=high-dividend&year=${selectedYear}`);
      const d = await res.json();
      setData(d.data || null);
      if (d.data?.tables?.length) {
        setSelectedPool(d.data.tables[0].poolType);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => { load(); }, [load]);

  const currentTable = data?.tables.find((t) => t.poolType === selectedPool);

  return (
    <div className="space-y-4 pt-4">
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

        {data && (
          <Select value={selectedPool} onValueChange={setSelectedPool}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="승식" />
            </SelectTrigger>
            <SelectContent>
              {data.tables.map((t) => (
                <SelectItem key={t.poolType} value={t.poolType}>{t.poolType}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">로딩 중...</div>
      ) : !currentTable ? (
        <div className="py-10 text-center text-muted-foreground">데이터 없음</div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selectedPool} 고배당 순위</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">순위</TableHead>
                    <TableHead>배당률</TableHead>
                    <TableHead>경주정보</TableHead>
                    {currentTable.rows.some((r) => r.combination) && (
                      <TableHead>조합</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTable.rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.rank}</TableCell>
                      <TableCell className="font-mono">{row.amount}</TableCell>
                      <TableCell className="text-sm">{row.raceDate}</TableCell>
                      {currentTable.rows.some((r) => r.combination) && (
                        <TableCell>{row.combination}</TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- No Hit Tab ---

function NoHitTab() {
  const [data, setData] = useState<NoHitRace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/data/statistics?type=no-hit")
      .then((r) => r.json())
      .then((d) => {
        setData(d.data || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-4 pt-4">
      {loading ? (
        <div className="py-10 text-center text-muted-foreground">로딩 중...</div>
      ) : data.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">데이터 없음</div>
      ) : (
        data.map((event, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-base">{event.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>승식</TableHead>
                      <TableHead>적중번호</TableHead>
                      <TableHead>배당률</TableHead>
                      <TableHead>발매금액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {event.pools.map((pool, j) => (
                      <TableRow key={j}>
                        <TableCell className="font-medium">{pool.poolType}</TableCell>
                        <TableCell>{pool.winNo}</TableCell>
                        <TableCell className="font-mono">{pool.dividend}</TableCell>
                        <TableCell className="font-mono">{pool.sales}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
