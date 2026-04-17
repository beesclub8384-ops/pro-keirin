import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function InterviewAboutPage() {
  return (
    <div>
      <div className="mb-6">
        <Link
          href="/interview"
          className="inline-flex items-center gap-1 text-sm font-medium text-white/70 hover:text-white transition-colors"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
        >
          <ChevronLeft className="h-4 w-4" />
          돌아가기
        </Link>
      </div>
      <div className="rounded-xl bg-white/95 shadow-lg backdrop-blur-sm px-6 py-16 text-center sm:px-10">
        <h1 className="text-2xl font-bold text-foreground mb-4">경륜이란</h1>
        <p className="text-sm text-muted-foreground">준비 중입니다</p>
      </div>
    </div>
  );
}
