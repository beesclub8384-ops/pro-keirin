"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  href: string;
  children?: { label: string; href: string; disabled?: boolean }[];
}

const navItems: NavItem[] = [
  { label: "홈", href: "/" },
  { label: "경륜 가이드", href: "/guide" },
  { label: "배당률 분석", href: "/analysis/odds" },
  {
    label: "경주결과",
    href: "/data/race-results",
    children: [
      { label: "광명스피돔", href: "/data/race-results" },
      { label: "창원레포츠파크", href: "/data/race-results?venue=창원" },
      { label: "부산스포원파크", href: "/data/race-results?venue=부산" },
    ],
  },
  {
    label: "출주표",
    href: "/data/decision-card",
    children: [
      { label: "광명스피돔", href: "/data/decision-card" },
      { label: "창원레포츠파크", href: "#", disabled: true },
      { label: "부산스포원파크", href: "#", disabled: true },
    ],
  },
  { label: "선수 검색", href: "/data/racer-search" },
  { label: "통계", href: "/data/statistics" },
  { label: "매출 통계", href: "/data/sales-statistics" },
  { label: "상금통계", href: "/prize-stats" },
  { label: "판정기록", href: "/violations" },
  { label: "선수 인터뷰", href: "/interview" },
  { label: "륜슐랭", href: "/interview/gyeongshullin" },
  { label: "커뮤니티", href: "/community" },
];

function DesktopDropdown({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-0.5 px-3 py-2 text-sm font-medium text-foreground/80 hover:text-brand transition-colors rounded-md hover:bg-muted"
      >
        {item.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 rounded-md border bg-white shadow-lg py-1 z-50">
          {item.children!.map((child) =>
            child.disabled ? (
              <span
                key={child.label}
                className="block px-4 py-2 text-sm text-muted-foreground cursor-not-allowed"
              >
                {child.label}
                <span className="ml-1.5 text-xs text-muted-foreground/60">준비중</span>
              </span>
            ) : (
              <Link
                key={child.label}
                href={child.href}
                className="block px-4 py-2 text-sm font-medium text-foreground/80 hover:text-brand hover:bg-muted transition-colors"
                onClick={() => setOpen(false)}
              >
                {child.label}
              </Link>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState<string | null>(null);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-24 sm:h-28 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/images/logo.png"
            alt="7randoms"
            width={288}
            height={96}
            priority
            className="h-[72px] w-auto sm:h-[96px]"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) =>
            item.children ? (
              <DesktopDropdown key={item.label} item={item} />
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 text-sm font-medium text-foreground/80 hover:text-brand transition-colors rounded-md hover:bg-muted"
              >
                {item.label}
              </Link>
            )
          )}
        </nav>

        {/* Desktop Right Actions */}
        <div className="hidden lg:flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm">로그인</Button>
          <Button size="sm">회원가입</Button>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex lg:hidden items-center gap-2">
          <Button variant="ghost" size="icon">
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="lg:hidden border-t bg-white">
          <nav className="flex flex-col px-4 py-2">
            {navItems.map((item) =>
              item.children ? (
                <div key={item.label} className="border-b border-muted last:border-0">
                  <button
                    onClick={() => setMobileOpen(mobileOpen === item.label ? null : item.label)}
                    className="flex items-center justify-between w-full py-3 text-sm font-medium text-foreground/80 hover:text-brand"
                  >
                    {item.label}
                    <ChevronDown className={`h-4 w-4 transition-transform ${mobileOpen === item.label ? "rotate-180" : ""}`} />
                  </button>
                  {mobileOpen === item.label && (
                    <div className="pb-2 pl-4 space-y-1">
                      {item.children.map((child) =>
                        child.disabled ? (
                          <span
                            key={child.label}
                            className="block py-2 text-sm text-muted-foreground cursor-not-allowed"
                          >
                            {child.label}
                            <span className="ml-1.5 text-xs text-muted-foreground/60">준비중</span>
                          </span>
                        ) : (
                          <Link
                            key={child.label}
                            href={child.href}
                            className="block py-2 text-sm font-medium text-foreground/80 hover:text-brand"
                            onClick={() => setIsMenuOpen(false)}
                          >
                            {child.label}
                          </Link>
                        )
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="py-3 text-sm font-medium text-foreground/80 hover:text-brand border-b border-muted last:border-0"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </Link>
              )
            )}
            <div className="flex gap-2 py-3">
              <Button variant="outline" size="sm" className="flex-1">로그인</Button>
              <Button size="sm" className="flex-1">회원가입</Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
