"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const menuItems = [
  { label: "경륜이란", href: "/interview/about" },
  { label: "팀", href: "/interview/team" },
  { label: "경슐랭", href: "/interview/gyeongshullin" },
];

export default function InterviewHeaderMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-40 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-brand"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
