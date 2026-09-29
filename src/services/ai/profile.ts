import { describeColor, hexDistance, hexToRgb, rgbToHex, rgbToHsl, sameHueFamily } from "./color";
import {
  confidenceFrom,
  evidenceFor,
  isEstablished,
  isProvisional,
  measureSupport,
  recencyWeights,
  weightedMean,
  type Support,
} from "./stats";
import type {
  DesignProfile,
  DiscoveredTrait,
  ImageAnalysis,
  PersonalTendency,
  ProfileMetrics,
  RawImageSignals,
  StyleRelationships,
} from "./types";
import { AnalysisError } from "./errors";

interface Habit {
  id: string;
  statement: string;
  category: string;
  support: Support;
  confidence: number;
  evidence: string;
  order: number;
}

const AVOID: Record<string, string> = {
  "layout.top": "主な情報を画面の下や中央だけにまとめて置くこと",
  "layout.left": "内容を左右へ均等に割り、重心を消すこと",
  "layout.right": "内容を左へ戻して左右均等にすること",
  "layout.center": "情報を隅へ散らすこと",
  "layout.asymmetric": "すべてを中央揃えにして左右対称に整えること",
  "layout.generous-space": "情報を端まで埋めて余白を潰すこと",
  "layout.dense": "余白を大きく取りすぎて情報を減らすこと",
  "layout.single-mass": "画面を等分グリッドで細かく区切ること",
  "color.high-contrast": "背景と文字の明度を近づけてぼかすこと",
  "color.low-contrast": "コントラストを極端に上げて看板のようにすること",
  "color.muted": "原色を何色も並べること",
  "color.vivid": "全体を無彩色のグレーだけでまとめること",
  "color.dark-ground": "白い背景にパステルを散らすこと",
  "color.light-ground": "全体を暗いトーンに染め替えること",
  "color.single-accent": "アクセントカラーを何色も並べること",
  "color.flat-background": "背景を写真や細かいパターンにすること",
  "type.strong-scale": "見出しと本文の大きさを近づけ、均一な文字サイズにすること",
  "type.text-led": "写真を全面に使って文字を脇役にすること",
  "visual.no-photo": "ストック写真を主役にすること",
  "visual.photo-led": "写真を消して色面だけにすること",
  "visual.little-decoration": "ドロップシャドウ、グラデーション、額縁のような装飾を足すこと",
  "visual.gradient": "面を完全な単色だけにすること",
  "visual.shadow": "すべての要素を影なしの平面に戻すこと",
  "visual.border": "枠線をすべて外すこと",
};

export function createDesignProfile(
  analyses: ImageAnalysis[],
  previous: DesignProfile | null,
  options?: { mode?: "heuristic" | "vision"; now?: string },
): DesignProfile {
  if (analyses.length === 0) {
    throw new AnalysisError("分析する画像がありません");
  }

  const ordered = [...analyses].sort(
    (a, b) => a.analyzedAt.localeCompare(b.analyzedAt) || a.id.localeCompare(b.id),
  );
  const signals = ordered.map((item) => item.signals);
  const weights = recencyWeights(ordered.length);
  const metrics = metricsFrom(signals, weights);
  const { habits, conflicts } = collectHabits(signals, weights);
  const tendencies = habits.map(toTendency);
  const discovered = collectDiscovered(signals, weights, conflicts);
  const mood = collectMood(signals, weights);
  const colors = clusterProfileColors(signals, weights);
  const reading = buildReading(tendencies, metrics, colors, ordered.length, conflicts);
  const updatedAt = options?.now ?? new Date().toISOString();
  const sampleCount = ordered.length;

  const profile: DesignProfile = {
    version: 1,
    updatedAt,
    sampleCount,
    color: {
      main: colors.main,
      accent: colors.accent,
      background: colors.background,
      contrast: describeLevel(metrics.contrast, [
        [0.28, "強い。背景と手前の要素がはっきり分かれる"],
        [0.18, "はっきりしている。読める差はあるが極端ではない"],
        [0, "控えめ。近い明度の中でまとめている"],
      ]),
      saturation: describeLevel(metrics.saturation, [
        [0.45, "高い。色そのものが主張する"],
        [0.22, "中程度。必要なところだけ色が立つ"],
        [0, "抑えめ。色数を増やして賑やかにしていない"],
      ]),
      brightness: describeLevel(metrics.brightness, [
        [0.72, "明るめ"],
        [0.4, "中間"],
        [0, "暗め"],
      ]),
      notes: colorNotes(colors, metrics),
    },
    layout: layoutCopy(metrics, tendencies),
    typography: typeCopy(metrics, tendencies),
    visual: visualCopy(metrics, tendencies),
    mood,
    personal_tendencies: tendencies,
    avoid: tendencies
      .map((item) => AVOID[item.id])
      .filter((item): item is string => Boolean(item))
      .slice(0, 6),
    discovered,
    extensions: {},
    narrative: "",
    changelog: [],
    metrics,
    reading,
    analysisMode: options?.mode ?? "heuristic",
  };
  profile.narrative = writeNarrative(profile);
  profile.changelog = writeChangelog(previous, profile);
  profile.discovered = mergeDiscovered(profile.discovered, previous?.discovered);
  const keptVision = profile.discovered.some((item) => item.source === "vision");
  if (keptVision && profile.analysisMode !== "vision") {
    profile.extensions = {
      ...profile.extensions,
      visionNote: "計測は更新しました。以前ビジョンモデルが見つけた特徴は残しています。",
    };
  }
  return profile;
}

function toTendency(habit: Habit): PersonalTendency {
  return {
    id: habit.id,
    statement: habit.statement,
    evidence: habit.evidence,
    confidence: round(habit.confidence),
    category: habit.category,
    supportCount: habit.support.count,
    sampleCount: habit.support.total,
  };
}

function metricsFrom(signals: RawImageSignals[], weights: number[]): ProfileMetrics {
  const pick = (read: (signal: RawImageSignals) => number) =>
    round(weightedMean(signals.map(read), weights));
  return {
    brightness: pick((signal) => signal.brightness),
    saturation: pick((signal) => signal.saturation),
    contrast: pick((signal) => signal.contrast),
    whitespace: pick((signal) => signal.whitespace),
    density: pick((signal) => signal.density),
    symmetry: pick((signal) => signal.symmetry),
    photo: pick((signal) => signal.photoScore),
    illustration: pick((signal) => signal.illustrationScore),
    gradient: pick((signal) => signal.gradientScore),
    shadow: pick((signal) => signal.shadowScore),
    border: pick((signal) => signal.borderScore),
    text: pick((signal) => signal.textScore),
    titleDominance: pick((signal) => signal.titleDominance),
    verticalBalance: pick((signal) => signal.verticalBalance),
    horizontalBalance: pick((signal) => signal.horizontalBalance),
    warmCool: pick((signal) => signal.warmCool),
    backgroundRatio: pick((signal) => signal.backgroundRatio),
    paletteSize: pick((signal) => signal.uniqueColorCount),
    accentCount: pick((signal) => signal.accentColors.length),
  };
}

function collectHabits(signals: RawImageSignals[], weights: number[]): {
  habits: Habit[];
  conflicts: string[];
} {
  const conflicts: string[] = [];
  let order = 0;
  const make = (id: string, statement: string, category: string, flags: boolean[]) => {
    const support = measureSupport(flags, weights);
    const established = isEstablished(support);
    const provisional = isProvisional(support, flags);
    if (!established && !provisional) return null;
    const confidence = provisional ? Math.min(0.42, confidenceFrom(support)) : confidenceFrom(support);
    const habit: Habit = {
      id,
      statement,
      category,
      support,
      confidence,
      evidence: evidenceFor(support, provisional),
      order: order++,
    };
    return habit;
  };

  const flag = (read: (signal: RawImageSignals) => boolean) => signals.map(read);
  const rowShare = (signal: RawImageSignals, row: number) =>
    (signal.grid[row] ?? []).reduce((sum, value) => sum + value, 0);
  const maxCell = (signal: RawImageSignals) => Math.max(...signal.grid.flat(), 0);

  const chosen: Array<Habit | null> = [];
  const keepPair = (a: Habit | null, b: Habit | null, note: string) => {
    if (a && b && Math.abs(a.support.ratio - b.support.ratio) < 0.12) {
      conflicts.push(note);
      return;
    }
    chosen.push(a && b ? (a.support.ratio >= b.support.ratio ? a : b) : (a ?? b));
  };

  keepPair(
    make("layout.top", "画面の上部に主要な情報を集め、下側は空けている。", "layout", flag((signal) => rowShare(signal, 0) >= 0.4 && rowShare(signal, 0) > rowShare(signal, 1) && rowShare(signal, 0) > rowShare(signal, 2))),
    make("layout.bottom", "情報の重心を画面の下側に置いている。", "layout", flag((signal) => rowShare(signal, 2) >= 0.4 && rowShare(signal, 2) > rowShare(signal, 0))),
    "上下の重心は作品によって揺れている。",
  );
  keepPair(
    make("layout.left", "要素を左に寄せ、右に余白を残している。", "layout", flag((signal) => signal.horizontalBalance < -0.08)),
    make("layout.right", "要素を右に寄せ、左に余白を残している。", "layout", flag((signal) => signal.horizontalBalance > 0.08)),
    "左右の寄せ方は作品によって揺れている。",
  );
  keepPair(
    make("layout.center", "要素を中央に揃えて置いている。", "layout", flag((signal) => signal.symmetry > 0.8 && Math.abs(signal.horizontalBalance) < 0.12)),
    make("layout.asymmetric", "左右対称にせず、重心をどちらかへずらしている。", "layout", flag((signal) => signal.symmetry < 0.68)),
    "中央に揃えるか、重心をずらすかはまだ定まっていない。",
  );
  keepPair(
    make("layout.generous-space", "余白を大きく取り、要素を詰め込んでいない。", "layout", flag((signal) => signal.whitespace > 0.42)),
    make("layout.dense", "余白をあまり残さず、情報量を多く見せている。", "layout", flag((signal) => signal.whitespace < 0.28)),
    "余白の量は作品によって揺れている。",
  );
  chosen.push(
    make("layout.single-mass", "画面を等分せず、一つの塊に情報を集めている。", "layout", flag((signal) => maxCell(signal) >= 0.42)),
  );
  keepPair(
    make("color.high-contrast", "背景と前景の明度差を強くつけている。", "color", flag((signal) => signal.contrast > 0.22)),
    make("color.low-contrast", "明度差を抑え、近いトーンの中でまとめている。", "color", flag((signal) => signal.contrast < 0.14)),
    "コントラストの強さは作品によって揺れている。",
  );
  keepPair(
    make("color.muted", "彩度を抑え、色を増やして主張させていない。", "color", flag((signal) => signal.saturation < 0.24)),
    make("color.vivid", "彩度の高い色をはっきり使っている。", "color", flag((signal) => signal.saturation > 0.48)),
    "彩度の高さは作品によって揺れている。",
  );
  keepPair(
    make("color.dark-ground", "背景を暗く取り、暗いトーンを基調にしている。", "color", flag((signal) => signal.brightness < 0.4 && signal.background.lightness < 0.35)),
    make("color.light-ground", "背景を明るく取り、軽いトーンを基調にしている。", "color", flag((signal) => signal.brightness > 0.7 && signal.background.lightness > 0.75)),
    "明るさの基調は作品によって揺れている。",
  );
  chosen.push(
    make("color.single-accent", "アクセントカラーを一色に絞っている。", "color", flag((signal) => signal.accentColors.length === 1)),
  );
  chosen.push(
    make(
      "color.flat-background",
      "背景を写真やグラデーションにせず、単色で広く敷いている。",
      "color",
      flag((signal) => signal.backgroundRatio > 0.5 && signal.gradientScore < 0.3 && signal.photoScore < 0.45),
    ),
  );
  chosen.push(
    make("type.strong-scale", "大きな文字と小さな文字のサイズ差を大きく取っている。", "typography", flag((signal) => signal.titleDominance > 1.65 && signal.contrast > 0.18)),
  );
  chosen.push(
    make("type.text-led", "写真より文字のほうが画面の主役になっている。", "typography", flag((signal) => signal.textScore > 0.45 && signal.photoScore < 0.4)),
  );
  keepPair(
    make("visual.no-photo", "写真を使わず、色面と文字で成立させている。", "visual", flag((signal) => signal.photoScore < 0.32)),
    make("visual.photo-led", "写真を画面の主たるビジュアルにしている。", "visual", flag((signal) => signal.photoScore > 0.62)),
    "写真の使い方は作品によって揺れている。",
  );
  chosen.push(
    make(
      "visual.little-decoration",
      "影、グラデーション、枠などの装飾をほとんど足していない。",
      "visual",
      flag((signal) => signal.gradientScore < 0.28 && signal.shadowScore < 0.38 && signal.borderScore < 0.3 && signal.photoScore < 0.5),
    ),
  );
  chosen.push(make("visual.gradient", "背景や面にグラデーションを使っている。", "visual", flag((signal) => signal.gradientScore > 0.45)));
  chosen.push(make("visual.shadow", "要素に影をつけて面から浮かせている。", "visual", flag((signal) => signal.shadowScore > 0.55)));
  chosen.push(make("visual.border", "枠線で領域を区切っている。", "visual", flag((signal) => signal.borderScore > 0.4)));

  const habits = chosen
    .filter((item): item is Habit => item !== null)
    .sort((a, b) => b.confidence - a.confidence || a.order - b.order);
  const cap = signals.length === 1 ? 8 : 16;
  return { habits: habits.slice(0, cap), conflicts };
}

function collectDiscovered(
  signals: RawImageSignals[],
  weights: number[],
  conflicts: string[],
): DiscoveredTrait[] {
  const traits: DiscoveredTrait[] = [];
  const add = (id: string, label: string, detail: string, flags: boolean[]) => {
    const support = measureSupport(flags, weights);
    if (!isEstablished(support) && !isProvisional(support, flags)) return;
    const provisional = isProvisional(support, flags);
    traits.push({
      id,
      label,
      detail,
      confidence: round(provisional ? Math.min(0.4, confidenceFrom(support)) : confidenceFrom(support)),
      evidence: evidenceFor(support, provisional),
      source: "comparison",
    });
  };

  const quadrants = signals.map((signal) => quadrant(signal.inkCenter.x, signal.inkCenter.y));
  const dominant = modeOf(quadrants);
  if (dominant) {
    add(
      "composition.repeat",
      "繰り返される構図",
      `情報の重心が「${dominant}」に繰り返し置かれている。個別の題材が違っても、画面の中の置き場はあまり変えていない。`,
      signals.map((signal) => quadrant(signal.inkCenter.x, signal.inkCenter.y) === dominant),
    );
  }

  add(
    "relation.scale-and-air",
    "サイズ差と余白がセット",
    "大きな文字を置くとき、周囲の余白も一緒に残している。情報を足すのではなく、大小の落差で階層を作っている。",
    signals.map((signal) => signal.titleDominance > 1.5 && signal.whitespace > 0.4 && signal.photoScore < 0.45),
  );
  add(
    "relation.accent-discipline",
    "色を増やさない",
    "パレットを広げず、ベースの色と一箇所のアクセントで完結させている。新しい色は足さず、同じ関係を使い回している。",
    signals.map((signal) => signal.accentColors.length <= 1 && signal.uniqueColorCount <= 20),
  );
  add(
    "format.orientation",
    "画面比率の固定",
    `作品の比率が${orientationLabel(signals)}に揃っている。媒体が違っても、この比率の中で構図を考えている可能性がある。`,
    signals.map((signal) => signal.orientation === signals[0]?.orientation),
  );

  for (const conflict of conflicts) {
    traits.push({
      id: `conflict.${traits.length}`,
      label: "まだ揺れている点",
      detail: conflict,
      confidence: 0.45,
      evidence: `${signals.length}点を比較`,
      source: "comparison",
    });
  }

  return traits.filter((trait) => trait.id !== "format.orientation" || trait.confidence >= 0.55 || signals.length === 1).slice(0, 8);
}

function collectMood(signals: RawImageSignals[], weights: number[]): string[] {
  const candidates: Array<[string, boolean[]]> = [
    ["ダーク", signals.map((signal) => signal.brightness < 0.4)],
    ["明るい", signals.map((signal) => signal.brightness > 0.74)],
    ["ミニマル", signals.map((signal) => signal.saturation < 0.28 && signal.whitespace > 0.4 && signal.photoScore < 0.4)],
    ["シンプル", signals.map((signal) => signal.uniqueColorCount <= 16 && signal.whitespace > 0.38)],
    ["ポップ", signals.map((signal) => signal.saturation > 0.5 && signal.brightness > 0.45)],
    ["大胆", signals.map((signal) => signal.contrast > 0.24 && signal.titleDominance > 1.5)],
    ["高級感", signals.map((signal) => signal.brightness < 0.42 && signal.saturation < 0.32 && signal.contrast > 0.2 && signal.whitespace > 0.35)],
    ["未来的", signals.map((signal) => signal.gradientScore > 0.45 && signal.photoScore < 0.45)],
    ["かわいい", signals.map((signal) => signal.illustrationScore > 0.45 && signal.brightness > 0.6 && signal.saturation > 0.28 && signal.saturation < 0.7)],
    ["写真的", signals.map((signal) => signal.photoScore > 0.62)],
    ["落ち着いた", signals.map((signal) => signal.saturation < 0.3 && signal.contrast > 0.16 && signal.photoScore < 0.5)],
    ["暖色寄り", signals.map((signal) => signal.warmCool > 0.2)],
    ["寒色寄り", signals.map((signal) => signal.warmCool < -0.2)],
  ];
  return candidates
    .map(([label, flags]) => ({ label, support: measureSupport(flags, weights) }))
    .filter((item) => (item.support.total >= 2 ? item.support.ratio >= 0.5 && item.support.count >= 2 : item.support.count === 1))
    .sort((a, b) => b.support.ratio - a.support.ratio)
    .slice(0, 6)
    .map((item) => item.label);
}

function clusterProfileColors(signals: RawImageSignals[], weights: number[]): {
  background: string[];
  main: string[];
  accent: string[];
} {
  const background = cluster(
    signals.flatMap((signal, index) => [{ hex: signal.background.hex, weight: weights[index] ?? 1 }]),
  );
  const main = cluster(
    signals.flatMap((signal, index) => signal.mainColors.map((hex) => ({ hex, weight: weights[index] ?? 1 }))),
  );
  const accent = clusterAccents(
    signals.flatMap((signal, index) => signal.accentColors.map((hex) => ({ hex, weight: weights[index] ?? 1 }))),
  );
  return {
    background: background.slice(0, 2).map((item) => item.hex),
    main: main.slice(0, 3).map((item) => item.hex),
    accent: accent.slice(0, 3).map((item) => item.hex),
  };
}

function clusterAccents(entries: Array<{ hex: string; weight: number }>): Array<{ hex: string; weight: number }> {
  const groups: Array<{ hex: string; weight: number; lightness: number }> = [];
  for (const entry of entries) {
    const rgb = hexToRgb(entry.hex);
    if (!rgb) continue;
    const lightness = rgbToHsl(rgb.r, rgb.g, rgb.b).l;
    const found = groups.find((group) => sameHueFamily(group.hex, entry.hex));
    if (!found) {
      groups.push({ hex: entry.hex, weight: entry.weight, lightness });
      continue;
    }
    found.weight += entry.weight;
    if (lightness > found.lightness) {
      found.hex = entry.hex;
      found.lightness = lightness;
    }
  }
  return groups.sort((a, b) => b.weight - a.weight).map(({ hex, weight }) => ({ hex, weight }));
}

function cluster(entries: Array<{ hex: string; weight: number }>): Array<{ hex: string; weight: number }> {
  const groups: Array<{ r: number; g: number; b: number; weight: number }> = [];
  for (const entry of entries) {
    const rgb = hexToRgb(entry.hex);
    if (!rgb) continue;
    const found = groups.find((group) => hexDistance(rgbToHex(group), entry.hex) < 40);
    if (!found) {
      groups.push({ ...rgb, weight: entry.weight });
      continue;
    }
    const total = found.weight + entry.weight;
    found.r = (found.r * found.weight + rgb.r * entry.weight) / total;
    found.g = (found.g * found.weight + rgb.g * entry.weight) / total;
    found.b = (found.b * found.weight + rgb.b * entry.weight) / total;
    found.weight = total;
  }
  return groups
    .sort((a, b) => b.weight - a.weight)
    .map((group) => ({ hex: rgbToHex(group), weight: group.weight }));
}

function buildReading(
  tendencies: PersonalTendency[],
  metrics: ProfileMetrics,
  colors: { background: string[]; main: string[]; accent: string[] },
  sampleCount: number,
  conflicts: string[],
): DesignProfile["reading"] {
  const has = (id: string) => tendencies.some((item) => item.id === id);
  const background = colors.background[0] ? describeColor(colors.background[0]) : "背景色";
  const main = colors.main[0] ? describeColor(colors.main[0]) : "手前の色";
  const accent = colors.accent[0] ? describeColor(colors.accent[0]) : "";

  const layout = [
    has("layout.generous-space") ? "余白が土台になっている。" : metrics.whitespace > 0.32 ? "余白は残すが、詰め込みすぎてはいない。" : "情報を比較的密に置いている。",
    has("layout.top") ? "その上に、情報の塊を画面の上部へ一つ乗せている。" : has("layout.bottom") ? "情報の塊は下に落ちている。" : "情報の上下位置は中央付近も混ざる。",
    has("layout.asymmetric") || has("layout.left") || has("layout.right")
      ? "左右は対称に整えず、重心をずらして置いている。"
      : has("layout.center")
        ? "左右は中央に揃えて安定させている。"
        : "左右の揃えは作品ごとに少し動く。",
    has("type.strong-scale") ? "視線は大きな文字から、その下の小さい情報へ一段だけ落ちる。" : "",
  ]
    .filter(Boolean)
    .join("");

  const color = [
    has("color.flat-background") ? `${background}の単色を広く残している。` : `背景は${background}が基調。`,
    colors.main[0] ? `手前は${main}で読ませる。` : "",
    has("color.single-accent") && accent
      ? `アクセントは${accent}の一色に絞り、小さな印か一行だけに使う。`
      : accent
        ? `差し色は${accent}。`
        : "差し色はほとんど足していない。",
    has("color.high-contrast") ? "色を増やすより、明度差で階層を作っている。" : "",
  ]
    .filter(Boolean)
    .join("");

  const typography = [
    has("type.strong-scale")
      ? "見出しは画面に対して大きく、補足はその数分の一に落としている。"
      : "見出しと補足のサイズ差は極端ではない。",
    has("type.text-led") ? "写真や図より、文字の大小がデザインの本体になっている。" : "文字は情報として置くが、画面全体の主役とまでは言えない。",
    sampleCount < 2 ? "字間や行間の数値は、1点だけでは癖として言えない。" : "字間そのものは画像から断定できない。見出しは短く大きく、行間は塊ごとに空いている、という関係で扱う。",
  ].join("");

  const visual = [
    has("visual.no-photo") ? "写真は使わず、平坦な色面と文字で成立させている。" : has("visual.photo-led") ? "写真が画面の主体で、文字はその上に乗っている。" : "写真とフラットな要素が混ざることがある。",
    has("visual.little-decoration") ? "影もグラデーションもほぼ無く、装飾はアクセントの短い線か小さな印に限っている。" : "装飾は主題を邪魔しない範囲に留まっている。",
    metrics.illustration > 0.45 ? "イラストレーションの面が比較的多い。" : "",
  ]
    .filter(Boolean)
    .join("");

  const signatureParts = [
    has("color.dark-ground") ? "暗い単色" : has("color.light-ground") ? "明るい地" : background,
    has("layout.top") ? "上に置いた大きな文字" : has("layout.center") ? "中央のまとまり" : "ずらした重心",
    has("layout.generous-space") ? "広い余白" : "",
  ].filter(Boolean);

  return {
    signature: signatureParts.join("、"),
    relationships: { color, layout, typography, visual },
    conflicts,
  };
}

function writeNarrative(profile: DesignProfile): string {
  const count = profile.sampleCount;
  const moods = profile.mood.slice(0, 3);
  const lead = moods.length
    ? `${count}点を並べると、印象は「${moods.join("」「")}」に寄る。`
    : `${count}点を並べて、繰り返している置き方を見ている。`;
  const top = profile.personal_tendencies[0];
  const habit = top
    ? count < 2
      ? `いま言えるのはこの1点の特徴で、${top.statement}`
      : `特に繰り返しているのは、${top.statement.replace(/。$/, "")}ことだ（${top.evidence}）。`
    : "まだ作品同士で強く一致する行動は少ない。";
  const relation = profile.reading.relationships.layout;
  const caution =
    count < 2
      ? "もう数点あると、この作品だけの特徴と、本人が繰り返している癖を分けられる。"
      : "ここにあるのは、本人が指定していなくても複数の作品に残っている共通点である。";
  return [lead, habit, relation, caution].filter(Boolean).join("");
}

function writeChangelog(previous: DesignProfile | null, next: DesignProfile): string[] {
  if (!previous) return ["はじめての作品群からプロファイルを作りました。"];
  const lines: string[] = [];
  if (next.sampleCount > previous.sampleCount) {
    lines.push(`新しい${next.sampleCount - previous.sampleCount}点を加え、全${next.sampleCount}点で傾向を更新しました。過去の作品は消さず、新しい作品が重心を少し動かします。`);
  } else if (next.sampleCount < previous.sampleCount) {
    lines.push(`作品が${previous.sampleCount - next.sampleCount}点減ったので、残った${next.sampleCount}点で傾向を組み直しました。`);
  } else {
    lines.push(`登録済みの${next.sampleCount}点から傾向を更新しました。`);
  }
  const previousIds = new Set(previous.personal_tendencies.map((item) => item.id));
  const nextIds = new Set(next.personal_tendencies.map((item) => item.id));
  for (const item of next.personal_tendencies) {
    if (!previousIds.has(item.id)) lines.push(`新たに見えた癖: ${item.statement}`);
  }
  for (const item of previous.personal_tendencies) {
    if (!nextIds.has(item.id)) lines.push(`弱まった特徴: ${item.statement}`);
  }
  const whitespaceDelta = next.metrics.whitespace - previous.metrics.whitespace;
  if (Math.abs(whitespaceDelta) >= 0.08) {
    lines.push(whitespaceDelta > 0 ? "余白は以前より広く取る方向に動いています。" : "余白は以前より詰まる方向に動いています。");
  }
  const brightnessDelta = next.metrics.brightness - previous.metrics.brightness;
  if (Math.abs(brightnessDelta) >= 0.08) {
    lines.push(brightnessDelta > 0 ? "全体の明度は明るく寄りました。" : "全体の明度は暗く寄りました。");
  }
  if (lines.length === 1) lines.push("大きな傾向の入れ替わりはありません。");
  return lines.slice(0, 6);
}

function mergeDiscovered(fresh: DiscoveredTrait[], previous: DiscoveredTrait[] | undefined): DiscoveredTrait[] {
  const byId = new Map(fresh.map((item) => [item.id, item]));
  for (const item of previous ?? []) {
    if (item.source === "vision" && !byId.has(item.id)) {
      byId.set(item.id, { ...item, confidence: round(item.confidence * 0.92) });
    }
  }
  return [...byId.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}

function layoutCopy(metrics: ProfileMetrics, tendencies: PersonalTendency[]): DesignProfile["layout"] {
  const has = (id: string) => tendencies.some((item) => item.id === id);
  return {
    alignment: has("layout.center")
      ? "中央揃えが多い"
      : has("layout.left")
        ? "左寄せが多い"
        : has("layout.right")
          ? "右寄せが多い"
          : has("layout.asymmetric")
            ? "左右非対称"
            : "揃え方は混合",
    spacing: has("layout.generous-space")
      ? "余白を大きく取る"
      : has("layout.dense")
        ? "余白は少なめ"
        : metrics.whitespace > 0.34
          ? "余白は中程度"
          : "余白は状況によって変わる",
    density: has("layout.dense") ? "要素の密度は高い" : has("layout.generous-space") ? "要素の密度は低い" : "密度は中程度",
    composition: has("layout.single-mass")
      ? "一つの塊に情報を集める構図"
      : "複数の塊に情報が分かれることがある",
    vertical: has("layout.top") ? "上に情報を寄せる" : has("layout.bottom") ? "下に情報を寄せる" : "上下は中央付近も含めて混合",
    horizontal: has("layout.left") ? "左に寄せる" : has("layout.right") ? "右に寄せる" : has("layout.center") ? "左右の中央" : "左右は混合",
    grid: has("layout.single-mass")
      ? "等分グリッドには乗せない。大きな塊と余白で組む"
      : metrics.symmetry > 0.78
        ? "おおむね整列した区切り"
        : "厳密なグリッドより、重心の位置で組んでいる",
  };
}

function typeCopy(metrics: ProfileMetrics, tendencies: PersonalTendency[]): DesignProfile["typography"] {
  const has = (id: string) => tendencies.some((item) => item.id === id);
  return {
    style: has("type.text-led") ? "ゴシック体の強い見出しが似合う、文字主導の組み" : "文字は情報として置き、極端な装飾書体は見て取れない",
    title_size: has("type.strong-scale") || metrics.titleDominance > 1.7 ? "画面に対して大きい" : metrics.titleDominance > 1.3 ? "やや大きい" : "本文との差は控えめ",
    body_size: has("type.strong-scale") ? "見出しのおよそ四分の一から五分の一まで落とす想定" : "見出しとの差は中程度",
    weight: metrics.contrast > 0.24 && metrics.titleDominance > 1.5 ? "見出しは太く使う頻度が高い" : "太さは中程度。極太と極細の振り幅は断定できない",
    spacing: "字間の正確な値は画像から断定できない。見出しは短く、追跡するように広げすぎない",
    line_height: has("layout.generous-space") ? "行間と塊の間隔はゆったり。見出しの行間だけは詰め気味でよい" : "行間は標準からやや広め",
    title_placement: has("layout.top")
      ? "タイトルは画面上部"
      : has("layout.center")
        ? "タイトルは中央付近"
        : "タイトル位置は作品によって動く",
  };
}

function visualCopy(metrics: ProfileMetrics, tendencies: PersonalTendency[]): DesignProfile["visual"] {
  const has = (id: string) => tendencies.some((item) => item.id === id);
  return {
    photo: has("visual.photo-led") ? "写真を主に使う" : has("visual.no-photo") ? "写真はほとんど使わない" : metrics.photo > 0.4 ? "写真と図版が混ざる" : "写真は補助的",
    illustration: metrics.illustration > 0.5 ? "イラストの面が出ることがある" : "イラストより、色面と文字が中心",
    icon: has("color.single-accent") ? "独立したアイコンセットは見当たらない。小さな印はアクセントカラーの一点" : "アイコンを並べる構成ではない",
    shape: has("visual.little-decoration") ? "単純な矩形と線。角丸の多いカードUIにはしない" : "図形はあっても主張は控えめ",
    gradient: has("visual.gradient") ? "グラデーションを使う" : "グラデーションはほぼ使わない",
    shadow: has("visual.shadow") ? "影で浮かせる" : "ドロップシャドウはほぼ使わない",
    border: has("visual.border") ? "枠線で区切る" : "枠線はほぼ使わない",
    decoration: has("visual.little-decoration") ? "装飾は最小限" : metrics.gradient + metrics.shadow + metrics.border > 0.8 ? "装飾が複数重なる" : "装飾は部分的",
  };
}

function colorNotes(
  colors: { background: string[]; main: string[]; accent: string[] },
  metrics: ProfileMetrics,
): string[] {
  const notes: string[] = [];
  if (colors.background[0]) notes.push(`背景の基調は${describeColor(colors.background[0])}`);
  if (colors.main[0]) notes.push(`手前の主色は${describeColor(colors.main[0])}`);
  if (colors.accent.length === 1) notes.push(`アクセントは${describeColor(colors.accent[0])}に絞る`);
  if (metrics.warmCool > 0.15) notes.push("全体は暖色に寄る");
  if (metrics.warmCool < -0.15) notes.push("全体は寒色に寄る");
  return notes;
}

function describeLevel(value: number, bands: Array<[number, string]>): string {
  for (const [threshold, label] of bands) {
    if (value >= threshold) return label;
  }
  return bands[bands.length - 1]?.[1] ?? "";
}

function quadrant(x: number, y: number): string {
  const horizontal = x < 0.4 ? "左" : x > 0.6 ? "右" : "中央";
  const vertical = y < 0.4 ? "上" : y > 0.6 ? "下" : "中段";
  if (horizontal === "中央" && vertical === "中段") return "中央";
  if (horizontal === "中央") return vertical;
  if (vertical === "中段") return horizontal;
  return `${horizontal}${vertical}`;
}

function modeOf(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  if (!best || bestCount / values.length < 0.6) return null;
  return best;
}

function orientationLabel(signals: RawImageSignals[]): string {
  const value = signals[0]?.orientation;
  if (value === "portrait") return "縦長";
  if (value === "landscape") return "横長";
  return "正方形に近い比率";
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function tendencyById(profile: DesignProfile, id: string): PersonalTendency | undefined {
  return profile.personal_tendencies.find((item) => item.id === id);
}

export type { StyleRelationships };
