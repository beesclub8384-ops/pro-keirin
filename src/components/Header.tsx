"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { label: "홈", href: "/" },
  { label: "배당률 분석", href: "/analysis/odds" },
  { label: "선수 인터뷰", href: "/interview" },
  { label: "경륜 가이드", href: "/guide" },
  { label: "커뮤니티", href: "/community" },
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/images/logo.png"
            alt="7randoms"
            width={144}
            height={48}
            priority
            className="h-9 w-auto sm:h-12"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 text-sm font-medium text-foreground/80 hover:text-brand transition-colors rounded-md hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
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
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-3 text-sm font-medium text-foreground/80 hover:text-brand border-b border-muted last:border-0"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
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
