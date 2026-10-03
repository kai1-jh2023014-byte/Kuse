/** Client-safe notes for work that the published Canva API does not let us finish yet. */

export const PHASE_NOTES = {
  evaluation:
    "Phase 3。生成結果の色・レイアウト・タイポグラフィ・余白・情報密度・写真・装飾・雰囲気を、design_profile との類似度（style_similarity、0〜100）として評価します。これは出来の良し悪しではありません。サムネイルは短命な署名URLのため、評価への渡し方は未実装です。",
  improvement:
    "Phase 3。改善点は type / problem / suggestion の配列にし、次の生成・編集プロンプトへ落とします。編集ツールの引数スキーマがドキュメントに未掲載のため、まだ Canva へは送りません。",
  loop:
    "まず一度、発表全体を高い密度まで作ります。意図と違ったら指摘を書いて、Canva AI にもう一度渡します。自動繰り返しは任意で、既定は1回です。既存デザインの中身は自動では編集しません。",
  feedback:
    "指摘は1回で捨てません。同じ内容が続くほど、次のCanva指示で優先されます。",
  approval:
    "「この結果が自分らしい」と明示したときだけ、そのデザインから特徴を足して design_profile を更新します。このボタンはまだプロファイルを変えません。",
} as const;

export const AUTO_IMPROVE_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

export const FEEDBACK_PRESETS = [
  "好き",
  "違う",
  "もっと自分らしく",
  "文字をもっと強く",
  "色はこのままで",
  "このレイアウトは好き",
] as const;
