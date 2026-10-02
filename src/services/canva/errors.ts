export class CanvaError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "CanvaError";
    this.status = status;
    this.code = code;
  }
}

export function toCanvaError(error: unknown): CanvaError {
  if (error instanceof CanvaError) return error;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new CanvaError("Canvaの応答が時間切れになりました。もう一度試してください。", 504, "timeout");
  }
  if (error instanceof SyntaxError) {
    return new CanvaError("保存データまたはCanvaの応答を読めませんでした。", 502, "parse");
  }
  const detail = error instanceof Error ? error.message.trim().slice(0, 180) : "";
  if (detail.startsWith("Canva") || detail.startsWith("トークン")) {
    return new CanvaError(detail, 502, "token");
  }
  return new CanvaError("Canvaとの通信に失敗しました。", 502, "unexpected");
}
