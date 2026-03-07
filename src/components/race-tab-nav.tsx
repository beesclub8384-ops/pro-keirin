"use client";

import { useEffect, useRef, useState } from "react";

interface RaceTabNavProps {
  raceNos: number[];
}

export function RaceTabNav({ raceNos }: RaceTabNavProps) {
  const [activeRace, setActiveRace] = useState<number>(raceNos[0] ?? 1);
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // IntersectionObserver to track which race card is visible
  useEffect(() => {
    if (raceNos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const no = parseInt(entry.target.id.replace("race-", ""), 10);
            if (!isNaN(no)) setActiveRace(no);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    for (const no of raceNos) {
      const el = document.getElementById(`race-${no}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [raceNos]);

  // Auto-scroll active tab into view
  useEffect(() => {
    const btn = btnRefs.current.get(activeRace);
    if (btn && containerRef.current) {
      btn.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }, [activeRace]);

  if (raceNos.length === 0) return null;

  const handleClick = (no: number) => {
    const el = document.getElementById(`race-${no}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="sticky top-0 z-30 -mx-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div
        ref={containerRef}
        className="flex gap-1 overflow-x-auto px-1 py-2 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {raceNos.map((no) => (
          <button
            key={no}
            ref={(el) => { if (el) btnRefs.current.set(no, el); }}
            onClick={() => handleClick(no)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeRace === no
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {no}R
          </button>
        ))}
      </div>
    </div>
  );
}
