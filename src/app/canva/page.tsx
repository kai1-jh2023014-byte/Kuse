import { Suspense } from "react";
import { CanvaScreen } from "@/components/studio/canva-screen";

export default function CanvaPage() {
  return (
    <Suspense fallback={<p className="px-8 py-20 text-sm text-muted-foreground">Canva連携を開いています…</p>}>
      <CanvaScreen />
    </Suspense>
  );
}
