"use client";

import Image from "next/image";
import { BarChart3, TrendingUp, Zap, Users } from "lucide-react";

const quickStats = [
  {
    icon: BarChart3,
    label: "분석 경주 수",
    value: "4,680",
    sub: "최근 1년",
  },
  {
    icon: TrendingUp,
    label: "평균 단승 배당",
    value: "5.2배",
    sub: "전체 등급",
  },
  {
    icon: Zap,
    label: "이변 빈도",
    value: "9.8%",
    sub: "10배 이상",
  },
  {
    icon: Users,
    label: "등록 선수",
    value: "320명",
    sub: "3개 경륜장",
  },
];

export default function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden">
      {/* Background Image */}
      <Image
        src="/images/hero-bg.png"
        alt=""
        fill
        priority
        className="object-cover"
      />
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:py-20 md:py-24">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {quickStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/10 bg-white/5 backdrop-blur p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className="h-4 w-4 text-brand-light" />
                <span className="text-xs text-gray-400">{stat.label}</span>
              </div>
              <p className="text-xl font-bold text-white sm:text-2xl">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
