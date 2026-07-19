import { Card, CardContent } from "@/components/ui/card";

interface InsightCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: "blue" | "gray" | "amber";
}

const ACCENT: Record<string, string> = {
  blue: "border-l-blue-600",
  gray: "border-l-gray-400",
  amber: "border-l-amber-500",
};

export function InsightCard({ label, value, sub, accent = "blue" }: InsightCardProps) {
  return (
    <Card className={`border-l-4 ${ACCENT[accent]}`}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-bold leading-tight text-foreground">{value}</div>
        {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
