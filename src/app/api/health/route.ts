import { NextResponse } from "next/server";
import { dataDirectory } from "@/services/canva/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "kuse",
    dataDirectory: dataDirectory(),
  });
}
