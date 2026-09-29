"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useStudio } from "./studio-provider";

const STEPS = [
  { href: "/", label: "学ぶ", index: "01" },
  { href: "/style", label: "スタイル", index: "02" },
  { href: "/create", label: "つくる", index: "03" },
];

export function AppHeader() {
  const pathname = usePathname();
  const { profile } = useStudio();

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-foreground font-display text-background">K</span>
          <span>
            <span className="block font-display text-[1.65rem] leading-none tracking-wide">KUSE</span>
            <span className="mt-1 block text-[10px] tracking-[0.22em] text-muted-foreground">DESIGN HABITS</span>
          </span>
        </Link>
        <div className="flex items-center justify-between gap-3 md:justify-end">
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
                  <span className="mr-1.5 font-mono text-[10px] opacity-60">{step.index}</span>
                  {step.label}
                </Link>
              );
            })}
          </nav>
          {profile ? (
            <p className="hidden text-xs text-muted-foreground lg:block">{profile.sampleCount}点から学習</p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
