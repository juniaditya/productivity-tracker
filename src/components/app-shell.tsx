"use client";

import {
  BarChart3,
  CalendarCheck2,
  CalendarClock,
  LayoutDashboard,
  Loader2,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { APP_NAME } from "@/lib/constants";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";

const items = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/timeline", label: "Timeline", icon: CalendarClock },
  { href: "/habits", label: "Habits", icon: CalendarCheck2 },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    items.forEach(({ href }) => router.prefetch(href));
  }, [router]);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    const cancel = () => setPendingHref(null);
    window.addEventListener("focus-ledger:navigation-cancelled", cancel);
    return () => window.removeEventListener("focus-ledger:navigation-cancelled", cancel);
  }, []);

  function handleNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (href === pathname) return;
    setPendingHref(href);

    // Timeline owns unsaved state. Give it a chance to flush before the route
    // unmounts so a fast click cannot discard the last edits.
    if (pathname === "/timeline") {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("focus-ledger:timeline-navigate", { detail: { href } }));
    }
  }

  function navItem(href: string, label: string, Icon: LucideIcon, mobile = false) {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    const pending = pendingHref === href;
    return (
      <Link
        key={href}
        href={href}
        prefetch
        onClick={(event) => handleNavigation(event, href)}
        aria-busy={pending}
        className={mobile
          ? `flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium transition-colors ${active || pending ? "text-primary" : "text-muted-foreground"}`
          : `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${active || pending ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"}`}
      >
        {pending ? <Loader2 className={mobile ? "size-5 animate-spin" : "size-4 animate-spin"} /> : <Icon className={mobile ? "size-5" : "size-4"} />}
        {label}
      </Link>
    );
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      {pendingHref ? <div className="fixed inset-x-0 top-0 z-[80] h-0.5 overflow-hidden bg-primary/15"><div className="h-full w-2/3 animate-pulse bg-primary" /></div> : null}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-sidebar p-4 lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">FL</div>
          <div>
            <p className="font-semibold tracking-tight">{APP_NAME}</p>
            <p className="text-xs text-muted-foreground">Personal productivity ledger</p>
          </div>
        </div>

        <nav className="mt-6 space-y-1">
          {items.map(({ href, label, icon }) => navItem(href, label, icon))}
        </nav>

        <div className="mt-auto border-t border-border pt-4">
          <ThemeToggle />
          <SignOutButton />
          <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">15-minute timeline · manual habits · personal insights</p>
        </div>
      </aside>

      <main className="pb-24 lg:ml-64 lg:pb-0">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden">
        {items.map(({ href, label, icon }) => navItem(href, label, icon, true))}
      </nav>
    </div>
  );
}
