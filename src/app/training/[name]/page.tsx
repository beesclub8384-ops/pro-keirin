"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Racer {
  racerId: string;
  name: string;
  gradeChange: string;
  winRate: number;
  top2Rate: number;
  top3Rate: number;
  year: number;
}

export default function TrainingPage() {
  const params = useParams();
  const router = useRouter();
  const name = decodeURIComponent(params.name as string);

  const [racers, setRacers] = useState<Racer[]>([]);
  const [year, setYear] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/training/${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((d) => {
        setRacers(d.racers || []);
        setYear(d.year || 0);
      })
      .finally(() => setLoading(false));
  }, [name]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          뒤로
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{name} 훈련지</h1>
        {year > 0 && (
          <p className="text-sm text-muted-foreground mt-1">{year}년 기준</p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          로딩 중...
        </div>
      ) : racers.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          해당 훈련지 선수가 없습니다.
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">선수 {racers.length}명</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {racers.map((racer) => (
              <Link
                key={racer.racerId}
                href={`/data/racer-search?q=${encodeURIComponent(racer.name)}`}
              >
                <Card className="cursor-pointer transition-colors hover:bg-accent/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{racer.name}</CardTitle>
                      {racer.gradeChange && (
                        <Badge variant="outline">{racer.gradeChange}</Badge>
                      )}
                    </div>
                    <div className="flex gap-3 text-sm text-muted-foreground">
                      <span>승률 {racer.winRate}%</span>
                      <span>연대율 {racer.top2Rate}%</span>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
