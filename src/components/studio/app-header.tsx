"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useStudio } from "./studio-provider";

const STEPS = [
  { href: "/", label: "つくる" },
  { href: "/learn", label: "癖" },
  { href: "/canva", label: "Canva" },
];

export function AppHeader() {
  const pathname = usePathname();
  const { profile, manuscript, slidePlan } = useStudio();
  const hasTalk = manuscript.trim().length > 0;
  const hasDeck = Boolean(slidePlan && slidePlan.slides.length > 0);

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-5 py-3 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-foreground font-display text-background">K</span>
            <span>
              <span className="block font-display text-[1.65rem] leading-none tracking-wide">KUSE</span>
              <span className="mt-1 block text-[10px] tracking-[0.22em] text-muted-foreground">SLIDES IN ONE PASTE</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {STEPS.map((step) => {
              const active = pathname === step.href;
              return (
                <Link
                  key={step.href}
                  href={step.href}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {step.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <ol className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <li className={cn(hasTalk && "text-foreground")}>1 貼る</li>
          <li aria-hidden="true">→</li>
          <li className={cn(hasDeck && "text-foreground")}>2 枚になる</li>
          <li aria-hidden="true">→</li>
          <li className={cn(pathname === "/canva" && "text-foreground")}>3 Canva</li>
          {profile ? <li className="ml-auto hidden sm:block">癖 {profile.sampleCount}点</li> : null}
        </ol>
      </div>
    </header>
  );
}
