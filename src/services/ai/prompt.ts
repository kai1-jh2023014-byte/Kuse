import { describeColor } from "./color";
import { AnalysisError } from "./errors";
import { craftSection, isPresentationJob, slideCopy, type DeckSummary } from "./presentation-craft";
import { tendencyById } from "./profile";
import { polishPrompt, providerMode } from "./provider";
import { roleSection, type SlideRole } from "./slide-roles";
import type { DesignBrief, DesignProfile, PromptModifiers, PromptResult } from "./types";

const EMPTY_MODIFIERS: PromptModifiers = {
  simplicity: 0,
  impact: 0,
  textEmphasis: 0,
  whitespace: 0,
  custom: "",
};

export async function generateCanvaPrompt(input: {
  profile: DesignProfile | null;
  brief: DesignBrief;
  styleStrength: number;
  modifiers?: PromptModifiers;
  slideRole?: SlideRole | null;
  slideCount?: number;
  deck?: DeckSummary | null;
  critique?: string;
}): Promise<PromptResult> {
  const styleStrength = clamp(input.styleStrength);
  const slideRole = input.slideRole ?? null;
  const slideCount = input.slideCount;
  const draft = renderPrompt({
    profile: input.profile,
    brief: input.brief,
    styleStrength,
    modifiers: withCritique(input.modifiers ?? EMPTY_MODIFIERS, input.critique),
    slideRole,
    slideCount,
    deck: input.deck ?? null,
  });
  if (providerMode() !== "vision") {
    return { prompt: draft, mode: "heuristic", styleStrength };
  }
  try {
    const prompt = keepRole(
      await polishPrompt({
        draft,
        brief: input.brief,
        styleStrength,
        profile: input.profile,
      }),
      slideRole,
      slideCount,
    );
    if (!prompt.includes("【目的】")) return { prompt: draft, mode: "heuristic", styleStrength };
    return { prompt, mode: "vision", styleStrength };
  } catch {
    return { prompt: draft, mode: "heuristic", styleStrength };
  }
}

export async function refinePrompt(input: {
  profile: DesignProfile | null;
  brief: DesignBrief;
  styleStrength: number;
  currentPrompt: string;
  instruction: string;
  slideRole?: SlideRole | null;
  slideCount?: number;
  deck?: DeckSummary | null;
}): Promise<PromptResult> {
  const instruction = input.instruction.trim();
  if (!instruction) throw new AnalysisError("調整の内容を書いてください");
  const interpreted = interpretInstruction(instruction, input.styleStrength, Boolean(input.profile));
  const result = await generateCanvaPrompt({
    profile: input.profile,
    brief: input.brief,
    styleStrength: interpreted.strength,
    modifiers: interpreted.modifiers,
    slideRole: input.slideRole,
    slideCount: input.slideCount,
    deck: input.deck,
    critique: instruction,
  });
  if (!input.profile && /自分らし/.test(instruction)) {
    const note =
      "【まだ反映できないこと】\n自分らしさを上げる指示でしたが、デザインプロファイルがまだありません。過去の作品を分析してから、もう一度生成してください。";
    return { ...result, prompt: `${result.prompt}\n\n${note}` };
  }
  return result;
}

export function interpretInstruction(
  instruction: string,
  baseStrength: number,
  hasProfile: boolean,
): { strength: number; modifiers: PromptModifiers } {
  let strength = clamp(baseStrength);
  const modifiers: PromptModifiers = { ...EMPTY_MODIFIERS, custom: instruction };
  if (/自分らし/.test(instruction) && hasProfile) strength = Math.min(100, strength + 25);
  if (/シンプル|削|少なく|整理/.test(instruction)) modifiers.simplicity += 1;
  if (/インパクト|大胆|強く|目立つ/.test(instruction)) modifiers.impact += 1;
  if (/文字|タイポ|見出し|タイトル/.test(instruction)) modifiers.textEmphasis += 1;
  if (/余白|すきま|スペース/.test(instruction)) modifiers.whitespace += 1;
  return { strength, modifiers };
}

export function renderPrompt(input: {
  profile: DesignProfile | null;
  brief: DesignBrief;
  styleStrength: number;
  modifiers: PromptModifiers;
  slideRole?: SlideRole | null;
  slideCount?: number;
  deck?: DeckSummary | null;
}): string {
  const strength = clamp(input.styleStrength);
  const fidelity = strength / 100;
  const personal = Boolean(input.profile) && fidelity >= 0.2;
  const talk =
    Boolean(input.deck && input.slideRole) &&
    isPresentationJob(input.brief.purpose, input.brief.size, input.slideCount ?? input.deck?.slides.length ?? 0);
  const sections = [
    preamble(input.profile, fidelity, personal),
    purposeSection(input.brief, input.slideRole),
    input.slideRole ? roleSection(input.slideRole, input.slideCount ?? input.slideRole.index + 1) : "",
    talk && input.deck && input.slideRole ? craftSection({ deck: input.deck, slide: input.slideRole }) : "",
    layoutSection(input.profile, input.brief, fidelity, personal, input.modifiers),
    colorSection(input.profile, input.brief, fidelity, personal),
    typeSection(input.profile, fidelity, personal, input.modifiers),
    visualSection(input.profile, input.brief, fidelity, personal, input.modifiers),
    moodSection(input.profile, input.brief, fidelity, personal),
    avoidSection(input.profile, input.brief, fidelity, personal),
    adjustmentSection(input.modifiers, input.profile),
    strengthSection(strength, personal, Boolean(input.profile)),
  ];
  return sections.filter(Boolean).join("\n\n");
}

function preamble(profile: DesignProfile | null, fidelity: number, personal: boolean): string {
  if (!profile || !personal) {
    return "Canva AIへのデザイン指示です。個人の過去作には寄せず、今回の目的に対して明快で、一般的に読みやすいデザインにしてください。";
  }
  if (fidelity >= 0.85) {
    return `Canva AIへのデザイン指示です。一般的なテンプレートの雰囲気には寄せないでください。この人の過去${profile.sampleCount}点に繰り返し現れている組み立て方を、できる限り再現してください。色の名前を並べるより、余白・文字の大小・情報の重心の関係を守ることが先です。`;
  }
  if (fidelity >= 0.5) {
    return `Canva AIへのデザイン指示です。今回の目的が内容を決め、見せ方にはこの人の過去${profile.sampleCount}点の傾向を反映してください。`;
  }
  return `Canva AIへのデザイン指示です。目的に合った読みやすさを優先し、個人の傾向は軽い参照に留めてください。過去${profile.sampleCount}点の雰囲気だけを遠景に置きます。`;
}

function withCritique(modifiers: PromptModifiers, critique?: string): PromptModifiers {
  const note = critique?.trim();
  if (!note) return modifiers;
  const extra = modifiers.custom ? `${modifiers.custom}\nこの枚への修正: ${note}` : `この枚への修正: ${note}`;
  return { ...modifiers, custom: extra };
}

function purposeSection(brief: DesignBrief, slideRole?: SlideRole | null): string {
  const lines = [brief.purpose.endsWith("。") ? brief.purpose : `${brief.purpose}。`];
  if (brief.audience) lines.push(`想定する読み手は${brief.audience}。`);
  const talk = isPresentationJob(brief.purpose, brief.size, slideRole ? 2 : 0);
  lines.push(
    talk
      ? `サイズは${brief.size || "16:9（発表）"}。この1枚は横位置の発表スライド1ページです。`
      : brief.size
        ? `サイズは${brief.size}。この比率の中で構図を組んでください。`
        : "サイズ指定はないので、内容が読みやすい比率にしてください。",
  );
  const copy = slideRole ? slideCopy(slideRole.text) : brief.copyText;
  if (copy) {
    lines.push(
      slideRole
        ? "次の文字を、優先順位が分かる大きさで配置してください。文言は改変しないでください。この1枚に載せる文はこれだけです。"
        : "次の文字を、優先順位が分かる大きさで配置してください。文言は改変しないでください。",
    );
    lines.push(copy);
  } else {
    lines.push("確定した文言はまだありません。短い見出しと一行の補足が入る余白を残してください。");
  }
  if (brief.notes) lines.push(`その他の要望: ${brief.notes}`);
  return `【目的】\n${lines.join("\n")}`;
}

function layoutSection(
  profile: DesignProfile | null,
  brief: DesignBrief,
  fidelity: number,
  personal: boolean,
  modifiers: PromptModifiers,
): string {
  if (!profile || !personal) {
    return `【レイアウト】\n「${brief.purpose}」として、最初に目に入る場所を一つ決めてください。情報を均等に散らさず、大きいまとまりと小さい補足で階層を作ってください。端まで埋めず、読み手が息をできる余白を残してください。`;
  }
  const relation = profile.reading.relationships.layout;
  const evidence = habitLine(profile, ["layout.top", "layout.bottom", "layout.left", "layout.generous-space", "layout.asymmetric", "layout.center", "layout.single-mass"], fidelity);
  const flow = profile.personal_tendencies
    .filter((item) => item.category === "flow")
    .slice(0, fidelity >= 0.5 ? 2 : 0)
    .map((item) => `${item.statement}（${item.evidence}）`);
  const strict =
    fidelity >= 0.75
      ? "今回の内容が増えても、この重心の置き方は崩さないでください。均等割りや、テンプレート通りの中央揃えに戻さないでください。"
      : "この置き方を土台にし、今回の内容が読み切れる範囲で調整してください。";
  const extra: string[] = [];
  if (modifiers.whitespace > 0) {
    extra.push("今回の調整として、いつもの余白よりさらに広く取ってください。要素の間隔を開き、足さなくてよい情報は削ってください。");
  }
  if (modifiers.simplicity > 0) {
    extra.push("構成要素を減らし、見出しと最小限の補足だけが残る配置にしてください。");
  }
  return ["【レイアウト】", relation, evidence, ...flow, strict, ...extra].filter(Boolean).join("\n");
}

function colorSection(
  profile: DesignProfile | null,
  brief: DesignBrief,
  fidelity: number,
  personal: boolean,
): string {
  if (!profile || !personal) {
    const mood = brief.mood ? `希望する雰囲気は「${brief.mood}」です。` : "";
    return `【カラー】\n目的に合う、読みやすい配色にしてください。${mood}色数は抑え、文字と背景のコントラストだけは確保してください。アクセントは一色までにしてください。`;
  }
  const useHex = fidelity >= 0.72;
  const background = colorPhrase(profile.color.background, useHex);
  const main = colorPhrase(profile.color.main, useHex);
  const accent = colorPhrase(profile.color.accent, useHex);
  const lines = [profile.reading.relationships.color];
  if (background) lines.push(`背景は${background}を維持してください。`);
  if (main) lines.push(`文字や手前の面は${main}。`);
  if (accent) {
    lines.push(
      profile.personal_tendencies.some((item) => item.id === "color.single-accent")
        ? `アクセントは${accent}に絞り、線・日付・小さな印のいずれか一箇所に限ってください。ほかの色を足して賑やかにしないでください。`
        : `差し色は${accent}の範囲に留めてください。`,
    );
  }
  lines.push(`彩度は${profile.color.saturation}`);
  lines.push(`コントラストは${profile.color.contrast}`);
  if (fidelity >= 0.85) {
    lines.push("新しい色を提案して個性を出そうとしないでください。この人の色は、関係が狭いことに特徴があります。");
  }
  return `【カラー】\n${lines.filter(Boolean).join("\n")}`;
}

function typeSection(
  profile: DesignProfile | null,
  fidelity: number,
  personal: boolean,
  modifiers: PromptModifiers,
): string {
  if (!profile || !personal) {
    const emphasis = modifiers.textEmphasis
      ? "文字を最優先で目立たせてください。写真や図より先に見出しが読めるようにし、文字の周りに余白を残してください。"
      : "見出し、補足、日付の三段階が区別できる大きさにしてください。";
    return `【タイポグラフィ】\n${emphasis}見出しは太めのゴシック、補足は細すぎないゴシックにしてください。`;
  }
  const type = profile.typography;
  const lines = [
    profile.reading.relationships.typography,
    `見出しの大きさは${type.title_size}。本文との関係は「${type.body_size}」。`,
    `太さは${type.weight}。`,
    `配置は${type.title_placement}。字間は${type.spacing}。行間は${type.line_height}。`,
  ];
  const scale = tendencyById(profile, "type.strong-scale");
  if (scale && fidelity >= 0.5) lines.push(`${scale.statement}（${scale.evidence}）`);
  if (modifiers.textEmphasis > 0) {
    lines.push("今回の調整として、文字をさらに主役にしてください。図や写真が文字より前に出ないようにし、見出しのサイズを一段上げてください。");
  }
  if (modifiers.impact > 0) {
    lines.push("今回の調整として、見出しのサイズと太さをさらに上げ、第一印象で目が止まる落差を作ってください。");
  }
  if (fidelity < 0.5) {
    return `【タイポグラフィ】\n${lines[0]}\n見出しと補足の区別はつけつつ、過去作の比率を厳密には再現しなくて構いません。`;
  }
  return `【タイポグラフィ】\n${lines.join("\n")}`;
}

function visualSection(
  profile: DesignProfile | null,
  brief: DesignBrief,
  fidelity: number,
  personal: boolean,
  modifiers: PromptModifiers,
): string {
  const hope = brief.imagery
    ? personal && fidelity >= 0.7
      ? `入れたい画像の希望は「${brief.imagery}」。この希望が過去の傾向と衝突する場合は、自分の傾向を優先し、希望は最小限だけ取り入れてください。`
      : `入れたい画像の希望は「${brief.imagery}」。今回はこの希望を優先してください。`
    : "";
  if (!profile || !personal) {
    return ["【ビジュアル】", "写真、イラスト、図形のどれを使うかは目的に合わせて一つに決めてください。飾り、影、枠を重ねないでください。", hope]
      .filter(Boolean)
      .join("\n");
  }
  const lines = [profile.reading.relationships.visual, hope];
  if (modifiers.simplicity > 0) {
    lines.push("今回の調整として、飾り・影・余分な図形をさらに削り、より単純な面と文字にしてください。");
  }
  if (fidelity >= 0.6) {
    lines.push(`写真: ${profile.visual.photo}。イラスト: ${profile.visual.illustration}。図形: ${profile.visual.shape}。`);
    lines.push(`グラデーション: ${profile.visual.gradient}。シャドウ: ${profile.visual.shadow}。枠線: ${profile.visual.border}。`);
  }
  return `【ビジュアル】\n${lines.filter(Boolean).join("\n")}`;
}

function moodSection(profile: DesignProfile | null, brief: DesignBrief, fidelity: number, personal: boolean): string {
  const requested = brief.mood ? `今回希望する雰囲気は「${brief.mood}」。` : "";
  if (!profile || !personal) {
    return `【雰囲気】\n${requested || "落ち着いて信頼でき、内容がすぐ伝わる雰囲気にしてください。"}可愛さや未来感を足す必要はありません。内容のトーンに合わせてください。`;
  }
  const moods = profile.mood.join("、");
  const blend =
    fidelity >= 0.75
      ? `過去作の印象（${moods || profile.reading.signature}）を主にし、希望する雰囲気は言葉ではなく温度だけ合わせてください。`
      : `過去作の印象（${moods || profile.reading.signature}）を下地にし、希望する雰囲気をその上に乗せてください。`;
  return `【雰囲気】\n${requested}\n${blend}\nこの人の作品は「${profile.reading.signature}」として記憶されています。別の作家のテンプレートに見える仕上げは避けてください。`;
}

function avoidSection(profile: DesignProfile | null, brief: DesignBrief, fidelity: number, personal: boolean): string {
  if (!profile || !personal || fidelity < 0.35) {
    return "【避けること】\n文字が背景に溶けること。情報の優先順位が分からないこと。飾りだけで内容が伝わらないこと。";
  }
  const job = `${brief.purpose} ${brief.size ?? ""}`;
  const slideJob = /スライド|プレゼン|発表/.test(job) && !/サムネ|YouTube|youtube|ポスター/i.test(job);
  const items = profile.avoid
    .filter((item) => slideJob || !/スライド/.test(item))
    .slice(0, fidelity >= 0.75 ? 6 : 3);
  if (items.length === 0) {
    return "【避けること】\nこの人の作品に無い要素を、賑やかさのために足さないでください。";
  }
  return `【避けること】\n${items.map((item) => `・${item}`).join("\n")}`;
}

function adjustmentSection(modifiers: PromptModifiers, profile: DesignProfile | null): string {
  if (!modifiers.custom) return "";
  return [
    "【今回の調整】",
    `追加指示: ${modifiers.custom}`,
    profile
      ? "既存のデザインの癖は土台のまま残し、この指示はその上の差分として反映してください。癖と矛盾するときも、癖を消さずに、指示された方向へ一段だけ動かしてください。"
      : "この指示を、今回の目的に直接反映してください。",
  ].join("\n");
}

function strengthSection(strength: number, personal: boolean, hasProfile: boolean): string {
  const guide =
    strength <= 5
      ? "個人の過去作は参照せず、一般的なデザインにしてください。"
      : strength < 40
        ? "少しだけ自分の雰囲気を混ぜてください。"
        : strength < 65
          ? "自分のスタイルの骨格を反映してください。"
          : strength < 90
            ? "一般的な型より、自分の組み立て方を優先してください。"
            : "できる限り、自分の過去作を見た人が同じ人の仕事だと分かるところまで再現してください。";
  const missing = !hasProfile && strength > 10 ? "プロファイルがまだないため、実際に反映できる自分らしさはありません。" : "";
  const unused = hasProfile && !personal ? "強度が低いため、計測した癖は本文に展開していません。" : "";
  return ["【自分らしさの強度】", `${strength} / 100。${guide}`, missing, unused].filter(Boolean).join("\n");
}

function habitLine(profile: DesignProfile, ids: string[], fidelity: number): string {
  if (fidelity < 0.35) return "";
  const limit = fidelity >= 0.8 ? 4 : fidelity >= 0.5 ? 3 : 1;
  const lines = ids
    .map((id) => tendencyById(profile, id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, limit)
    .map((item) => `${item.statement.replace(/。$/, "")}（${item.evidence}）。`);
  return lines.join("\n");
}

function colorPhrase(colors: string[], useHex: boolean): string {
  if (colors.length === 0) return "";
  return colors
    .slice(0, 2)
    .map((hex) => (useHex ? `${describeColor(hex)}（${hex}）` : describeColor(hex)))
    .join("と");
}

function keepRole(prompt: string, role: SlideRole | null, slideCount: number | undefined): string {
  if (!role || prompt.includes("【このスライドの役割】")) return prompt;
  const section = roleSection(role, slideCount ?? role.index + 1);
  const layoutAt = prompt.indexOf("【レイアウト】");
  if (layoutAt < 0) return `${section}\n\n${prompt}`;
  return `${prompt.slice(0, layoutAt).trimEnd()}\n\n${section}\n\n${prompt.slice(layoutAt)}`;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 75;
  return Math.min(100, Math.max(0, Math.round(value)));
}
