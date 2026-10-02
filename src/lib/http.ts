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
    if (data?.error) throw new Error(data.error);
    throw new Error(`サーバーが ${response.status} を返しました。Canvaの接続を確認してください。`);
  }
  if (!data) throw new Error("サーバーの応答を読み取れませんでした");
  return data;
}
