import racersData from "@/data/all-racer-names.json";
import RacersClient, { type RacerWithAvailability } from "./RacersClient";
import { computeRacerAvailability } from "@/lib/racer-availability";

// 출주표 갱신 주기(30분)와 맞춤
export const revalidate = 1800;

interface RawRacer {
  name: string;
  grade: string;
  cohort: string;
  initial: string;
}

export default async function RacersPage() {
  const raw = racersData as RawRacer[];

  let availability: Awaited<ReturnType<typeof computeRacerAvailability>> | null = null;
  try {
    availability = await computeRacerAvailability();
  } catch (err) {
    console.error("[/racers] availability fetch failed:", err);
  }

  const merged: RacerWithAvailability[] = raw.map((r) => {
    const a = availability?.availability[r.name];
    return {
      ...r,
      recent30: a?.recent30 ?? 0,
      recent90: a?.recent90 ?? 0,
      lastRaceDate: a?.lastRaceDate ?? null,
      totalDays: a?.totalDays ?? 0,
      isDupName: availability?.dupNames.includes(r.name) ?? false,
    };
  });

  return (
    <RacersClient
      racers={merged}
      asOfDate={availability?.asOfDate ?? null}
      dupNames={availability?.dupNames ?? []}
    />
  );
}
