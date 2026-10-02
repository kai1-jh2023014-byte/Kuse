import type { DesignProfile } from "./types";

export type TasteKind = "keep" | "fix";

export interface TasteEvent {
  id: string;
  at: string;
  kind: TasteKind;
  text: string;
  theme: string;
  versionId?: string;
  slideId?: string;
}

export interface TasteNote {
  id: string;
  theme: string;
  kind: TasteKind;
  text: string;
  count: number;
  lastAt: string;
}

export interface TasteMemory {
  events: TasteEvent[];
  notes: TasteNote[];
}

const THEMES: Array<{ id: string; keys: string[] }> = [
  { id: "type", keys: ["文字", "見出し", "タイトル", "フォント", "タイポ", "読み"] },
  { id: "space", keys: ["余白", "間隔", "すきま", "スペース", "詰め"] },
  { id: "color", keys: ["色", "カラー", "アクセント", "背景", "配色"] },
  { id: "layout", keys: ["配置", "構図", "揃え", "中央", "レイアウト", "重心"] },
  { id: "flow", keys: ["流れ", "順番", "表紙", "着地", "並列", "山", "役割"] },
  { id: "density", keys: ["多い", "少ない", "情報", "ごちゃ", "シンプル"] },
];

const MAX_EVENTS = 80;
const MAX_NOTES = 16;

export function emptyTasteMemory(): TasteMemory {
  return { events: [], notes: [] };
}

export function asTasteMemory(value: unknown): TasteMemory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyTasteMemory();
  const record = value as { events?: unknown; notes?: unknown };
  const events = Array.isArray(record.events)
    ? record.events
        .map((item) => readEvent(item))
        .filter((item): item is TasteEvent => Boolean(item))
        .slice(-MAX_EVENTS)
    : [];
  const notes = Array.isArray(record.notes)
    ? record.notes
        .map((item) => readNote(item))
        .filter((item): item is TasteNote => Boolean(item))
        .slice(0, MAX_NOTES)
    : [];
  return rebuildNotes({ events, notes: notes.length ? notes : [] });
}

export function tasteTheme(text: string): string {
  const raw = text.trim();
  for (const theme of THEMES) {
    if (theme.keys.some((key) => raw.includes(key))) return theme.id;
  }
  return "other";
}

export function recordTaste(
  memory: TasteMemory,
  input: {
    kind: TasteKind;
    text: string;
    versionId?: string;
    slideId?: string;
    at?: string;
  },
): TasteMemory {
  const text = input.text.trim().slice(0, 400);
  if (input.kind === "fix" && !text) return memory;
  const at = input.at ?? new Date().toISOString();
  const theme = tasteTheme(text || "方向");
  const event: TasteEvent = {
    id: `taste-${at}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    kind: input.kind,
    text: text || "この方向性は自分らしい",
    theme,
    versionId: input.versionId,
    slideId: input.slideId,
  };
  return rebuildNotes({
    events: [...memory.events, event].slice(-MAX_EVENTS),
    notes: memory.notes,
  });
}

export function mergeTaste(base: TasteMemory, extra: TasteMemory | null | undefined): TasteMemory {
  if (!extra?.events.length && !extra?.notes.length) return base;
  const seen = new Set(base.events.map((item) => item.id));
  const events = [...base.events];
  for (const event of extra.events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    events.push(event);
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  return rebuildNotes({ events: events.slice(-MAX_EVENTS), notes: [] });
}

export function tasteAccuracy(memory: TasteMemory): {
  turns: number;
  keepCount: number;
  fixCount: number;
  strongest: number;
} {
  const keepCount = memory.events.filter((item) => item.kind === "keep").length;
  const fixCount = memory.events.filter((item) => item.kind === "fix").length;
  return {
    turns: memory.events.length,
    keepCount,
    fixCount,
    strongest: memory.notes.reduce((max, note) => Math.max(max, note.count), 0),
  };
}

/** Prompt block. Repeated notes come first so later generations lean on history, not only the last comment. */
export function tasteSection(memory: TasteMemory | null | undefined): string {
  if (!memory || memory.notes.length === 0) return "";
  const accuracy = tasteAccuracy(memory);
  const keep = memory.notes.filter((note) => note.kind === "keep").sort((a, b) => b.count - a.count);
  const fix = memory.notes.filter((note) => note.kind === "fix").sort((a, b) => b.count - a.count);
  const lines = [
    "【これまでのフィードバック】",
    `指摘と承認を${accuracy.turns}回積み上げています。回数が多い項目ほど優先してください。直近の一言だけで、前の指摘を忘れないでください。`,
  ];
  if (fix.length) {
    lines.push("繰り返して直してほしいこと:");
    for (const note of fix.slice(0, 8)) {
      lines.push(`- (${note.count}回) ${note.text}`);
    }
  }
  if (keep.length) {
    lines.push("残してほしいこと:");
    for (const note of keep.slice(0, 6)) {
      lines.push(`- (${note.count}回) ${note.text}`);
    }
  }
  return lines.join("\n");
}

/**
 * After the same kind of note appears twice, fold it into the durable profile
 * so later decks start closer, not only the next Canva call.
 */
export function absorbTasteIntoProfile(profile: DesignProfile, memory: TasteMemory, now = new Date().toISOString()): DesignProfile {
  const strong = memory.notes.filter((note) => note.count >= 2);
  if (strong.length === 0) return profile;
  let avoid = [...profile.avoid];
  let discovered = [...profile.discovered];
  const personal = profile.personal_tendencies.map((item) => ({ ...item }));
  const added: string[] = [];

  for (const note of strong) {
    if (note.kind === "fix") {
      const line = `${note.text}（ユーザー指摘 ${note.count}回）`;
      const exists = avoid.some((item) => item.includes(note.text.slice(0, 18)) || item.startsWith(note.text.slice(0, 12)));
      if (!exists) {
        avoid = [line, ...avoid].slice(0, 14);
        added.push(note.text);
      }
    } else {
      const id = `taste.${note.theme}.${note.kind}`;
      const detail = `${note.text}（承認 ${note.count}回）`;
      const known = discovered.find((item) => item.id === id);
      if (known) {
        discovered = discovered.map((item) =>
          item.id === id
            ? { ...item, detail, confidence: Math.min(0.95, 0.55 + note.count * 0.08), evidence: `フィードバック${note.count}回` }
            : item,
        );
      } else {
        discovered = [
          {
            id,
            label: themeLabel(note.theme),
            detail,
            confidence: Math.min(0.92, 0.55 + note.count * 0.08),
            evidence: `フィードバック${note.count}回`,
            source: "comparison" as const,
          },
          ...discovered,
        ].slice(0, 14);
        added.push(note.text);
      }
      for (const item of personal) {
        if (item.category.includes(note.theme) || note.text.includes(item.statement.slice(0, 8))) {
          item.supportCount += 1;
          item.confidence = Math.min(0.98, item.confidence + 0.04);
        }
      }
    }
  }

  if (added.length === 0 && discovered === profile.discovered && avoid === profile.avoid) return profile;
  return {
    ...profile,
    updatedAt: now,
    avoid,
    discovered,
    personal_tendencies: personal,
    changelog: [
      `${now.slice(0, 10)}: 繰り返されたフィードバックから精度を上げた（${strong.map((note) => `${note.count}回`).join("、")}）。`,
      ...profile.changelog,
    ].slice(0, 10),
  };
}

export function applyTasteTurn(input: {
  memory: TasteMemory;
  profile: DesignProfile | null;
  kind: TasteKind;
  text: string;
  versionId?: string;
  slideId?: string;
}): { memory: TasteMemory; profile: DesignProfile | null } {
  const memory = recordTaste(input.memory, input);
  const profile = input.profile ? absorbTasteIntoProfile(input.profile, memory) : input.profile;
  return { memory, profile };
}

function rebuildNotes(memory: TasteMemory): TasteMemory {
  const buckets = new Map<string, TasteNote>();
  for (const event of memory.events) {
    const key = `${event.kind}.${event.theme}`;
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, {
        id: key,
        theme: event.theme,
        kind: event.kind,
        text: event.text,
        count: 1,
        lastAt: event.at,
      });
      continue;
    }
    current.count += 1;
    current.lastAt = event.at;
    if (event.text.length >= current.text.length) current.text = event.text;
  }
  const notes = [...buckets.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt)).slice(0, MAX_NOTES);
  return { events: memory.events, notes };
}

function themeLabel(theme: string): string {
  if (theme === "type") return "文字の扱い";
  if (theme === "space") return "余白";
  if (theme === "color") return "色";
  if (theme === "layout") return "配置";
  if (theme === "flow") return "発表の流れ";
  if (theme === "density") return "情報量";
  return "方向性";
}

function readEvent(value: unknown): TasteEvent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== "keep" && record.kind !== "fix") return null;
  if (typeof record.text !== "string" || !record.text.trim()) return null;
  return {
    id: typeof record.id === "string" ? record.id.slice(0, 80) : `taste-${Math.random().toString(36).slice(2, 10)}`,
    at: typeof record.at === "string" ? record.at : new Date().toISOString(),
    kind: record.kind,
    text: record.text.trim().slice(0, 400),
    theme: typeof record.theme === "string" ? record.theme : tasteTheme(record.text),
    versionId: typeof record.versionId === "string" ? record.versionId : undefined,
    slideId: typeof record.slideId === "string" ? record.slideId : undefined,
  };
}

function readNote(value: unknown): TasteNote | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== "keep" && record.kind !== "fix") return null;
  if (typeof record.text !== "string") return null;
  const count = typeof record.count === "number" && Number.isFinite(record.count) ? Math.max(1, Math.round(record.count)) : 1;
  return {
    id: typeof record.id === "string" ? record.id : `${record.kind}.other`,
    theme: typeof record.theme === "string" ? record.theme : "other",
    kind: record.kind,
    text: record.text.trim().slice(0, 400),
    count,
    lastAt: typeof record.lastAt === "string" ? record.lastAt : new Date().toISOString(),
  };
}
