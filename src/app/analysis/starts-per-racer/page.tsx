import type { Metadata } from "next";
import {
  getYearlyStarts,
  COVID_YEARS,
  DAYS_PER_ROUND,
  IN_PROGRESS_AS_OF,
  IN_PROGRESS_YEAR,
  type YearlyStarts,
} from "@/lib/starts-per-racer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StartsChart } from "./_components/StartsChart";

export const metadata: Metadata = {
  title: "선수 1인당 연간 출주횟수 | 7randoms",
  description:
    "경륜 선수 1인당 연간 출주횟수 추이(2010~2026). kcycle 선수조회 공식 출주횟수를 현역·은퇴 선수 1,176명 전수 수집해 집계했다.",
};

// 연도별 집계라 갱신 빈도가 낮다 — 하루 1회
export const revalidate = 86400;

const isCovid = (year: number) => COVID_YEARS.includes(year);
const isPartial = (year: number) => year >= IN_PROGRESS_YEAR;

/** 조사 방법·검증·한계 본문 — 문단 하나당 소제목 + 내용 */
const NOTES: { title: string; body: string }[] = [
  {
    title: "데이터 출처",
    body: "kcycle 선수조회(kcycle.or.kr/racer/info)의 경주성적란에 표기된 공식 출주횟수를 선수별·연도별로 수집했다. 공단이 직접 표기한 수치이며, 광명·창원·부산 3개 경기장이 합산돼 있다.",
  },
  {
    title: "수집 범위",
    body: "현역 574명 + 은퇴 602명 = 총 1,176명을 전수 조회했다. 은퇴 선수를 포함해야 과거 연도가 정확해진다.",
  },
  {
    title: "집계 기준",
    body: "그 해 출주 기록이 있는 선수만 집계한다(출주일수 > 0). 등록만 되어 있고 출전하지 않은 선수는 제외한다.",
  },
  {
    title: "총 경주 수 산출",
    body: "경주 1개에 7명이 출전하므로, 전 선수 출주일수 합계를 7로 나눠 산출했다. 17년간 경주당 평균 인원은 6.99명으로 일정했다.",
  },
  {
    title: "출주횟수와 경주 수의 차이",
    body: "출주횟수는 배정받은 '회차' 수이지 경주 수가 아니다. 한 회차는 통상 3일(3경주)이다. 일부 특별경륜은 4일로 진행되나, 17년간 회차당 평균 일수는 2.99~3.07일로 변동이 3% 이내다.",
  },
];

const LIMITS: { title: string; body: string }[] = [
  {
    title: `${IN_PROGRESS_YEAR}년은 진행 중`,
    body: `${IN_PROGRESS_AS_OF}까지의 수치다. 연말까지 변한다.`,
  },
  {
    title: `${COVID_YEARS.join("~")}년은 정상 운영이 아니다`,
    body: "코로나로 경주가 대폭 축소됐다. 2020년은 연간 747경주로 평년의 6분의 1 수준이었다. 다른 해와 직접 비교할 수 없다.",
  },
  {
    title: "2019년 급락 원인 미확인",
    body: "2018년 18.36회에서 2019년 16.49회로 1.87회 급락했다. 선수 수는 6명 늘었을 뿐이므로 경주 수 감소가 원인이나, 그 사유는 확인되지 않았다.",
  },
];

export default async function StartsPerRacerPage() {
  let rows: YearlyStarts[] = [];
  let loadError: string | null = null;
  try {
    rows = await getYearlyStarts();
  } catch (err) {
    // 조용히 빈 화면을 내보내지 않고 실패를 드러낸다
    console.error("[/analysis/starts-per-racer] load failed:", err);
    loadError = err instanceof Error ? err.message : String(err);
  }

  if (loadError || rows.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-xl font-bold">선수 1인당 연간 출주횟수</h1>
        <p className="mt-4 text-sm text-red-500">
          데이터를 불러오지 못했습니다{loadError ? `: ${loadError}` : "."}
        </p>
      </main>
    );
  }

  // 헤드라인 기준 = 진행 중 연도를 뺀 가장 최근 연도
  const fullYears = rows.filter((r) => !isPartial(r.year));
  const latest = fullYears[fullYears.length - 1];
  // 최고점 = 코로나·진행 중 연도를 뺀 정상 운영 연도 중 최대
  const peak = fullYears
    .filter((r) => !isCovid(r.year))
    .reduce((a, b) => (b.avgStarts > a.avgStarts ? b : a));
  const maxAvg = Math.max(...rows.map((r) => r.avgStarts));
  const racesPerYear = Math.round(latest.avgStarts * DAYS_PER_ROUND);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* ① 헤드라인 */}
      <header>
        <h1 className="text-lg font-bold sm:text-xl">선수 1인당 연간 출주횟수</h1>
        <p className="mt-6 text-6xl font-bold tracking-tight text-brand tabular-nums sm:text-7xl">
          {latest.avgStarts.toFixed(2)}
          <span className="ml-1 text-2xl font-semibold sm:text-3xl">회</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {latest.year}년 · {latest.racerCount.toLocaleString()}명 기준
        </p>
        <p className="mt-5 text-sm leading-relaxed text-foreground/80">
          한 회차는 통상 {DAYS_PER_ROUND}일({DAYS_PER_ROUND}경주)이므로 연 약{" "}
          {racesPerYear}경주에 해당한다.
        </p>
      </header>

      {/* ② 차트 */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">연도별 추이</h2>
        <StartsChart rows={rows} peakYear={peak} latestFullYear={latest} />
      </section>

      {/* ③ 표 */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">연도별 수치</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[68px]">연도</TableHead>
              <TableHead className="text-right">총 경주 수</TableHead>
              <TableHead className="text-right">출전 선수 수</TableHead>
              <TableHead className="min-w-[132px] text-right">1인당 출주횟수</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const dim = isCovid(r.year) || isPartial(r.year);
              const mark = isCovid(r.year) ? "1" : isPartial(r.year) ? "2" : null;
              return (
                <TableRow key={r.year} className={dim ? "text-muted-foreground" : undefined}>
                  <TableCell className="font-medium tabular-nums">
                    {r.year}
                    {mark && <sup className="ml-0.5 text-[10px]">{mark}</sup>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.totalRaces.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.racerCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="relative text-right tabular-nums">
                    <span
                      aria-hidden
                      className={`absolute inset-y-1 left-0 rounded-sm ${
                        dim ? "bg-muted-foreground/15" : "bg-brand/15"
                      }`}
                      style={{ width: `${(r.avgStarts / maxAvg) * 100}%` }}
                    />
                    <span className="relative font-medium">{r.avgStarts.toFixed(2)}</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
          <li>
            <sup>1</sup> 코로나로 경주가 대폭 축소된 해 ({COVID_YEARS.join("·")}년)
          </li>
          <li>
            <sup>2</sup> {IN_PROGRESS_AS_OF}까지 진행 중
          </li>
        </ul>
      </section>

      {/* ④⑤⑥ 접힘 섹션 */}
      <section className="mt-10">
        <Accordion type="multiple" className="rounded-lg border px-4">
          <AccordionItem value="method">
            <AccordionTrigger>조사 방법</AccordionTrigger>
            <AccordionContent className="space-y-4">
              {NOTES.map((n) => (
                <div key={n.title}>
                  <p className="font-medium">{n.title}</p>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{n.body}</p>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="verification">
            <AccordionTrigger>검증</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <div>
                <p className="font-medium">자체 수집 데이터와 대조</p>
                <p className="mt-1 leading-relaxed text-muted-foreground">
                  7randoms가 별도로 수집한 출주표 원문 데이터와 대조했다.
                </p>
                <dl className="mt-2 space-y-1 text-muted-foreground">
                  <div className="flex gap-3">
                    <dt className="w-24 shrink-0">출전 선수 수</dt>
                    <dd>2022~2026년 전 연도 완전 일치 (차이 0명)</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="w-24 shrink-0">출주일수</dt>
                    <dd>2022년 517명 전원 일치</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="w-24 shrink-0">총 경주 수</dt>
                    <dd>오차 0.2% 이내 (4,240 vs 4,233 등)</dd>
                  </div>
                </dl>
              </div>
              <div>
                <p className="font-medium">공식 문서와 대조</p>
                <p className="mt-1 leading-relaxed text-muted-foreground">
                  2026년도 하반기 등급심사 자료(575명 전원 명부)와 대조한 결과 오차 0명이었다.
                </p>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  문서 575명 − 미출전 20명 − 2025년 기록 2명 + 하반기 복귀 5명 = 558명
                  <br />
                  집계 결과 = 558명
                </p>
              </div>
              <div>
                <p className="font-medium">개별 선수 대조</p>
                <p className="mt-1 leading-relaxed text-muted-foreground">
                  강동국(19990041) 2026년 = 11회 / 34일, 2023년 = 19회 / 60일. kcycle 화면 표기와
                  일치.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="limits">
            <AccordionTrigger>한계</AccordionTrigger>
            <AccordionContent className="space-y-4">
              {LIMITS.map((n) => (
                <div key={n.title}>
                  <p className="font-medium">{n.title}</p>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{n.body}</p>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </main>
  );
}
