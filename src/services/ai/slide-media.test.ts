import { describe, expect, it } from "vitest";
import { attachCommonsMedia, citationFrom } from "./commons";
import type { SlideRole } from "./slide-roles";
import { planSlideRoles, roleSection, segmentManuscript } from "./slide-roles";
import { searchQuery, suggestSlideMedia, wantsWebMedia } from "./slide-media";

describe("slide media", () => {
  it("keeps a feeling slide free of photos and gives an ant a picture", () => {
    const empathy = suggestSlideMedia({
      text: "みなさんはきっと、虫が苦手だと思っている",
      role: "empathy",
    });
    const ant = suggestSlideMedia({ text: "クロオオアリ", role: "title" });
    expect(empathy.kind).toBe("none");
    expect(empathy.placement).toContain("置かない");
    expect(ant.kind).toBe("image");
    expect(ant.query).toBe("クロオオアリ");
    expect(ant.placement).toContain("クロオオアリ");
    expect(searchQuery("見ているのはアリの社会性だ")).toBe("アリ");
    expect(searchQuery("巣穴の動画を一つ見せる")).toBe("巣穴");
    expect(searchQuery("取られにくい印を見つける")).toBe("");
    expect(ant.placement).toContain("一つ");
  });

  it("holds the picture until the transition that reveals it", () => {
    const hold = suggestSlideMedia({
      text: "できるだけ長く生存させる",
      role: "title",
      transition: "hold",
      transitionAdds: "見ているのはアリの社会性だ",
    });
    const reveal = suggestSlideMedia({
      text: "できるだけ長く生存させる\n見ているのはアリの社会性だ",
      role: "context",
      transition: "reveal",
      transitionAdds: "見ているのはアリの社会性だ",
    });
    expect(hold.kind).toBe("none");
    expect(hold.placement).toContain("次の切り替え");
    expect(reveal.kind).toBe("image");
    expect(reveal.query).toBe("アリ");
    expect(reveal.sound).toContain("効果音");
  });

  it("cites a video link already written in the manuscript", () => {
    const cue = suggestSlideMedia({
      text: "NHKの映像 https://www2.nhk.or.jp/archives/movies/?id=1",
      role: "context",
    });
    expect(cue.kind).toBe("video");
    expect(cue.citation?.sourceUrl).toContain("id=1");
    const plan = planSlideRoles(segmentManuscript("映像は https://www2.nhk.or.jp/archives/movies/?id=1 です。").slides, {
      purpose: "映像を見せる",
      audience: "同学年",
    });
    expect(plan.slides.some((slide) => slide.media?.citation?.sourceUrl?.includes("id=1"))).toBe(true);
    expect(cue.citation?.license).toContain("利用条件");
    expect(wantsWebMedia("ネットから画像を取って")).toBe(true);
    expect(wantsWebMedia("表紙が説明になっている")).toBe(false);
  });

  it("puts the citation in the role section before layout", async () => {
    const { generateCanvaPrompt } = await import("./prompt");
    const plan = planSlideRoles(
      [{ id: "v", text: "巣の動画 https://commons.wikimedia.org/wiki/File:Ant.webm" }],
      { purpose: "アリの巣を見せる", audience: "同学年" },
    );
    const slide = plan.slides[0];
    expect(slide?.media?.kind).toBe("video");
    const section = roleSection(slide!, 1);
    expect(section).toContain("引用:");
    expect(section).toContain("commons.wikimedia.org");
    const result = await generateCanvaPrompt({
      profile: null,
      brief: {
        purpose: "アリの巣を見せる",
        audience: "同学年",
        copyText: "",
        size: "",
        mood: "",
        imagery: "",
        notes: "",
      },
      styleStrength: 0,
      slideRole: slide,
      slideCount: 1,
    });
    expect(result.prompt.indexOf("引用:")).toBeGreaterThan(result.prompt.indexOf("【このスライドの役割】"));
    expect(result.prompt.indexOf("引用:")).toBeLessThan(result.prompt.indexOf("【レイアウト】"));
  });
});

describe("commons citations", () => {
  it("keeps a credited commons file and drops a file without a license", () => {
    const kept = citationFrom(
      {
        title: "File:Ant.jpg",
        imageinfo: [
          {
            url: "https://upload.wikimedia.org/ant.jpg",
            thumburl: "https://upload.wikimedia.org/thumb.jpg",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Ant.jpg",
            mime: "image/jpeg",
            extmetadata: {
              Artist: { value: "<a href=\"https://example.test\">Ada</a>" },
              LicenseShortName: { value: "CC BY-SA 4.0" },
              ObjectName: { value: "Ant" },
            },
          },
        ],
      },
      "image",
    );
    expect(kept?.creator).toBe("Ada");
    expect(kept?.license).toBe("CC BY-SA 4.0");
    expect(kept?.sourceUrl).toContain("commons.wikimedia.org");
    expect(
      citationFrom(
        {
          imageinfo: [
            {
              url: "https://upload.wikimedia.org/private.jpg",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:Private.jpg",
              mime: "image/jpeg",
              extmetadata: { LicenseShortName: { value: "All rights reserved" } },
            },
          ],
        },
        "image",
      ),
    ).toBeNull();
  });

  it("searches images and videos only, and skips a one-character query", async () => {
    const calls: string[] = [];
    const slides = [
      slide("sound", "効果音"),
      slide("image", "印"),
      slide("image", "アリ"),
      slide("video", "巣穴"),
    ];
    const next = await attachCommonsMedia(slides, async (input) => {
      const url = new URL(String(input));
      calls.push(String(input));
      const sr = decodeURIComponent(url.searchParams.get("srsearch") ?? "");
      if (url.searchParams.get("list") === "search") {
        const term = sr.match(/"([^"]+)"/)?.[1] ?? "";
        const video = sr.includes("filetype:video");
        return Response.json({
          query: { search: [{ title: `File:${term}.${video ? "webm" : "jpg"}`, snippet: term }] },
        });
      }
      const title = decodeURIComponent(url.searchParams.get("titles") ?? "");
      return Response.json({
        query: {
          pages: {
            "1": {
              title,
              imageinfo: [
                {
                  url: "https://upload.wikimedia.org/sample",
                  descriptionurl: "https://commons.wikimedia.org/wiki/File:Sample.jpg",
                  mime: title.endsWith(".webm") ? "video/webm" : "image/jpeg",
                  extmetadata: {
                    Artist: { value: "Ada" },
                    LicenseShortName: { value: "CC BY 4.0" },
                  },
                },
              ],
            },
          },
        },
      });
    });
    expect(calls).toHaveLength(4);
    const decoded = calls.map((url) => decodeURIComponent(url));
    expect(decoded.some((url) => url.includes("filetype:bitmap"))).toBe(true);
    expect(decoded.some((url) => url.includes("filetype:video"))).toBe(true);
    expect(decoded.some((url) => url.includes("印"))).toBe(false);
    expect(next[0]?.media?.citation).toBeUndefined();
    expect(next[1]?.media?.citation).toBeUndefined();
    expect(next[2]?.media?.citation?.creator).toBe("Ada");
    expect(next[3]?.media?.citation?.license).toBe("CC BY 4.0");
  });

  it("does not cite a video that never names the query", async () => {
    const [only] = await attachCommonsMedia([slide("video", "巣穴")], async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("list") === "search") {
        return Response.json({
          query: { search: [{ title: "File:Black hole.webm", snippet: "stellar black hole" }] },
        });
      }
      throw new Error("imageinfo should not be requested");
    });
    expect(only?.media?.citation).toBeUndefined();
  });
});

function slide(kind: "image" | "video" | "sound", query: string): SlideRole {
  return {
    id: query,
    index: 1,
    role: "context",
    roleLabel: "説明",
    text: query,
    audienceBefore: "",
    audienceAfter: "",
    job: "",
    logic: "",
    expression: "",
    designConsequence: "",
    media: { kind, label: kind, placement: "置く", query },
  };
}
