"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const dataSubItems = [
  { label: "경주결과", href: "/data/race-results" },
  { label: "출주표", href: "/data/decision-card" },
  { label: "선수 검색", href: "/data/racer-search" },
  { label: "통계", href: "/data/statistics" },
];

const navItems = [
  { label: "홈", href: "/" },
  { label: "배당률 분석", href: "/analysis/odds" },
  { label: "데이터 조회", href: "/data/race-results", children: dataSubItems },
  { label: "선수 인터뷰", href: "/interview" },
  { label: "경륜 가이드", href: "/guide" },
  { label: "커뮤니티", href: "/community" },
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDataOpen, setIsDataOpen] = useState(false);
  const [mobileDataOpen, setMobileDataOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDataOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
              <div
                key={item.href}
                ref={dropdownRef}
                className="relative"
                onMouseEnter={() => setIsDataOpen(true)}
                onMouseLeave={() => setIsDataOpen(false)}
              >
                <button
                  className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-foreground/80 hover:text-brand transition-colors rounded-md hover:bg-muted"
                  onClick={() => setIsDataOpen(!isDataOpen)}
                >
                  {item.label}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {isDataOpen && (
                  <div className="absolute top-full left-0 mt-1 w-40 rounded-md border bg-white shadow-lg py-1 z-50">
                    {item.children.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className="block px-4 py-2 text-sm text-foreground/80 hover:text-brand hover:bg-muted transition-colors"
                        onClick={() => setIsDataOpen(false)}
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
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
                <div key={item.href} className="border-b border-muted last:border-0">
                  <button
                    className="flex w-full items-center justify-between py-3 text-sm font-medium text-foreground/80 hover:text-brand"
                    onClick={() => setMobileDataOpen(!mobileDataOpen)}
                  >
                    {item.label}
                    <ChevronDown className={`h-4 w-4 transition-transform ${mobileDataOpen ? "rotate-180" : ""}`} />
                  </button>
                  {mobileDataOpen && (
                    <div className="pb-2 pl-4">
                      {item.children.map((sub) => (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className="block py-2 text-sm text-foreground/60 hover:text-brand"
                          onClick={() => { setIsMenuOpen(false); setMobileDataOpen(false); }}
                        >
                          {sub.label}
                        </Link>
                      ))}
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
