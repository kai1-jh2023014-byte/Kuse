/** Client-safe notes for work that the published Canva API does not let us finish yet. */

export const PHASE_NOTES = {
  evaluation:
    "Phase 3。生成結果の色・レイアウト・タイポグラフィ・余白・情報密度・写真・装飾・雰囲気を、design_profile との類似度（style_similarity、0〜100）として評価します。これは出来の良し悪しではありません。サムネイルは短命な署名URLのため、評価への渡し方は未実装です。",
  improvement:
    "Phase 3。改善点は type / problem / suggestion の配列にし、次の生成・編集プロンプトへ落とします。編集ツールの引数スキーマがドキュメントに未掲載のため、まだ Canva へは送りません。",
  loop:
    "Phase 4。生成→評価→改善は最大3回です。公式の編集操作の引数を tools/list で確認できるまで、ループ自体は回しません。",
  feedback:
    "Phase 5。好き・違う、などのフィードバックは次の改善に使います。生成結果を勝手に正解としては学習しません。",
  approval:
    "「この結果が自分らしい」と明示したときだけ、そのデザインから特徴を足して design_profile を更新します。このボタンはまだプロファイルを変えません。",
} as const;

export const AUTO_IMPROVE_OPTIONS = [1, 2, 3] as const;

export const FEEDBACK_PRESETS = [
  "好き",
  "違う",
  "もっと自分らしく",
  "文字をもっと強く",
  "色はこのままで",
  "このレイアウトは好き",
] as const;
