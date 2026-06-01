import racersData from "@/data/all-racer-names.json";
import RacersClient from "./RacersClient";

interface Racer {
  name: string;
  grade: string;
  cohort: string;
  initial: string;
}

export default function RacersPage() {
  return <RacersClient racers={racersData as Racer[]} />;
}
