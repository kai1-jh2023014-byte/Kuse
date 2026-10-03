import type { ImageAnalysis, RawImageSignals } from "./types";
import type { SlideMedia } from "./slide-media";

export interface ReferenceNote {
  id: string;
  name: string;
  note: string;
}

export function describeReferenceSignals(signals: RawImageSignals, name: string): string {
  const subject = name.replace(/\.[a-z0-9]+$/i, "") || "資料";
  const landscape = signals.orientation === "landscape" || signals.width > signals.height;
  const crop = landscape ? "横位置" : signals.orientation === "square" ? "正方形に近い" : "縦位置";
  const weight =
    signals.horizontalBalance < 0.42 ? "左寄り" : signals.horizontalBalance > 0.58 ? "右寄り" : "中央寄り";
  const air = signals.whitespace > 0.42 ? "余白が広い" : signals.whitespace < 0.22 ? "面が詰まっている" : "余白は中くらい";
  const light = signals.brightness > 0.62 ? "明るい" : signals.brightness < 0.38 ? "暗い" : "中間の明るさ";
  if (signals.photoScore >= 0.45 && signals.textScore < 0.55) {
    return `「${subject}」は${crop}の写真。被写体は${weight}、${air}、${light}。構図とトリミングの参考にする。中身の写真そのものは複製しない。`;
  }
  return `「${subject}」は文字や図の資料。余白と重心（${weight}、${air}）だけ参考にする。この画面の写真をスライドに描き写さない。`;
}

export function notesFromAnalyses(analyses: ImageAnalysis[], ids: string[]): ReferenceNote[] {
  const wanted = new Set(ids);
  return analyses
    .filter((item) => wanted.has(item.id))
    .map((item) => ({
      id: item.id,
      name: item.filename,
      note: describeReferenceSignals(item.signals, item.filename),
    }));
}

export function referenceSection(input: {
  notes: ReferenceNote[];
  media?: SlideMedia | null;
  imagery?: string;
}): string {
  const lines = [
    "【参考画像と写真枠】",
    "本番の写真は、生成後に利用者が Canva 上で入れます。今は写真を描き込まないでください。",
    "AIで人物・風景・ストック写真を生成しないでください。Magic Studio の写真生成も使わないでください。",
    "写真が必要な場所は、薄い灰色の空枠にしてください。枠の中に「写真」や lorem 以外の、差し替え内容が分かる短いラベルだけ書いてください。",
  ];
  if (input.media?.kind === "image" && input.media.query) {
    lines.push(`この枚の写真枠のラベルは「${input.media.query}」。置き方: ${input.media.placement}`);
  } else if (input.media?.kind === "none") {
    lines.push("この枚に写真枠は置かない。文字だけで成立させる。");
  } else if (input.media?.kind === "image") {
    lines.push(`写真枠の置き方: ${input.media.placement}`);
  }
  if (input.imagery?.trim()) {
    lines.push(`差し替え予定のメモ: ${input.imagery.trim()}`);
  }
  if (input.notes.length) {
    lines.push("資料から選んだ参考は、構図・余白・明るさの目安です。中身をコピーしないでください。");
    for (const note of input.notes) lines.push(`- ${note.note}`);
  } else {
    lines.push("参考写真のファイルはまだ選んでいません。枠の位置と大きさだけ、この枚の役割に合わせて空けてください。");
  }
  return lines.join("\n");
}
