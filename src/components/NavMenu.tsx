"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PAGES = [
  { href: "/", icon: "💬", label: "Chat" },
  { href: "/learn", icon: "📚", label: "Phrase library" },
  { href: "/quiz", icon: "📝", label: "Quiz" },
  { href: "/review", icon: "📅", label: "Today’s review" },
  { href: "/saved", icon: "★", label: "Saved" },
  { href: "/translate", icon: "🌐", label: "Chinese → English" },
  { href: "/listen", icon: "🎧", label: "Text to speech" },
];

/**
 * ☰ 選單:列出所有頁面,另加登出。
 * 頁面愈來愈多,逐個掣放在頂部的話,手機上標題列會擠到看不見標題,所以集中在這裏。
 */
export default function NavMenu() {
  const [open, setOpen] = useState(false);
  const [gated, setGated] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setGated(document.cookie.split("; ").some((c) => c === "et_ui=1"));
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  return (
    <span className="nav-menu" ref={wrapRef}>
      <button
        type="button"
        className="ghost-btn"
        onClick={() => setOpen((o) => !o)}
        title="Menu"
        aria-label="Menu"
        aria-expanded={open}
      >
        ☰
      </button>
      {open && (
        <span className="nav-pop" role="menu">
          {PAGES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              role="menuitem"
              className={`nav-item${pathname === p.href ? " on" : ""}`}
              onClick={() => setOpen(false)}
            >
              <span className="nav-icon">{p.icon}</span>
              {p.label}
            </Link>
          ))}
          {gated && (
            <button type="button" role="menuitem" className="nav-item" onClick={logout}>
              <span className="nav-icon">🔒</span>
              Log out
            </button>
          )}
        </span>
      )}
    </span>
  );
}
