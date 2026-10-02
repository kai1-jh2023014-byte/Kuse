import type { DesignBrief } from "@/services/ai/types";

/** Mid-size talk used to fill the studio during development. Not a user-facing template. */
export const TEST_TALK_PURPOSE = "新規事業の方針発表で、現場が自分ごととして動き出せるようにする";

export const TEST_TALK_AUDIENCE = "事業部と開発のリーダー、およそ40人";

export const TEST_TALK_BRIEF: DesignBrief = {
  purpose: TEST_TALK_PURPOSE,
  audience: TEST_TALK_AUDIENCE,
  copyText: "",
  size: "16:9（発表）",
  mood: "落ち着いて、一点だけ熱い",
  imagery: "",
  notes: "中規模の発表。枚は10枚を超える。1枚1メッセージ。",
};

export const TEST_TALK_MANUSCRIPT = [
  "方針を決めた。",
  "みなさんはきっと、また上からの方針だと感じている。",
  "現場は忙しい。",
  "説明は長い。",
  "動かない。",
  "一番伝えたいのは、来期は新規を増やすことではない。今ある仕事の終わり方を決めることだ。",
  "終わらせる対象は三つ。問い合わせの二重対応。週次の報告会。使われていない管理画面。",
  "残すものは一つ。お客が自分で状況を見られる画面。",
  "来月、問い合わせの二重対応を止める。",
  "再来月、報告会を月1にする。",
  "今四半期の終わりに、管理画面を閉じる。",
  "数字は後からついてくる。先に現場の時間が戻る。",
  "持ち帰ってほしいのは、自分のチームで、最初に止める仕事を一つ決めること。",
].join("\n\n");
