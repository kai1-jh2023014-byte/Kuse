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
    "【ビジュアルの密度】",
    "アプリ内の Canva AI と同じように、写真・図・グラフでページを仕上げてください。",
    "空の灰色枠や「写真」というラベルだけで終わらせないでください。",
  ];
  if (input.imagery?.trim()) lines.push(`希望: ${input.imagery.trim()}`);
  if (input.notes.length) {
    lines.push("参考資料があるときは、構図と余白の目安にしてください。中身の複製は不要です。");
    for (const note of input.notes) lines.push(`- ${note.note}`);
  }
  return lines.join("\n");
}
