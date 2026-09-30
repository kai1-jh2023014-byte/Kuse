"use client";

import { useEffect, useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function DesktopHint() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    queueMicrotask(() => {
      setStandalone(window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true);
    });
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone) return null;

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <MonitorSmartphone className="size-4" />
        デスクトップから開く
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        このパソコンで使うときは、リポジトリで <code className="rounded bg-secondary px-1">npm run install-shortcut</code>{" "}
        を実行すると、デスクトップに KUSE のショートカットが置かれます。ダブルクリックでサーバーを起こし、ブラウザ枠なしで開きます。
      </p>
      {installEvent ? (
        <Button
          type="button"
          className="mt-3 h-9"
          onClick={() => {
            void installEvent.prompt();
          }}
        >
          このブラウザからアプリとして入れる
        </Button>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Chrome や Edge なら、アドレスバー右のインストールからも、ウィンドウとして残せます。
        </p>
      )}
    </div>
  );
}

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}
