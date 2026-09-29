import { AnalysisError } from "@/services/ai/errors";

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof AnalysisError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "リクエストを読み取れませんでした" }, { status: 400 });
  }
  console.error(error);
  return Response.json(
    { error: "処理に失敗しました。しばらくしてからもう一度試してください。" },
    { status: 500 },
  );
}
