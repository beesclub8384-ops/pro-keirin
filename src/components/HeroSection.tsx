"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const slides = [
  {
    id: 1,
    title: "2026 그랑프리",
    subtitle: "최고의 선수들이 펼치는 최고의 경주",
    description: "대한민국 경륜 최대의 축제가 돌아옵니다",
    bgColor: "from-keirin-red to-keirin-red-dark",
    accent: "경주 일정 보기",
  },
  {
    id: 2,
    title: "프로경륜선수노동조합",
    subtitle: "선수가 중심이 되는 경륜",
    description: "팬과 선수가 함께 만들어가는 경륜 문화",
    bgColor: "from-keirin-dark to-gray-900",
    accent: "조합 소개",
  },
  {
    id: 3,
    title: "경륜을 처음 접하시나요?",
    subtitle: "쉽고 재미있는 경륜 가이드",
    description: "출주표 읽는 법부터 전법까지, 한눈에 알아보세요",
    bgColor: "from-blue-700 to-blue-900",
    accent: "가이드 보기",
  },
];

export default function HeroSection() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const prev = () => setCurrent((c) => (c - 1 + slides.length) % slides.length);
  const next = () => setCurrent((c) => (c + 1) % slides.length);

  return (
    <section className="relative w-full overflow-hidden">
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {slides.map((slide) => (
          <div
            key={slide.id}
            className={`min-w-full bg-gradient-to-br ${slide.bgColor} relative`}
          >
            <div className="mx-auto max-w-7xl px-4 py-20 sm:py-28 md:py-36">
              <div className="max-w-xl text-white">
                <p className="mb-2 text-sm font-medium uppercase tracking-wider text-white/70">
                  {slide.subtitle}
                </p>
                <h1 className="mb-4 text-3xl font-bold sm:text-4xl md:text-5xl">
                  {slide.title}
                </h1>
                <p className="mb-8 text-base text-white/80 sm:text-lg">
                  {slide.description}
                </p>
                <Button
                  size="lg"
                  className="bg-white text-keirin-dark hover:bg-white/90 font-semibold"
                >
                  {slide.accent}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={prev}
        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white hover:bg-black/50 transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        onClick={next}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white hover:bg-black/50 transition-colors"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`h-2 rounded-full transition-all ${
              i === current ? "w-6 bg-white" : "w-2 bg-white/50"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
