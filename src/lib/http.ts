export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("サーバーに接続できませんでした");
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(data?.error || "処理に失敗しました");
  }
  if (!data) throw new Error("サーバーの応答を読み取れませんでした");
  return data;
}
