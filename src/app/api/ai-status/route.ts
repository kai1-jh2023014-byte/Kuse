import { configuredModel, providerMode } from "@/services/ai/provider";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    mode: providerMode(),
    model: configuredModel(),
  });
}
