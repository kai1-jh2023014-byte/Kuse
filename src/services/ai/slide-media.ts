import type { SlideRole, SlideRoleKind } from "./slide-roles";

export type MediaKind = "image" | "video" | "sound" | "none";

export interface MediaCitation {
  title: string;
  creator: string;
  license: string;
  sourceUrl: string;
  fileUrl: string;
  thumbUrl?: string;
}

export interface SlideMedia {
  kind: MediaKind;
  label: string;
  placement: string;
  query: string;
  sound?: string;
  citation?: MediaCitation;
}

const LABEL: Record<MediaKind, string> = {
  image: "画像",
  video: "動画",
  sound: "効果音",
  none: "素材なし",
};

const VISUAL = /アリ|巣|虫|冷蔵庫|写真|画像|イラスト|図|容器|絵の具|印|実験|動画|映像/;

export function wantsWebMedia(note: string): boolean {
  return /ネット|ウェブ|web|画像を探|動画を探|素材を探|取って|拾って/i.test(note);
}

export function suggestSlideMedia(
  slide: Pick<SlideRole, "text" | "role" | "transition" | "transitionAdds">,
): SlideMedia {
  if (slide.transition === "hold") {
    const own = cueFrom(slide.text, slide.role);
    if (own.kind === "none") {
      return {
        kind: "none",
        label: LABEL.none,
        placement: "写真も効果音も、次の切り替えまで出さない。",
        query: "",
      };
    }
    return own;
  }

  const focus = slide.transition === "reveal" && slide.transitionAdds ? slide.transitionAdds : slide.text;
  const cue = cueFrom(focus, slide.role);
  if (slide.transition === "reveal" && cue.kind !== "sound") {
    return {
      ...cue,
      sound: "この要素が出る瞬間に、短い効果音を一つだけ。ループさせない。",
    };
  }
  return cue;
}

function cueFrom(text: string, role: SlideRoleKind): SlideMedia {
  const linked = linkCitation(text);
  if (linked) {
    const kind: MediaKind = /youtu\.?be|vimeo|nhk|\.mp4|\.webm|動画|映像/i.test(text) ? "video" : "image";
    return media(kind, placementFor(kind, text, role), "", linked);
  }
  if (/効果音|SE|サウンド|BGM|音声/.test(text)) {
    return media("sound", "この枚で鳴らす音は一つ。出典は最後に書く。", searchQuery(text), undefined);
  }
  if (/動画|映像/.test(text)) {
    return media("video", "この枚は動画が主役。再生が終わるまで文字を重ねない。", searchQuery(text), undefined);
  }
  if (/写真|画像|イラスト/.test(text) || (VISUAL.test(text) && role !== "empathy")) {
    return media("image", placementFor("image", text, role), searchQuery(text), undefined);
  }
  if (role === "empathy" || role === "impact" || role === "landing") {
    return media("none", "この枚は言葉が主役です。写真も効果音も置かない。", "", undefined);
  }
  if (role === "proof") {
    return media("image", "根拠が目に見える一枚だけ。飾りは足さない。", searchQuery(text), undefined);
  }
  return media("none", "説明の枚に、関係のない写真や効果音は足さない。", "", undefined);
}

function placementFor(kind: MediaKind, text: string, role: SlideRoleKind): string {
  const subject = searchQuery(text) || text.match(VISUAL)?.[0] || "主題";
  if (kind === "video") return `「${subject}」の動画枠を一つきり。中身は生成せず、あとから差し替える。周囲に説明を並べない。`;
  if (role === "parallel") return `「${subject}」の空の写真枠を項目の数だけ、同じ大きさで置く。中身は描かない。`;
  if (role === "title") return `「${subject}」の空の写真枠を一つ。表紙をコラージュにしない。中身の写真は生成しない。`;
  return `「${subject}」の空の写真枠を一つ、余白の中に置く。中身はあとから差し替える。`;
}

function media(kind: MediaKind, placement: string, query: string, citation: MediaCitation | undefined): SlideMedia {
  return {
    kind,
    label: LABEL[kind],
    placement,
    query: kind === "none" ? "" : query,
    ...(citation ? { citation } : {}),
  };
}

export function searchQuery(text: string): string {
  const visual = text.match(VISUAL);
  if (visual?.[0]) {
    const at = visual.index ?? 0;
    let start = at;
    let end = at + visual[0].length;
    const wordChar = /[一-龯ァ-ヶーA-Za-z0-9]/;
    while (start > 0 && wordChar.test(text[start - 1] ?? "")) start -= 1;
    while (end < text.length && wordChar.test(text[end] ?? "")) end += 1;
    const word = text.slice(start, end);
    if (word.length >= 2 && word.length <= 16) return word;
    return "";
  }
  const line = text.split("\n")[0]?.replace(/https?:\/\/\S+/g, "").replace(/[。．、]/g, " ").trim() ?? "";
  return line.slice(0, 40);
}

function linkCitation(text: string): MediaCitation | undefined {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) return undefined;
  const sourceUrl = match[0].replace(/[)。、。．]+$/g, "");
  let host = sourceUrl;
  try {
    host = new URL(sourceUrl).host;
  } catch {
    host = sourceUrl;
  }
  return {
    title: sourceUrl,
    creator: host,
    license: "リンク先の利用条件に従う",
    sourceUrl,
    fileUrl: sourceUrl,
  };
}

export function mediaSection(media: SlideMedia | undefined): string {
  if (!media) return "";
  const lines = [`素材: ${media.label}。${media.placement}`];
  if (media.sound) lines.push(`効果音: ${media.sound}`);
  if (media.citation) {
    lines.push(
      `引用: ${media.citation.creator} / ${media.citation.license} / ${media.citation.sourceUrl}`,
    );
    lines.push("この引用をスライドの端に小さく書く。出典を消さない。");
  }
  return lines.join("\n");
}
