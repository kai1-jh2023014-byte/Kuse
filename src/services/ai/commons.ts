import type { MediaCitation, MediaKind, SlideMedia } from "./slide-media";
import type { SlideRole } from "./slide-roles";

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const AGENT = "KUSE/0.1 (slide study; attribution required)";

interface CommonsInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  mime?: string;
  extmetadata?: Record<string, { value?: string }>;
}

interface CommonsPage {
  title?: string;
  imageinfo?: CommonsInfo[];
}

export async function attachCommonsMedia(slides: SlideRole[], fetchImpl: typeof fetch = fetch): Promise<SlideRole[]> {
  const cache = new Map<string, MediaCitation | null>();
  const next: SlideRole[] = [];
  for (const slide of slides) {
    const media = slide.media;
    if (!canSearch(media)) {
      next.push(slide);
      continue;
    }
    const key = `${media.kind}:${media.query}`;
    if (!cache.has(key)) cache.set(key, await searchCommons(media.query, media.kind, fetchImpl));
    const citation = cache.get(key);
    next.push(citation ? { ...slide, media: { ...media, citation } } : slide);
  }
  return next;
}

export function canSearch(media: SlideMedia | undefined): media is SlideMedia {
  if (!media || media.citation || !media.query || media.query.trim().length < 2) return false;
  return media.kind === "image" || media.kind === "video";
}

interface SearchHit {
  title?: string;
  snippet?: string;
}

export async function searchCommons(
  query: string,
  kind: MediaKind,
  fetchImpl: typeof fetch = fetch,
): Promise<MediaCitation | null> {
  if (kind === "none" || !query.trim()) return null;
  const titles = await searchTitles(query, kind, fetchImpl);
  if (titles.length === 0) return null;
  const url = new URL(COMMONS);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("titles", titles.join("|"));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata|mime");
  url.searchParams.set("iiurlwidth", "480");
  const response = await fetchImpl(url, {
    headers: { "User-Agent": AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  const pages = Object.values(payload.query?.pages ?? {});
  for (const title of titles) {
    const page = pages.find((item) => item.title === title);
    const citation = page ? citationFrom(page, kind) : null;
    if (citation) return citation;
  }
  return null;
}

async function searchTitles(query: string, kind: MediaKind, fetchImpl: typeof fetch): Promise<string[]> {
  const filetype = kind === "video" ? "video" : kind === "sound" ? "audio" : "bitmap";
  const url = new URL(COMMONS);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", `"${query}" filetype:${filetype}`);
  url.searchParams.set("srnamespace", "6");
  url.searchParams.set("srlimit", "8");
  const response = await fetchImpl(url, {
    headers: { "User-Agent": AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as { query?: { search?: SearchHit[] } };
  return (payload.query?.search ?? [])
    .filter((hit) => {
      if (kind !== "video") return Boolean(hit.title);
      const haystack = `${hit.title ?? ""} ${strip(hit.snippet ?? "")}`;
      return haystack.includes(query);
    })
    .map((hit) => hit.title ?? "")
    .filter(Boolean);
}

function strip(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

export function citationFrom(page: CommonsPage, kind: MediaKind): MediaCitation | null {
  const info = page.imageinfo?.[0];
  if (!info?.url || !info.descriptionurl) return null;
  const mime = info.mime ?? "";
  if (kind === "image" && !mime.startsWith("image/")) return null;
  if (kind === "video" && !mime.startsWith("video/")) return null;
  if (kind === "sound" && !mime.startsWith("audio/")) return null;
  const license = plain(info.extmetadata?.LicenseShortName?.value ?? "");
  if (!/cc|public domain|pd|cc0|gfdl/i.test(license)) return null;
  const creator = plain(info.extmetadata?.Artist?.value ?? "") || "作者不明";
  const title = plain(info.extmetadata?.ObjectName?.value ?? "") || (page.title ?? "").replace(/^File:/, "");
  return {
    title: title.slice(0, 120),
    creator: creator.slice(0, 120),
    license,
    sourceUrl: info.descriptionurl,
    fileUrl: info.url,
    ...(info.thumburl ? { thumbUrl: info.thumburl } : {}),
  };
}

function plain(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function citedSlides(slides: Array<{ media?: SlideMedia }>): MediaCitation[] {
  const seen = new Set<string>();
  const citations: MediaCitation[] = [];
  for (const slide of slides) {
    const citation = slide.media?.citation;
    if (!citation || seen.has(citation.sourceUrl)) continue;
    seen.add(citation.sourceUrl);
    citations.push(citation);
  }
  return citations;
}
