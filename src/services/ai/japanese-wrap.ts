/** Break Japanese only at meaning units. Never split 変わる into 変わ / る. */

const BREAK_STRONG = /[、。！？]/;
const BREAK_PARTICLE = /[はがをに]/;
const BREAK_WEAK = /[でとものへや]/;
const BAD_TAIL = /^[るりっんーぁぃぅぇぉゃゅょ]/;

export function wrapJapanese(text: string, maxPerLine = 12): string {
  const compact = text.replace(/\s+/g, "").trim();
  if (!compact) return "";
  const lines = breakUnits(compact, maxPerLine);
  return lines.join("\n");
}

export function breakUnits(text: string, maxPerLine: number): string[] {
  if (text.length <= maxPerLine) return [text];
  const lines: string[] = [];
  let rest = text;
  while (rest.length > maxPerLine) {
    const at = findBreak(rest, maxPerLine);
    lines.push(rest.slice(0, at));
    rest = rest.slice(at);
  }
  if (rest) lines.push(rest);
  return mergeOrphans(lines);
}

function findBreak(text: string, max: number): number {
  const limit = Math.min(max, text.length - 2);
  const floor = Math.max(4, Math.floor(max * 0.45));
  for (const match of [BREAK_STRONG, BREAK_PARTICLE, BREAK_WEAK]) {
    for (let index = limit; index >= floor; index -= 1) {
      const ch = text[index - 1] ?? "";
      const next = text[index] ?? "";
      if (match.test(ch) && !BAD_TAIL.test(next)) return index;
    }
  }
  for (let index = limit; index >= floor; index -= 1) {
    const next = text[index] ?? "";
    if (!BAD_TAIL.test(next) && !isInsideWord(text, index)) return index;
  }
  return Math.max(floor, text.length - 2);
}

function isInsideWord(text: string, index: number): boolean {
  const left = text[index - 1] ?? "";
  const right = text[index] ?? "";
  if (/[ぁ-ん]/.test(left) && /[ぁ-ん]/.test(right)) return true;
  if (/[ァ-ヶー]/.test(left) && /[ァ-ヶー]/.test(right)) return true;
  if (/[一-龯]/.test(left) && /[ぁ-ん]/.test(right)) return true;
  return false;
}

function mergeOrphans(lines: string[]): string[] {
  const out = [...lines];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const line = out[index] ?? "";
    if (line.length <= 2 || BAD_TAIL.test(line)) {
      out[index - 1] = `${out[index - 1] ?? ""}${line}`;
      out.splice(index, 1);
    }
  }
  return out;
}

export function forbidsMidWordWrap(title: string): boolean {
  return !/変わ\nる|教育\nの|学校\n教/.test(title);
}
