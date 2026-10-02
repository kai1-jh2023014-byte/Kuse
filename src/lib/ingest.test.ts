import { describe, expect, it } from "vitest";
import { filesFromZipArchive } from "./ingest";
import { isImageFileName, isPdfFile, isZipLike } from "./library";
import { zipStore } from "./unzip";

const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (char) => char.charCodeAt(0),
);

describe("library ingest", () => {
  it("recognizes documents that should expand into many images", () => {
    expect(isPdfFile(new File([], "deck.pdf", { type: "application/pdf" }))).toBe(true);
    expect(isZipLike(new File([], "works.pptx"))).toBe(true);
    expect(isZipLike(new File([], "pack.zip"))).toBe(true);
    expect(isImageFileName("ppt/media/image1.jpeg")).toBe(true);
    expect(isImageFileName("notes.txt")).toBe(false);
  });

  it("pulls raster files out of a zip or pptx-like archive", async () => {
    const zipped = zipStore({
      "ppt/media/hero.png": PNG,
      "ppt/slides/slide1.xml": new Uint8Array([1, 2, 3]),
      "__MACOSX/._hero.png": PNG,
    });
    const files = await filesFromZipArchive(zipped, "brand.pptx");
    expect(files).toHaveLength(1);
    expect(files[0].name).toContain("hero.png");
  });
});
