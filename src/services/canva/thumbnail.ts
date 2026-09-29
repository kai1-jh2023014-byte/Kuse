import { CanvaError } from "./errors";
import { isAllowedCanvaHost } from "./parse";

const MAX_BYTES = 8_000_000;

export async function fetchCanvaThumbnail(url: string, fetchImpl: typeof fetch = fetch): Promise<{ body: ArrayBuffer; contentType: string }> {
  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new CanvaError("サムネイルURLを読めませんでした。", 400, "thumbnail_url");
    }
    if (parsed.protocol !== "https:" || !isAllowedCanvaHost(parsed.hostname)) {
      throw new CanvaError("このサムネイルURLは表示できません。", 400, "thumbnail_host");
    }
    const response = await fetchImpl(parsed, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new CanvaError("サムネイルの転送先がありません。", 502, "thumbnail_redirect");
      current = new URL(location, parsed).toString();
      continue;
    }
    if (!response.ok) throw new CanvaError("サムネイルを取得できませんでした。期限切れの可能性があります。", 502, "thumbnail_fetch");
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      throw new CanvaError("サムネイルが画像として返りませんでした。", 502, "thumbnail_type");
    }
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_BYTES) throw new CanvaError("サムネイルが大きすぎます。", 502, "thumbnail_size");
    return { body, contentType };
  }
  throw new CanvaError("サムネイルのリダイレクトが多すぎます。", 502, "thumbnail_redirect");
}
